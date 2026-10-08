/**
 * DIP LF - Lógica de la Página de Órdenes (ordenes.html)
 * Manejo de visualización, filtros, sincronización en vivo y guía de pedidos
 */

(function() {
  'use strict';

  // Constantes de configuración
  const ORDERS_STORAGE_KEY = 'diplf_orders';
  const CUSTOMER_STORAGE_KEY = 'diplf_customer_info';
  const WHATSAPP_COORDINATION_PHONE = '584143572462';

  // Estado interno
  let allOrders = [];
  let currentFilteredOrders = [];
  let activeModalOrder = null;
  let pollingIntervalId = null;

  // Obtener URL del servidor webhook
  function getWebhookUrl() {
    if (typeof getWebhookServerUrl === 'function') {
      return getWebhookServerUrl();
    }
    try {
      const saved = localStorage.getItem('diplf_webhook_server_url');
      if (saved) return saved.trim();
    } catch (_) {}
    return 'https://diplf.alwaysdata.net';
  }

  // Helper para tasa BCV
  function getCurrentBcvRate() {
    if (typeof getBcvRate === 'function') {
      return getBcvRate();
    }
    try {
      const savedRate = localStorage.getItem('diplf_bcv_rate');
      if (savedRate && !isNaN(parseFloat(savedRate))) {
        return parseFloat(savedRate);
      }
    } catch (_) {}
    return 395.00;
  }

  // =============================================================================
  // 1. INICIALIZACIÓN
  // =============================================================================
  document.addEventListener('DOMContentLoaded', () => {
    initCustomerProfile();
    initBcvDisplay();
    initAdminLink();
    initEventListeners();
    
    // Cargar órdenes locales primero (instantáneo)
    loadLocalOrders();

    // Sincronizar con servidor Alwaysdata
    fetchRemoteOrders().then(() => {
      checkUrlTargetOrder();
      fetchChatThreads();
    });

    // Iniciar sondeo periódico cada 15 segundos para cambios de estado en Almacén
    pollingIntervalId = setInterval(fetchRemoteOrders, 15000);

    // Sondeo de mensajes y notificaciones de chat cada 4 segundos
    setInterval(fetchChatThreads, 4000);
  });

  // Mostrar datos del cliente en la barra superior
  function initCustomerProfile() {
    try {
      const rawCustomer = localStorage.getItem(CUSTOMER_STORAGE_KEY);
      if (rawCustomer) {
        const customer = JSON.parse(rawCustomer);
        const nameEl = document.getElementById('topbarCustomerName');
        const idEl = document.getElementById('topbarCustomerId');
        if (nameEl && customer.name) nameEl.textContent = customer.name;
        if (idEl && (customer.id || customer.phone)) {
          idEl.textContent = customer.id || customer.phone;
        }
      }
    } catch (_) {}
  }

  // Mostrar tasa oficial BCV
  function initBcvDisplay() {
    const rateEl = document.getElementById('bcvRateDisplay');
    if (rateEl) {
      const rate = getCurrentBcvRate();
      rateEl.textContent = `Bs. ${rate.toFixed(2)}`;
    }
  }

  // Verificar si hay sesión admin activa para mostrar acceso a Almacén
  function initAdminLink() {
    const adminLink = document.getElementById('sidebarAdminLink');
    if (!adminLink) return;

    let isAdmin = false;
    if (typeof checkAdminSession === 'function') {
      isAdmin = checkAdminSession();
    } else {
      isAdmin = localStorage.getItem('diplf_admin_logged') === 'true';
    }

    if (isAdmin) {
      adminLink.style.display = 'flex';
    }
  }

  // Configurar listeners de la interfaz
  function initEventListeners() {
    const searchInput = document.getElementById('inputSearchOrders');
    const statusSelect = document.getElementById('selectFilterStatus');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        handleSearchInput(e.target.value);
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          clearOrdersSearch();
        }
      });
    }

    if (statusSelect) {
      statusSelect.addEventListener('change', () => {
        applyFilters();
      });
    }

    // Tecla ESC para cerrar modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modal = document.getElementById('orderGuideModal');
        if (modal && modal.style.display !== 'none') {
          closeOrderModal();
        }
      }
    });

    // Escuchar eventos globales de nuevas órdenes o cambios de estado
    window.addEventListener('diplf_new_order', () => {
      loadLocalOrders();
      fetchRemoteOrders();
    });

    window.addEventListener('diplf_orders_updated', () => {
      loadLocalOrders();
    });
  }

  // =============================================================================
  // 2. CARGA Y SINCRONIZACIÓN DE DATOS
  // =============================================================================

  // Cargar órdenes desde localStorage
  function loadLocalOrders() {
    try {
      const saved = localStorage.getItem(ORDERS_STORAGE_KEY);
      if (saved) {
        allOrders = JSON.parse(saved);
        if (!Array.isArray(allOrders)) allOrders = [];
      } else {
        allOrders = [];
      }
    } catch (err) {
      console.warn('Error leyendo órdenes de localStorage:', err);
      allOrders = [];
    }

    applyFilters();
  }

  // Sincronizar órdenes desde el servidor webhook Alwaysdata
  async function fetchRemoteOrders() {
    try {
      const webhookUrl = getWebhookUrl();
      const res = await fetch(`${webhookUrl}/api/orders`, {
        signal: AbortSignal.timeout(6000)
      });

      if (!res.ok) return;
      const data = await res.json();
      const remoteOrders = Array.isArray(data) ? data : (Array.isArray(data?.orders) ? data.orders : []);
      if (!Array.isArray(remoteOrders)) return;

      // Unir y actualizar manteniendo la versión más reciente
      const mergedMap = new Map();

      // 1. Insertar primero remotas
      remoteOrders.forEach(ro => {
        if (ro && ro.id) mergedMap.set(ro.id, ro);
      });

      // 2. Fusionar con locales (respetando estados remotos más recientes)
      allOrders.forEach(lo => {
        if (lo && lo.id) {
          if (!mergedMap.has(lo.id)) {
            mergedMap.set(lo.id, lo);
          } else {
            const ro = mergedMap.get(lo.id);
            // Conservar el objeto fusionado
            mergedMap.set(lo.id, {
              ...lo,
              ...ro,
              status: ro.status || lo.status,
              items: (ro.items && ro.items.length) ? ro.items : lo.items
            });
          }
        }
      });

      // Convertir a lista y ordenar por fecha descendente
      const mergedList = Array.from(mergedMap.values()).sort((a, b) => {
        const dateA = new Date(a.date || 0).getTime();
        const dateB = new Date(b.date || 0).getTime();
        return dateB - dateA;
      });

      allOrders = mergedList;
      try {
        localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(allOrders));
      } catch (_) {}

      applyFilters();

      // Si el modal está abierto, refrescar sus datos si coincide el ID
      if (activeModalOrder) {
        const updatedTarget = allOrders.find(o => o.id === activeModalOrder.id);
        if (updatedTarget && updatedTarget.status !== activeModalOrder.status) {
          renderModalDetails(updatedTarget);
        }
      }
    } catch (err) {
      console.log('No se pudo conectar con el servidor de órdenes (modo offline/cache):', err.message);
    }
  }

  // Refrescar manualmente con el botón
  window.refreshOrdersData = async function() {
    const btn = document.querySelector('.btn-refresh-orders');
    if (btn) {
      btn.style.opacity = '0.6';
      btn.style.pointerEvents = 'none';
      const icon = btn.querySelector('.refresh-icon');
      if (icon) icon.style.animation = 'spin 0.7s linear infinite';
    }

    await fetchRemoteOrders();
    showOrdersToast('Órdenes actualizadas con éxito');

    if (btn) {
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
      const icon = btn.querySelector('.refresh-icon');
      if (icon) icon.style.animation = '';
    }
  };

  // =============================================================================
  // 3. FILTROS Y BÚSQUEDA
  // =============================================================================

  function handleSearchInput(query) {
    const btnClear = document.getElementById('btnClearSearch');
    if (btnClear) {
      btnClear.style.display = query.trim() ? 'block' : 'none';
    }
    applyFilters();
  }

  window.clearOrdersSearch = function() {
    const searchInput = document.getElementById('inputSearchOrders');
    const btnClear = document.getElementById('btnClearSearch');
    if (searchInput) searchInput.value = '';
    if (btnClear) btnClear.style.display = 'none';
    applyFilters();
    searchInput?.focus();
  };

  window.focusOrdersSearch = function(event) {
    if (event) event.preventDefault();
    const searchInput = document.getElementById('inputSearchOrders');
    if (searchInput) {
      searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      searchInput.focus();
      searchInput.select();
    }
  };

  function applyFilters() {
    const searchInput = document.getElementById('inputSearchOrders');
    const statusSelect = document.getElementById('selectFilterStatus');

    const query = (searchInput?.value || '').trim().toLowerCase();
    const queryDigits = query.replace(/[^0-9]/g, '');
    const selectedStatus = statusSelect?.value || 'todos';

    currentFilteredOrders = allOrders.filter(order => {
      // 1. Filtro por Estado
      if (selectedStatus !== 'todos') {
        const orderStatus = (order.status || 'nuevo').toLowerCase().trim();
        if (selectedStatus === 'entregado' && orderStatus !== 'entregado' && !orderStatus.includes('entregado')) return false;
        if (selectedStatus === 'listo_entrega' && (orderStatus !== 'listo_entrega' && !orderStatus.includes('listo') && !orderStatus.includes('delivery'))) return false;
        if (selectedStatus === 'pagado' && !orderStatus.includes('pagado')) return false;
        if (selectedStatus === 'en_preparacion' && !orderStatus.includes('preparac')) return false;
        if (selectedStatus === 'pendiente' && (!orderStatus.includes('pendiente') && orderStatus !== 'nuevo')) return false;
        if (selectedStatus === 'cancelado' && !orderStatus.includes('cancel')) return false;
      }

      // 2. Filtro por Búsqueda de Texto
      if (query) {
        const orderId = (order.id || '').toLowerCase();
        const customerName = (order.customerName || '').toLowerCase();
        const customerId = (order.customerId || '').toLowerCase();
        const phone = (order.customerPhone || order.paymentDetails?.senderPhone || '').replace(/[^0-9]/g, '');
        const reference = (order.paymentDetails?.reference || '').toLowerCase();
        
        // Coincidencia en productos
        const itemsMatch = (order.items || []).some(item => 
          (item.name && item.name.toLowerCase().includes(query)) ||
          (item.sizeName && item.sizeName.toLowerCase().includes(query))
        );

        const matchId = orderId.includes(query) || (queryDigits.length >= 3 && orderId.includes(queryDigits));
        const matchCustomer = customerName.includes(query);
        const matchIdNumber = customerId.includes(query);
        const matchPhone = queryDigits.length >= 4 && phone.includes(queryDigits);
        const matchRef = reference.includes(query);

        if (!matchId && !matchCustomer && !matchIdNumber && !matchPhone && !matchRef && !itemsMatch) {
          return false;
        }
      }

      return true;
    });

    renderOrdersCards();
    updateCounterBadge();
  }

  function updateCounterBadge() {
    const badge = document.getElementById('ordersCountBadge');
    if (!badge) return;

    const count = currentFilteredOrders.length;
    if (count === 1) {
      badge.textContent = '1 orden';
    } else {
      badge.textContent = `${count} órdenes`;
    }
  }

  // =============================================================================
  // 4. RENDERIZADO DE TARJETAS HORIZONTALES (Estilo de la imagen de referencia)
  // =============================================================================

  function renderOrdersCards() {
    const container = document.getElementById('ordersCardsContainer');
    if (!container) return;

    if (currentFilteredOrders.length === 0) {
      container.innerHTML = `
        <div class="orders-empty-state">
          <span class="orders-empty-icon">📦</span>
          <h3>No se encontraron órdenes</h3>
          <p>No hay pedidos que coincidan con los filtros actuales o aún no has realizado ninguna compra desde este navegador.</p>
          <a href="index.html" class="btn-order-action" style="display: inline-block; padding: 12px 24px; text-decoration: none;">
            🥣 Ir a la Tienda de Salsas
          </a>
        </div>
      `;
      return;
    }

    const rate = getCurrentBcvRate();

    container.innerHTML = currentFilteredOrders.map(order => {
      const statusClass = normalizeStatusClass(order.status);
      const statusInfo = getStatusDisplayInfo(order.status);
      const salsaTitle = buildOrderTitle(order);
      const breakdownText = buildBreakdownText(order);
      const iconEmoji = getOrderIconEmoji(order);

      const totalPriceUsd = Number(order.totalPrice || 0);
      const intPart = Math.floor(totalPriceUsd);
      const decPart = (totalPriceUsd % 1).toFixed(2).substring(2);
      
      const orderRate = order.paymentDetails?.rate || rate;
      const totalBs = (order.paymentDetails?.amountBs) 
        ? Number(order.paymentDetails.amountBs) 
        : (totalPriceUsd * orderRate);
      
      const formattedBs = totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formattedDate = formatOrderDate(order.date || order.dateFormatted);

      const customerDisplay = order.customerName || 'Cliente Web';
      const docOrPhone = order.customerId || order.customerPhone || (order.paymentDetails?.senderPhone) || 'Sin registrar';

      // Mensaje WhatsApp
      const whatsappMsg = buildWhatsAppOrderMessage(order);
      const whatsappUrl = `https://wa.me/${WHATSAPP_COORDINATION_PHONE}?text=${encodeURIComponent(whatsappMsg)}`;

      return `
        <div class="order-card-row status-${statusClass}" id="card-${order.id}">
          <!-- Izquierda: Icono + Título del Pedido + Status -->
          <div class="order-card-left">
            <div class="order-card-icon-box" title="Pedido DIP LF">
              ${iconEmoji}
            </div>
            <div class="order-card-info">
              <h3 class="order-card-title">${escapeHtml(salsaTitle)}</h3>
              <div class="order-status-pill ${statusClass}">
                <span class="status-dot-mini"></span>
                <span>${statusInfo.label}</span>
              </div>
            </div>
          </div>

          <!-- Centro: Metadatos en Columnas -->
          <div class="order-card-mid">
            <div class="order-meta-columns">
              <div class="meta-col">
                <span class="meta-label">Orden</span>
                <span class="meta-val order-num" onclick="openOrderModal('${order.id}')" title="Ver guía completa">
                  #${escapeHtml(order.id)}
                </span>
              </div>
              <div class="meta-col">
                <span class="meta-label">Cliente</span>
                <span class="meta-val">${escapeHtml(customerDisplay)}</span>
              </div>
              <div class="meta-col">
                <span class="meta-label">Cédula / Tel</span>
                <span class="meta-val">${escapeHtml(docOrPhone)}</span>
              </div>
              <div class="meta-col">
                <span class="meta-label">Fecha</span>
                <span class="meta-val">${escapeHtml(formattedDate)}</span>
              </div>
            </div>
            <div class="order-card-subdesc">
              ${escapeHtml(breakdownText)}
            </div>
          </div>

          <!-- Derecha: Precio + Acciones -->
          <div class="order-card-right">
            <div class="order-price-block">
              <span class="price-bs-small">Bs. ${formattedBs}</span>
              <div class="price-usd-main">
                $${intPart}<sup>.${decPart}</sup> USD
              </div>
            </div>

            <div class="order-actions-group">
              <button type="button" class="btn-order-chat-direct" onclick="openCustomerChat('${order.id}')" title="Chatear en vivo con el gerente de DIP LF">
                <span>💬 Chat</span>
                <span id="chat-badge-${order.id}" class="chat-unread-badge" style="${(Number(chatThreadsData[order.id]?.unreadByCustomer || 0) > 0) ? '' : 'display: none;'}">${Number(chatThreadsData[order.id]?.unreadByCustomer || 0) || ''}</span>
              </button>

              <a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer" class="btn-order-whatsapp-icon" title="Coordinar entrega por WhatsApp">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                </svg>
              </a>

              <button type="button" class="btn-order-action" onclick="openOrderModal('${order.id}')">
                Ver Guía
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // =============================================================================
  // 5. MODAL DE DETALLES Y GUÍA EN TIEMPO REAL (STEPPER)
  // =============================================================================

  window.openOrderModal = function(orderId) {
    const order = allOrders.find(o => o.id === orderId);
    if (!order) return;

    activeModalOrder = order;
    renderModalDetails(order);

    const modal = document.getElementById('orderGuideModal');
    if (modal) {
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
  };

  window.closeOrderModal = function(event) {
    if (event && event.target && event.target.id !== 'orderGuideModal' && !event.target.classList.contains('modal-close-btn') && !event.target.classList.contains('btn-modal-close-action')) {
      return;
    }
    const modal = document.getElementById('orderGuideModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }
    activeModalOrder = null;
  };

  function renderModalDetails(order) {
    const titleEl = document.getElementById('modalOrderTitle');
    if (titleEl) titleEl.textContent = `#${order.id}`;

    // 1. Configurar Stepper de 4 pasos
    updateModalStepper(order.status);

    // 2. Ficha de Datos del Cliente
    const nameEl = document.getElementById('modalCustomerName');
    const idEl = document.getElementById('modalCustomerId');
    const phoneEl = document.getElementById('modalCustomerPhone');

    if (nameEl) nameEl.textContent = order.customerName || 'Cliente Web';
    if (idEl) idEl.textContent = order.customerId || 'No indicado';
    if (phoneEl) {
      phoneEl.textContent = order.customerPhone || order.paymentDetails?.senderPhone || 'No indicado';
    }

    // 3. Ficha de Pago
    const methodEl = document.getElementById('modalPaymentMethod');
    const bankEl = document.getElementById('modalBankName');
    const refEl = document.getElementById('modalReferenceNumber');

    if (methodEl) {
      if (order.paymentMethod === 'pago_movil') {
        methodEl.innerHTML = '<span style="color: #34d399; font-weight: 800;">⚡ Pago Móvil (Verificado por Banco)</span>';
      } else {
        methodEl.textContent = '💬 Coordinación WhatsApp';
      }
    }
    if (bankEl) bankEl.textContent = order.paymentDetails?.originBank || 'N/A';
    if (refEl) refEl.textContent = order.paymentDetails?.reference || 'N/A';

    // 4. Lista de Productos
    const itemsList = document.getElementById('modalItemsList');
    if (itemsList) {
      const items = order.items || [];
      if (items.length === 0) {
        itemsList.innerHTML = '<p style="color: #64748b;">No hay detalles de productos registrados.</p>';
      } else {
        itemsList.innerHTML = items.map(it => {
          const subtotal = (it.price || 0) * (it.quantity || 1);
          return `
            <div class="modal-item-row">
              <div>
                <strong>${it.quantity || 1}x</strong> ${escapeHtml(it.name || 'Salsa')}
                <span style="color: #94a3b8; font-size: 0.78rem;">(${escapeHtml(it.sizeName || it.sizeKey || '7 oz')})</span>
              </div>
              <strong style="color: #fbbf24;">$${subtotal.toFixed(2)} USD</strong>
            </div>
          `;
        }).join('');
      }
    }

    // 5. Totales
    const rate = getCurrentBcvRate();
    const totalPriceUsd = Number(order.totalPrice || 0);
    const orderRate = order.paymentDetails?.rate || rate;
    const totalBs = (order.paymentDetails?.amountBs) 
      ? Number(order.paymentDetails.amountBs) 
      : (totalPriceUsd * orderRate);

    const totalUsdEl = document.getElementById('modalTotalUsd');
    const totalBsEl = document.getElementById('modalTotalBs');

    if (totalUsdEl) totalUsdEl.textContent = `$${totalPriceUsd.toFixed(2)} USD`;
    if (totalBsEl) {
      totalBsEl.textContent = `Bs. ${totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  }

  // Actualizar el estado visual del Stepper (Paso 1, 2, 3, 4)
  function updateModalStepper(status) {
    const st = (status || 'nuevo').toLowerCase();
    const step1 = document.getElementById('modalStep1');
    const step2 = document.getElementById('modalStep2');
    const step3 = document.getElementById('modalStep3');
    const step4 = document.getElementById('modalStep4');
    const fill = document.getElementById('modalStepperFill');
    const step1Sub = document.getElementById('modalStep1Sub');

    // Resetear clases
    [step1, step2, step3, step4].forEach(step => {
      if (step) {
        step.classList.remove('completed', 'current');
      }
    });

    let fillPct = '10%';

    switch (st) {
      case 'pendiente':
      case 'nuevo':
        step1?.classList.add('current');
        if (step1Sub) step1Sub.textContent = 'Esperando pago';
        fillPct = '12%';
        break;

      case 'pagado':
        step1?.classList.add('completed');
        step2?.classList.add('current');
        if (step1Sub) step1Sub.textContent = 'Verificado ✅';
        fillPct = '38%';
        break;

      case 'en_preparacion':
        step1?.classList.add('completed');
        step2?.classList.add('current');
        if (step1Sub) step1Sub.textContent = 'Confirmado';
        fillPct = '45%';
        break;

      case 'listo_entrega':
        step1?.classList.add('completed');
        step2?.classList.add('completed');
        step3?.classList.add('current');
        fillPct = '75%';
        break;

      case 'entregado':
        step1?.classList.add('completed');
        step2?.classList.add('completed');
        step3?.classList.add('completed');
        step4?.classList.add('completed');
        fillPct = '100%';
        break;

      case 'cancelado':
        step1?.classList.add('current');
        if (step1Sub) step1Sub.textContent = 'Cancelado ❌';
        fillPct = '12%';
        break;

      default:
        step1?.classList.add('current');
        fillPct = '20%';
    }

    if (fill) fill.style.width = fillPct;
  }

  // Botón del Modal para coordinar por WhatsApp
  window.openModalWhatsappCoord = function() {
    if (!activeModalOrder) return;
    const msg = buildWhatsAppOrderMessage(activeModalOrder);
    const url = `https://wa.me/${WHATSAPP_COORDINATION_PHONE}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  // =============================================================================
  // 6. AUTO-ENFOQUE POR URL (?id=ORD-XXXXXX)
  // =============================================================================

  function checkUrlTargetOrder() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      let targetId = urlParams.get('id') || urlParams.get('orden') || urlParams.get('order');

      if (!targetId && window.location.hash) {
        const hash = window.location.hash.replace('#', '').trim();
        if (hash.startsWith('ORD-') || hash.length >= 6) {
          targetId = hash;
        }
      }

      if (targetId) {
        targetId = decodeURIComponent(targetId).trim();
        const searchInput = document.getElementById('inputSearchOrders');
        if (searchInput) {
          searchInput.value = targetId;
          const btnClear = document.getElementById('btnClearSearch');
          if (btnClear) btnClear.style.display = 'block';
        }
        applyFilters();

        // Buscar coincidencia exacta y abrir modal
        const cleanTarget = targetId.replace('#', '');
        const found = allOrders.find(o => 
          o.id.toLowerCase() === cleanTarget.toLowerCase() ||
          o.id.replace(/[^0-9]/g, '') === cleanTarget.replace(/[^0-9]/g, '')
        );

        if (found) {
          setTimeout(() => {
            openOrderModal(found.id);
            const card = document.getElementById(`card-${found.id}`);
            if (card) {
              card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 200);
        }
      }
    } catch (err) {
      console.warn('Error verificando parámetro de URL para orden:', err);
    }
  }

  // =============================================================================
  // 7. HELPERS DE FORMATO Y PRESENTACIÓN
  // =============================================================================

  function normalizeStatusClass(status) {
    const s = (status || 'nuevo').toLowerCase().trim();
    if (s === 'entregado' || s === 'completado' || s.includes('entregad')) {
      return 'entregado';
    }
    if (s === 'listo_entrega' || s.includes('listo') || s.includes('delivery')) {
      return 'listo_entrega';
    }
    if (s === 'en_preparacion' || s.includes('preparac')) {
      return 'en_preparacion';
    }
    if (s === 'pagado' || s === 'confirmado' || s.includes('pagado')) {
      return 'pagado';
    }
    if (s === 'cancelado' || s === 'anulado' || s.includes('cancel')) {
      return 'cancelado';
    }
    if (s === 'pendiente' || s === 'nuevo' || s.includes('pendiente')) {
      return 'pendiente';
    }
    return 'otro';
  }

  function getStatusDisplayInfo(status) {
    const s = (status || 'nuevo').toLowerCase().trim();
    if (s === 'entregado' || s === 'completado' || s.includes('entregad')) {
      return { label: 'Entregado' };
    }
    if (s === 'listo_entrega' || s.includes('listo') || s.includes('delivery')) {
      return { label: 'Listo para Entrega' };
    }
    if (s === 'en_preparacion' || s.includes('preparac')) {
      return { label: 'En Preparación' };
    }
    if (s === 'pagado' || s.includes('pagado') || s === 'confirmado') {
      return { label: 'Pagado (Confirmado)' };
    }
    if (s === 'cancelado' || s.includes('cancel') || s === 'anulado') {
      return { label: 'Cancelado' };
    }
    if (s === 'pendiente' || s === 'nuevo' || s.includes('pendiente')) {
      return { label: 'Pendiente de Pago' };
    }
    return { label: status || 'Procesando' };
  }

  function buildOrderTitle(order) {
    const items = order.items || [];
    if (items.length === 0) return 'Pedido DIP LF';

    const names = items.map(i => i.name || 'Salsa').filter(Boolean);
    const uniqueNames = Array.from(new Set(names));

    if (uniqueNames.length === 1) {
      const it = items[0];
      return `${it.name} ${it.sizeName ? `(${it.sizeName})` : ''}`.trim();
    }

    if (uniqueNames.length === 2) {
      return `${uniqueNames[0]}, ${uniqueNames[1]}`;
    }

    return `${uniqueNames[0]}, ${uniqueNames[1]} y +${uniqueNames.length - 2}`;
  }

  function buildBreakdownText(order) {
    const items = order.items || [];
    if (items.length === 0) {
      return order.customerNote || 'Sin notas adicionales.';
    }

    return items.map(i => {
      const qty = i.quantity || 1;
      const size = i.sizeName || i.sizeKey || '7 oz';
      return `${qty}x ${i.name} (${size})`;
    }).join(' • ');
  }

  function getOrderIconEmoji(order) {
    const items = order.items || [];
    if (items.length === 0) return '🥣';

    const first = (items[0].name || '').toLowerCase();
    if (first.includes('tocineta')) return '🥓';
    if (first.includes('maiz') || first.includes('maíz')) return '🌽';
    if (first.includes('ajo')) return '🧄';
    if (first.includes('tartara') || first.includes('tártara')) return '🥣';
    if (first.includes('picante')) return '🌶️';
    if (first.includes('bbq')) return '🍖';
    return '🥣';
  }

  function formatOrderDate(dateVal) {
    if (!dateVal) return 'Hoy';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return String(dateVal);

      return d.toLocaleDateString('es-VE', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return String(dateVal);
    }
  }

  function buildWhatsAppOrderMessage(order) {
    const p = order.paymentDetails || {};
    const rate = getCurrentBcvRate();
    const orderRate = p.rate || rate;
    const totalBs = p.amountBs || (order.totalPrice * orderRate);

    let msg = `¡Hola DIP LF! 👋 Quisiera coordinar la entrega de mi pedido:\n\n`;
    msg += `📦 *ORDEN:* #${order.id}\n`;
    msg += `📊 *ESTADO ACTUAL:* ${getStatusDisplayInfo(order.status).label.toUpperCase()}\n`;
    if (order.customerName) msg += `👤 *CLIENTE:* ${order.customerName} (C.I: ${order.customerId || 'N/A'})\n`;
    if (order.customerPhone || p.senderPhone) msg += `📱 *TELÉFONO:* ${order.customerPhone || p.senderPhone}\n`;
    
    if (order.paymentMethod === 'pago_movil') {
      msg += `💳 *MÉTODO:* Pago Móvil (Ref: ${p.reference || 'N/A'})\n`;
    }
    
    msg += `💰 *TOTAL:* $${Number(order.totalPrice || 0).toFixed(2)} USD (Bs. ${Number(totalBs).toFixed(2)})\n\n`;
    msg += `🛒 *DETALLE:*\n`;

    (order.items || []).forEach(it => {
      msg += `• ${it.quantity}x ${it.name} (${it.sizeName || it.sizeKey || '7 oz'})\n`;
    });

    msg += `\n📍 *¿Cuál es el tiempo de despacho estimado para mi pedido?* ¡Gracias!`;
    return msg;
  }

  function showOrdersToast(msg) {
    const toast = document.getElementById('ordersToast');
    if (!toast) return;

    toast.textContent = msg;
    toast.classList.add('active');
    setTimeout(() => {
      toast.classList.remove('active');
    }, 2800);
  }

  // =============================================================================
  // 8. CHAT EN VIVO DE ATENCIÓN AL CLIENTE POR PEDIDO
  // =============================================================================
  let chatThreadsData = {};
  let knownAdminMsgIds = new Set();
  let isFirstChatPoll = true;
  let activeChatOrderId = null;
  let chatPollingTimer = null;
  let cachedAudioCtx = null;

  // Inicializar o desbloquear el contexto de audio con la primera interacción del usuario
  function getAudioContext() {
    try {
      if (!cachedAudioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) cachedAudioCtx = new AudioCtx();
      }
      if (cachedAudioCtx && cachedAudioCtx.state === 'suspended') {
        cachedAudioCtx.resume().catch(() => {});
      }
    } catch (_) {}
    return cachedAudioCtx;
  }
  document.addEventListener('click', () => { getAudioContext(); }, { once: true });
  document.addEventListener('touchstart', () => { getAudioContext(); }, { once: true });

  // Sonido de campana para nuevos mensajes del gerente (sintetizador Web Audio)
  function playManagerMessageSound() {
    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;

      const now = audioCtx.currentTime;

      // Nota 1 (Campana aguda E5 -> A5, suave y elegante)
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      osc1.frequency.exponentialRampToValueAtTime(880.00, now + 0.08);
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.exponentialRampToValueAtTime(0.32, now + 0.03);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.28);

      // Nota 2 (Campana brillante A5 -> E6) a los 110ms
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.00, now + 0.11);
      osc2.frequency.exponentialRampToValueAtTime(1318.51, now + 0.20);
      gain2.gain.setValueAtTime(0.001, now + 0.11);
      gain2.gain.exponentialRampToValueAtTime(0.38, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(now + 0.11);
      osc2.stop(now + 0.48);
    } catch (_) {}
  }

  // Sondeo en vivo de hilos de chat y actualización de badges / sonido
  window.fetchChatThreads = async function() {
    try {
      const webhookUrl = getWebhookUrl();
      const res = await fetch(`${webhookUrl}/api/chat/threads`, {
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) return;
      const data = await res.json();
      const threads = data.threads || [];

      let hasNewManagerMsg = false;

      threads.forEach(t => {
        chatThreadsData[t.orderId] = t;
        const unread = Number(t.unreadByCustomer || 0);

        // Actualizar badge en tarjeta del pedido
        const badgeEl = document.getElementById(`chat-badge-${t.orderId}`);
        if (badgeEl) {
          if (unread > 0) {
            badgeEl.textContent = unread > 9 ? '9+' : unread;
            badgeEl.style.display = 'inline-flex';
          } else {
            badgeEl.style.display = 'none';
          }
        }

        // Revisar si llegaron mensajes nuevos del gerente (admin)
        if (Array.isArray(t.messages)) {
          t.messages.forEach(m => {
            if (m.sender === 'admin') {
              if (!knownAdminMsgIds.has(m.id)) {
                if (!isFirstChatPoll) {
                  hasNewManagerMsg = true;
                }
                knownAdminMsgIds.add(m.id);
              }
            }
          });
        }
      });

      if (hasNewManagerMsg) {
        playManagerMessageSound();
        showOrdersToast('💬 ¡Nuevo mensaje de DIP LF en tu pedido!');
        if (activeChatOrderId) {
          fetchChatMessages(activeChatOrderId);
        }
      }

      isFirstChatPoll = false;
    } catch (_) {}
  };

  window.openCustomerChatFromModal = function() {
    if (activeModalOrder && activeModalOrder.id) {
      const targetId = activeModalOrder.id;
      closeOrderModal();
      openCustomerChat(targetId);
    }
  };

  window.openCustomerChat = function(orderId) {
    if (!orderId) return;
    activeChatOrderId = orderId;

    // Quitar badge inmediatamente en interfaz
    const badgeEl = document.getElementById(`chat-badge-${orderId}`);
    if (badgeEl) badgeEl.style.display = 'none';
    if (chatThreadsData[orderId]) {
      chatThreadsData[orderId].unreadByCustomer = 0;
    }

    const modal = document.getElementById('customerChatModal');
    const subtitle = document.getElementById('chatModalOrderSubtitle');
    if (subtitle) subtitle.textContent = `Orden #${orderId}`;

    if (modal) {
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }

    // Cargar mensajes iniciales (con reader=customer para limpiar no leídos en backend)
    fetchChatMessages(orderId);

    // Auto-refresco en vivo cada 3 segundos mientras el chat esté abierto
    if (chatPollingTimer) clearInterval(chatPollingTimer);
    chatPollingTimer = setInterval(() => {
      if (activeChatOrderId) fetchChatMessages(activeChatOrderId);
    }, 3000);

    const input = document.getElementById('chatInputText');
    if (input) {
      setTimeout(() => input.focus(), 250);
    }
  };

  window.closeCustomerChatModal = function(event) {
    if (event && event.target && event.target.id !== 'customerChatModal' && !event.target.classList.contains('modal-close-btn')) {
      return;
    }
    const modal = document.getElementById('customerChatModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }
    activeChatOrderId = null;
    if (chatPollingTimer) {
      clearInterval(chatPollingTimer);
      chatPollingTimer = null;
    }
    // Re-sincronizar threads para asegurar estado
    fetchChatThreads();
  };

  async function fetchChatMessages(orderId) {
    try {
      const webhookUrl = getWebhookUrl();
      const res = await fetch(`${webhookUrl}/api/chat/${encodeURIComponent(orderId)}?reader=customer`, {
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) return;
      const data = await res.json();
      const messages = data.messages || [];
      renderChatMessages(messages);
    } catch (_) {}
  }

  function renderChatMessages(messages) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container) return;

    if (!messages || messages.length === 0) {
      container.innerHTML = `
        <div class="chat-empty-hint">
          <p>👋 ¡Hola! Escribe tus dudas o indicaciones para tu pedido aquí y la gerencia de DIP LF te responderá al instante.</p>
        </div>
      `;
      return;
    }

    const wasScrolledToBottom = (container.scrollHeight - container.scrollTop <= container.clientHeight + 60);

    container.innerHTML = messages.map(msg => {
      const isCustomer = (msg.sender === 'customer');
      const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      return `
        <div class="chat-bubble-row ${isCustomer ? 'bubble-right' : 'bubble-left'}">
          <div class="chat-bubble ${isCustomer ? 'bubble-customer' : 'bubble-admin'}">
            <span class="chat-sender-name">${escapeHtml(msg.senderName || (isCustomer ? 'Tú' : 'DIP LF'))}</span>
            <p class="chat-bubble-text">${escapeHtml(msg.text)}</p>
            <span class="chat-bubble-time">${timeStr}</span>
          </div>
        </div>
      `;
    }).join('');

    if (wasScrolledToBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }

  window.sendCustomerChatMessage = async function(event) {
    if (event) event.preventDefault();
    if (!activeChatOrderId) return;

    const input = document.getElementById('chatInputText');
    const text = input ? input.value.trim() : '';
    if (!text) return;

    input.value = '';
    const btnSend = document.getElementById('btnSendChatMessage');
    if (btnSend) btnSend.disabled = true;

    let custName = 'Cliente';
    let custPhone = '';
    try {
      const rawCustomer = localStorage.getItem(CUSTOMER_STORAGE_KEY);
      if (rawCustomer) {
        const c = JSON.parse(rawCustomer);
        if (c.name) custName = c.name;
        if (c.phone) custPhone = c.phone;
      }
    } catch (_) {}

    try {
      const webhookUrl = getWebhookUrl();
      const res = await fetch(`${webhookUrl}/api/chat/${encodeURIComponent(activeChatOrderId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          sender: 'customer',
          senderName: custName,
          customerName: custName,
          customerPhone: custPhone
        }),
        signal: AbortSignal.timeout(6000)
      });

      if (res.ok) {
        fetchChatMessages(activeChatOrderId);
      }
    } catch (err) {
      console.warn('Error enviando mensaje de chat:', err);
    } finally {
      if (btnSend) btnSend.disabled = false;
      input?.focus();
    }
  };

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

})();
