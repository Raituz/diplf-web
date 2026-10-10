/**
 * DIP LF - Rastreo de Pedidos y Guía de Órdenes en Tiempo Real
 * Permite a los clientes consultar el estado en vivo de sus compras
 */

(function() {
  'use strict';

  let currentTrackedOrder = null;
  let trackingPollInterval = null;

  // Inicialización al cargar la página
  function initOrderTracking() {
    const form = document.getElementById('orderTrackingForm');
    const input = document.getElementById('orderSearchInput');

    if (form) {
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        const query = (input?.value || '').trim();
        if (query) {
          trackOrderById(query);
        }
      });
    }

    // Escuchar eventos de nuevos pedidos creados en la web
    window.addEventListener('diplf_new_order', function(e) {
      if (e.detail && e.detail.id) {
        localStorage.setItem('diplf_last_order_id', e.detail.id);
      }
    });

    // Cargar automáticamente el último pedido del usuario si existe en localStorage o URL
    checkAutoLoadOrder();
  }

  // Comprobar parámetros de URL o localStorage para auto-cargar
  function checkAutoLoadOrder() {
    let orderToLoad = null;

    // 1. Por parámetro en la URL (?orden=ORD-123456 o #ordenes?id=ORD-123456)
    const urlParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    if (urlParams.get('orden')) {
      orderToLoad = urlParams.get('orden');
    } else if (urlParams.get('order')) {
      orderToLoad = urlParams.get('order');
    } else if (hash.includes('id=')) {
      orderToLoad = hash.split('id=')[1].split('&')[0];
    }

    // 2. Por último pedido guardado en este navegador
    if (!orderToLoad) {
      try {
        orderToLoad = localStorage.getItem('diplf_last_order_id');
      } catch (_) {}
    }

    if (orderToLoad) {
      const input = document.getElementById('orderSearchInput');
      if (input && !input.value) {
        input.value = orderToLoad;
      }
      trackOrderById(orderToLoad, false); // Cargar sin scroll agresivo
    }
  }

  // Buscar orden por ID, Cédula o Teléfono
  window.trackOrderById = async function(query, shouldScroll = true) {
    if (!query) return;
    const cleanQuery = String(query).trim();
    const container = document.getElementById('orderTrackingResult');
    if (!container) return;

    // Mostrar estado de carga
    container.innerHTML = `
      <div class="tracking-loading-state">
        <div class="tracking-spinner">⏳</div>
        <p>Buscando orden <strong>${escapeTrackHtml(cleanQuery)}</strong> en el sistema...</p>
      </div>
    `;

    if (shouldScroll) {
      container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    let foundOrder = null;
    let foundMultiple = [];

    // 1. Intentar consultar servidor Alwaysdata
    try {
      const apiUrl = (typeof getWebhookServerUrl === 'function') ? getWebhookServerUrl() : 'https://diplf.alwaysdata.net';
      
      // Probar GET /api/orders/:id primero
      const res = await fetch(`${apiUrl}/api/orders/${encodeURIComponent(cleanQuery)}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(4500)
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.order) {
          foundOrder = data.order;
        }
      } else {
        // Probar búsqueda por teléfono, cédula o referencia: GET /api/orders?search=...
        const searchRes = await fetch(`${apiUrl}/api/orders?search=${encodeURIComponent(cleanQuery)}`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(4500)
        });
        if (searchRes.ok) {
          const sData = await searchRes.json();
          if (sData.orders && sData.orders.length === 1) {
            foundOrder = sData.orders[0];
          } else if (sData.orders && sData.orders.length > 1) {
            foundMultiple = sData.orders;
          }
        }
      }
    } catch (err) {
      console.warn('Consulta de orden a la nube falló, buscando en almacenamiento local:', err.message);
    }

    // 2. Si no se encontró en la nube o no hubo red, buscar en localStorage
    if (!foundOrder && foundMultiple.length === 0) {
      try {
        const localOrders = (typeof getOrders === 'function') ? getOrders() : JSON.parse(localStorage.getItem('diplf_orders') || '[]');
        const qLower = cleanQuery.toLowerCase();
        const qDigits = cleanQuery.replace(/[^0-9]/g, '');

        const matches = localOrders.filter(o => 
          (o.id && o.id.toLowerCase() === qLower) ||
          (qDigits.length >= 5 && o.id && o.id.replace(/[^0-9]/g, '') === qDigits) ||
          (qDigits.length >= 7 && o.customerPhone && o.customerPhone.replace(/[^0-9]/g, '').includes(qDigits)) ||
          (qDigits.length >= 6 && o.customerId && o.customerId.replace(/[^0-9]/g, '') === qDigits) ||
          (qDigits.length >= 4 && o.paymentDetails?.reference && String(o.paymentDetails.reference).includes(qDigits))
        );

        if (matches.length === 1) {
          foundOrder = matches[0];
        } else if (matches.length > 1) {
          foundMultiple = matches;
        }
      } catch (_) {}
    }

    // Renderizar resultados
    if (foundOrder) {
      currentTrackedOrder = foundOrder;
      localStorage.setItem('diplf_last_order_id', foundOrder.id);
      renderOrderCard(foundOrder);
      startLivePolling(foundOrder.id);
    } else if (foundMultiple.length > 0) {
      renderMultipleOrdersList(foundMultiple, cleanQuery);
    } else {
      renderOrderNotFound(cleanQuery);
    }
  };

  // Renderizar Tarjeta Completa de Orden y Stepper
  function renderOrderCard(order) {
    const container = document.getElementById('orderTrackingResult');
    if (!container) return;

    const rate = (typeof getBcvRate === 'function') ? getBcvRate() : 395.00;
    const totalBs = order.paymentDetails?.amountBs || Number((order.totalPrice * rate).toFixed(2));
    const formattedBs = `Bs. ${Number(totalBs).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const st = order.status || 'nuevo';
    const isCancelled = st === 'cancelado';

    // Determinar paso activo del Stepper (1 a 4)
    let activeStep = 1;
    if (st === 'en_preparacion') activeStep = 2;
    else if (st === 'listo_entrega') activeStep = 3;
    else if (st === 'entregado') activeStep = 4;
    else activeStep = 1; // 'pagado', 'nuevo', 'pendiente'

    let html = `
      <div class="tracking-order-card">
        
        <!-- Header de la Orden -->
        <div class="tracking-card-header">
          <div class="order-title-group">
            <span class="tracking-guia-label">GUÍA DE PEDIDO:</span>
            <div class="order-id-copy-wrap">
              <h3 class="tracking-order-number">#${escapeTrackHtml(order.id)}</h3>
              <button type="button" class="btn-copy-order-id" onclick="window.copyOrderTrackingId('${escapeTrackHtml(order.id)}')" title="Copiar número de orden">
                📋 Copiar
              </button>
            </div>
          </div>

          <div class="order-meta-badges">
            <span class="tracking-status-badge badge-${st}">
              <span class="status-pulse-dot"></span>
              <span>${formatTrackStatusLabel(st)}</span>
            </span>
            <span class="tracking-date-label">
              📅 ${escapeTrackHtml(order.dateFormatted || order.date)}
            </span>
          </div>
        </div>

        <!-- Stepper Visual de Estado en Tiempo Real -->
        ${isCancelled ? `
          <div class="tracking-cancelled-banner">
            <span class="cancelled-icon">⚠️</span>
            <div>
              <strong>Esta orden fue cancelada.</strong>
              <p>Si consideras que es un error, por favor comunícate directamente con nosotros por WhatsApp.</p>
            </div>
          </div>
        ` : `
          <div class="tracking-stepper-box">
            <div class="stepper-progress-bar" style="--step-percent: ${((activeStep - 1) / 3) * 100}%">
              <div class="stepper-progress-fill"></div>
            </div>

            <div class="stepper-steps-grid">
              <!-- Paso 1 -->
              <div class="stepper-step ${activeStep >= 1 ? 'completed' : ''} ${activeStep === 1 ? 'current' : ''}">
                <div class="step-circle">${activeStep > 1 ? '✓' : '1'}</div>
                <div class="step-labels">
                  <span class="step-title">Recibido</span>
                  <span class="step-desc">${order.verifiedBySms ? 'Pago Verificado' : 'Registrado'}</span>
                </div>
              </div>

              <!-- Paso 2 -->
              <div class="stepper-step ${activeStep >= 2 ? 'completed' : ''} ${activeStep === 2 ? 'current' : ''}">
                <div class="step-circle">${activeStep > 2 ? '✓' : '2'}</div>
                <div class="step-labels">
                  <span class="step-title">En Preparación</span>
                  <span class="step-desc">En cocina artesanal</span>
                </div>
              </div>

              <!-- Paso 3 -->
              <div class="stepper-step ${activeStep >= 3 ? 'completed' : ''} ${activeStep === 3 ? 'current' : ''}">
                <div class="step-circle">${activeStep > 3 ? '✓' : '3'}</div>
                <div class="step-labels">
                  <span class="step-title">Listo para Entrega</span>
                  <span class="step-desc">Empacado / Delivery</span>
                </div>
              </div>

              <!-- Paso 4 -->
              <div class="stepper-step ${activeStep >= 4 ? 'completed' : ''} ${activeStep === 4 ? 'current' : ''}">
                <div class="step-circle">4</div>
                <div class="step-labels">
                  <span class="step-title">Entregado</span>
                  <span class="step-desc">¡Disfruta tus salsas!</span>
                </div>
              </div>
            </div>
          </div>
        `}

        <!-- Información del Cliente y Método de Pago -->
        <div class="tracking-details-grid">
          
          <!-- Bloque Cliente -->
          <div class="tracking-info-pill">
            <div class="info-pill-header">
              <span class="pill-icon">👤</span>
              <span class="pill-title">Datos del Cliente</span>
            </div>
            <div class="info-pill-body">
              <p><strong>Nombre:</strong> ${escapeTrackHtml(order.customerName || 'Cliente Web')}</p>
              ${order.customerId ? `<p><strong>Cédula / RIF:</strong> ${escapeTrackHtml(order.customerId)}</p>` : ''}
              ${order.customerPhone ? `<p><strong>Teléfono:</strong> ${escapeTrackHtml(order.customerPhone)}</p>` : ''}
            </div>
          </div>

          <!-- Bloque Pago -->
          <div class="tracking-info-pill">
            <div class="info-pill-header">
              <span class="pill-icon">💳</span>
              <span class="pill-title">Forma de Pago</span>
            </div>
            <div class="info-pill-body">
              ${order.paymentMethod === 'pago_movil' ? `
                <p><strong>Método:</strong> Pago Móvil (Instantáneo)</p>
                <p><strong>Banco:</strong> ${escapeTrackHtml(order.paymentDetails?.originBank || 'Banco Nacional')}</p>
                <p><strong>Referencia:</strong> <span class="ref-highlight">${escapeTrackHtml(order.paymentDetails?.reference || 'N/A')}</span></p>
                <p><strong>Monto:</strong> <span class="bs-highlight">${formattedBs}</span> ($${(order.totalPrice || 0).toFixed(2)} USD)</p>
              ` : `
                <p><strong>Método:</strong> Coordinación vía WhatsApp</p>
                <p><strong>Total Estimado:</strong> $${(order.totalPrice || 0).toFixed(2)} USD (${formattedBs})</p>
                <p><strong>Estado:</strong> Coordinando entrega directa</p>
              `}
            </div>
          </div>

        </div>

        <!-- Detalle de Productos del Pedido -->
        <div class="tracking-products-section">
          <h4 class="products-section-title">🥣 Detalle de Salsas Encargadas</h4>
          <div class="tracking-items-table-wrap">
            <table class="tracking-items-table">
              <thead>
                <tr>
                  <th>Salsa</th>
                  <th>Tamaño</th>
                  <th>Cantidad</th>
                  <th style="text-align: right;">Precio</th>
                </tr>
              </thead>
              <tbody>
                ${(order.items || []).map(item => `
                  <tr>
                    <td>
                      <div class="item-name-cell">
                        <span class="salsa-dot"></span>
                        <strong>${escapeTrackHtml(item.name || item.flavorName)}</strong>
                      </div>
                    </td>
                    <td><span class="item-size-badge">${escapeTrackHtml(item.sizeName || item.sizeKey)}</span></td>
                    <td><strong>x${item.quantity}</strong></td>
                    <td style="text-align: right; color: var(--gold-primary); font-weight: 700;">
                      $${((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- Fila de Totales -->
          <div class="tracking-totals-footer">
            <div class="totals-count-info">
              <span>Total de unidades: <strong>${order.totalCount || 0} salsas</strong></span>
            </div>
            <div class="totals-amount-info">
              <span class="totals-label">TOTAL ORDEN:</span>
              <span class="totals-usd">$${(order.totalPrice || 0).toFixed(2)} USD</span>
              <span class="totals-bs">${formattedBs}</span>
            </div>
          </div>
        </div>

        <!-- Acciones Inferiores: Coordinación por WhatsApp y Refrescar -->
        <div class="tracking-actions-bar">
          <button type="button" class="btn-track-whatsapp-coord" onclick="window.openTrackOrderWhatsapp()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
            </svg>
            <span>💬 Coordinar Entrega / Delivery por WhatsApp</span>
          </button>

          <button type="button" class="btn-track-refresh" onclick="window.refreshOrderTracking()" title="Comprobar nuevo estado">
            <span>🔄 Actualizar Estado</span>
          </button>
        </div>

      </div>
    `;

    container.innerHTML = html;
  }

  // Lista cuando se encuentran múltiples órdenes (ej. por cédula o teléfono)
  function renderMultipleOrdersList(orders, query) {
    const container = document.getElementById('orderTrackingResult');
    if (!container) return;

    let html = `
      <div class="tracking-multiple-card">
        <h4 class="multiple-title">🔍 Encontramos ${orders.length} pedidos asociados a "${escapeTrackHtml(query)}":</h4>
        <p class="multiple-sub">Selecciona el pedido que deseas rastrear para ver su guía y estado en tiempo real:</p>

        <div class="multiple-orders-list">
          ${orders.map(o => `
            <div class="multiple-order-row" onclick="window.trackOrderById('${escapeTrackHtml(o.id)}')">
              <div class="multiple-row-left">
                <strong>#${escapeTrackHtml(o.id)}</strong>
                <span class="tracking-status-badge badge-${o.status}">${formatTrackStatusLabel(o.status)}</span>
              </div>
              <div class="multiple-row-mid">
                <span>${escapeTrackHtml(o.dateFormatted || o.date)}</span>
                <span>${o.totalCount || 0} salsas · $${(o.totalPrice || 0).toFixed(2)} USD</span>
              </div>
              <div class="multiple-row-right">
                <button type="button" class="btn-select-order">Ver Guía →</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // Estado No Encontrado
  function renderOrderNotFound(query) {
    const container = document.getElementById('orderTrackingResult');
    if (!container) return;

    container.innerHTML = `
      <div class="tracking-empty-card">
        <div class="empty-icon">🔎</div>
        <h3>No encontramos ninguna orden con "${escapeTrackHtml(query)}"</h3>
        <p>Asegúrate de haber escrito correctamente tu número de orden (ej: <code>#ORD-802092</code>), tu número de teléfono emisor o tu cédula.</p>
        <div class="empty-actions">
          <a href="https://wa.me/584143572462?text=${encodeURIComponent(`Hola DIP LF! 👋 No logro ubicar mi orden con el dato: "${query}". ¿Podrían ayudarme a verificar mi pedido?`)}" target="_blank" class="btn-help-whatsapp">
            💬 Consultar con Soporte por WhatsApp
          </a>
        </div>
      </div>
    `;
  }

  // Abrir WhatsApp con mensaje pre-cargado para coordinar delivery
  window.openTrackOrderWhatsapp = function() {
    if (!currentTrackedOrder) return;
    const o = currentTrackedOrder;
    const rate = (typeof getBcvRate === 'function') ? getBcvRate() : 395.00;
    const totalBs = o.paymentDetails?.amountBs || Number((o.totalPrice * rate).toFixed(2));
    const bsFormatted = Number(totalBs).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    let msg = `¡Hola DIP LF! 👋 Les escribo para coordinar la entrega de mi orden:\n\n`;
    msg += `📦 *NÚMERO DE ORDEN:* #${o.id}\n`;
    msg += `✅ *ESTADO ACTUAL:* ${formatTrackStatusLabel(o.status)}\n`;
    if (o.customerName) msg += `👤 *CLIENTE:* ${o.customerName} (C.I: ${o.customerId || 'N/A'})\n`;
    if (o.customerPhone) msg += `📱 *TELÉFONO:* ${o.customerPhone}\n`;
    msg += `💰 *TOTAL:* $${(o.totalPrice || 0).toFixed(2)} USD (Bs. ${bsFormatted})\n\n`;
    msg += `🛒 *DETALLE:*\n`;

    (o.items || []).forEach(it => {
      msg += `• ${it.quantity}x ${it.name || it.flavorName} (${it.sizeName || it.sizeKey})\n`;
    });

    msg += `\n📍 *Quisiera coordinar la dirección de delivery o retiro.* ¡Muchas gracias!`;

    const phone = '584143572462';
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  // Copiar ID de Orden
  window.copyOrderTrackingId = function(orderId) {
    if (!orderId) return;
    navigator.clipboard.writeText(orderId).then(() => {
      if (typeof showOrderToast === 'function') {
        showOrderToast(`¡Número #${orderId} copiado al portapapeles!`);
      } else {
        alert(`¡Número #${orderId} copiado!`);
      }
    }).catch(() => {
      prompt('Copia tu número de orden:', orderId);
    });
  };

  // Botón manual de refrescar
  window.refreshOrderTracking = function() {
    if (!currentTrackedOrder) return;
    trackOrderById(currentTrackedOrder.id, false);
    if (typeof showOrderToast === 'function') {
      showOrderToast('🔄 Estado actualizado.');
    }
  };

  // Polling automático cada 20s si la orden está activa
  function startLivePolling(orderId) {
    if (trackingPollInterval) {
      clearInterval(trackingPollInterval);
    }

    trackingPollInterval = setInterval(async () => {
      if (!currentTrackedOrder || currentTrackedOrder.status === 'entregado' || currentTrackedOrder.status === 'cancelado') {
        clearInterval(trackingPollInterval);
        return;
      }

      try {
        const apiUrl = (typeof getWebhookServerUrl === 'function') ? getWebhookServerUrl() : 'https://diplf.alwaysdata.net';
        const res = await fetch(`${apiUrl}/api/orders/${encodeURIComponent(orderId)}`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(3500)
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.order && data.order.status !== currentTrackedOrder.status) {
            currentTrackedOrder = data.order;
            renderOrderCard(data.order);
            if (typeof showOrderToast === 'function') {
              showOrderToast(`📦 ¡Tu orden cambió a: ${formatTrackStatusLabel(data.order.status)}!`);
            }
          }
        }
      } catch (_) {}
    }, 20000);
  }

  // Etiquetas amigables de estado
  function formatTrackStatusLabel(st) {
    switch (st) {
      case 'pendiente': return '⏳ Pendiente de Verificación';
      case 'pagado': return '✅ Pagado (Confirmado por Banco)';
      case 'nuevo': return '🟡 Recibido (En Espera)';
      case 'en_preparacion': return '🔵 En Preparación (Cocina)';
      case 'listo_entrega': return '🛵 Listo para Entrega / Delivery';
      case 'entregado': return '🟢 Entregado con Éxito';
      case 'cancelado': return '🔴 Orden Cancelada';
      default: return st || 'Recibido';
    }
  }

  function escapeTrackHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Inicializar en DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOrderTracking);
  } else {
    initOrderTracking();
  }

})();
