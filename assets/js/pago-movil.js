/**
 * DIP LF - Módulo Cliente de Pago Móvil con Verificación Automática por SMS
 * =========================================================================
 * Este módulo gestiona:
 * 1. Formulario de Pago Móvil en el Drawer de Checkout.
 * 2. Datos receptores del comercio (Teléfono 04122694517, Banco, Cédula).
 * 3. Conversión de divisas USD -> Bolívares (Bs) según tasa BCV.
 * 4. Validación de campos: Teléfono emisor, Banco emisor, Monto Bs, Referencia.
 * 5. Registro del pedido como "pendiente" y sincronización con el servidor Webhook.
 */

// Lista oficial de Bancos de Venezuela
const VENEZUELA_BANKS = [
  { code: '0102', name: '0102 - Banco de Venezuela' },
  { code: '0134', name: '0134 - Banesco' },
  { code: '0105', name: '0105 - Mercantil' },
  { code: '0108', name: '0108 - BBVA Provincial' },
  { code: '0172', name: '0172 - Bancamiga' },
  { code: '0191', name: '0191 - BNC (Banco Nacional de Crédito)' },
  { code: '0114', name: '0114 - Bancaribe' },
  { code: '0115', name: '0115 - Banco Exterior' },
  { code: '0163', name: '0163 - Banco del Tesoro' },
  { code: '0175', name: '0175 - Banco Bicentenario' },
  { code: '0137', name: '0137 - Banco Sofitasa' },
  { code: '0151', name: '0151 - BFC Banco Fondo Común' },
  { code: '0128', name: '0128 - Banco Caroní' },
  { code: '0169', name: '0169 - Mi Banco' },
  { code: '0171', name: '0171 - Banco Activo' },
  { code: '0174', name: '0174 - Banplus' },
  { code: '0177', name: '0177 - BANFANB' }
];

// Configuración de Pago Móvil DIP LF
const PAGO_MOVIL_CONFIG_KEY = 'diplf_pm_config';
const PAGO_MOVIL_RATE_KEY = 'diplf_bcv_rate';
const WEBHOOK_SERVER_URL_KEY = 'diplf_webhook_url';

const DEFAULT_PM_CONFIG = {
  receiverPhone: '04122694517',
  receiverBank: 'Banco de Venezuela (0102) / Bancamiga (0172)',
  receiverBankCode: '0102 / 0172',
  receiverId: 'V-21726495',
  receiverName: 'DIP LF Salsas Artesanales',
  defaultRate: 395.00
};

// Obtener datos del comercio
function getPagoMovilConfig() {
  try {
    const saved = localStorage.getItem(PAGO_MOVIL_CONFIG_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Actualizar automáticamente si tenía valores de prueba anteriores
      if (parsed.receiverId === 'V-27123456' || !parsed.receiverId) {
        parsed.receiverId = 'V-21726495';
        parsed.receiverBank = 'Banco de Venezuela (0102) / Bancamiga (0172)';
        savePagoMovilConfig(parsed);
      }
      return { ...DEFAULT_PM_CONFIG, ...parsed };
    }
  } catch (e) {}
  return DEFAULT_PM_CONFIG;
}

function savePagoMovilConfig(cfg) {
  try {
    localStorage.setItem(PAGO_MOVIL_CONFIG_KEY, JSON.stringify(cfg));
  } catch (e) {}
}

// Obtener tasa oficial activa
function getBcvRate() {
  try {
    const savedRate = localStorage.getItem(PAGO_MOVIL_RATE_KEY);
    if (savedRate && !isNaN(parseFloat(savedRate))) {
      return parseFloat(savedRate);
    }
  } catch (e) {}
  return getPagoMovilConfig().defaultRate || 395.00;
}

function setBcvRate(rate) {
  try {
    localStorage.setItem(PAGO_MOVIL_RATE_KEY, String(rate));
  } catch (e) {}
}

// Obtener URL del servidor webhook (local o producción)
function getWebhookServerUrl() {
  try {
    const saved = localStorage.getItem(WEBHOOK_SERVER_URL_KEY);
    if (saved) return saved.trim();
  } catch (e) {}
  return 'https://diplf.alwaysdata.net';
}

function setWebhookServerUrl(url) {
  try {
    localStorage.setItem(WEBHOOK_SERVER_URL_KEY, String(url).trim());
  } catch (e) {}
}

// Estado del método de pago activo en el drawer: 'pagomovil' o 'whatsapp'
let currentCheckoutMethod = 'pagomovil';

// =============================================================================
// INICIALIZACIÓN DE LA UI DE PAGO MÓVIL EN EL CHECKOUT
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initPagoMovilCheckoutUI();
});

function initPagoMovilCheckoutUI() {
  const drawerFooter = document.querySelector('.drawer-footer');
  if (!drawerFooter) return;

  // Insertar selector de métodos de pago antes del total y botones
  const container = document.createElement('div');
  container.id = 'pagoMovilModuleContainer';
  container.className = 'pago-movil-checkout-module';

  container.innerHTML = `
    <!-- Selector de Método de Pago -->
    <div class="checkout-method-tabs">
      <button type="button" class="method-tab-btn active" data-method="pagomovil" onclick="switchCheckoutMethod('pagomovil')">
        <span class="tab-icon">📱</span>
        <span>Pago Móvil (VE)</span>
      </button>
      <button type="button" class="method-tab-btn" data-method="whatsapp" onclick="switchCheckoutMethod('whatsapp')">
        <span class="tab-icon">💬</span>
        <span>Coordinar WhatsApp</span>
      </button>
    </div>

    <!-- Panel 1: Formulario de Pago Móvil -->
    <div id="panelPagoMovil" class="payment-method-panel active">
      <!-- Tarjeta de Datos Receptores DIP LF -->
      <div class="pm-receiver-box">
        <div class="pm-receiver-header">
          <span class="pm-badge">Datos de Pago Móvil DIP LF</span>
          <button type="button" class="btn-copy-pm" onclick="copyPagoMovilData()">📋 Copiar Datos</button>
        </div>
        <div class="pm-receiver-grid">
          <div class="pm-data-item">
            <span class="pm-label">Banco:</span>
            <strong id="pmViewBank" class="pm-val">0102 - BDV / 0172 - Bancamiga</strong>
          </div>
          <div class="pm-data-item">
            <span class="pm-label">Teléfono:</span>
            <strong id="pmViewPhone" class="pm-val">0412-2694517</strong>
          </div>
          <div class="pm-data-item">
            <span class="pm-label">Cédula / RIF:</span>
            <strong id="pmViewId" class="pm-val">V-21726495</strong>
          </div>
          <div class="pm-data-item">
            <span class="pm-label">Tasa de Cambio:</span>
            <strong id="pmViewRate" class="pm-val rate-gold">Bs. 395.00 / $</strong>
          </div>
        </div>
      </div>

      <!-- Resumen en Bolívares -->
      <div class="pm-amount-summary">
        <div class="pm-summary-label">Monto exacto a transferir:</div>
        <div id="pmCalculatedBs" class="pm-calculated-bs">Bs. 0,00</div>
      </div>

      <!-- Formulario de Emisor y Referencia -->
      <form id="formPagoMovilSubmit" onsubmit="handlePagoMovilSubmit(event)">
        <div class="pm-form-grid">
          <div class="pm-input-group">
            <label for="pmSenderPhone">Teléfono Emisor (Tu teléfono)</label>
            <input type="tel" id="pmSenderPhone" class="pm-input" placeholder="04121234567" required pattern="[0-9]{10,11}" maxlength="11">
            <small class="pm-hint">Número desde donde hiciste el pago móvil.</small>
          </div>

          <div class="pm-input-group">
            <label for="pmSenderBank">Banco de Origen</label>
            <select id="pmSenderBank" class="pm-input select-bank" required>
              <option value="" disabled selected>Selecciona tu banco emisor...</option>
              ${VENEZUELA_BANKS.map(b => `<option value="${b.name}">${b.name}</option>`).join('')}
            </select>
          </div>

          <div class="pm-input-group">
            <label for="pmReference">Número de Referencia</label>
            <input type="text" id="pmReference" class="pm-input ref-input" placeholder="Ej: 12345678 (o últimos dígitos)" required minlength="4" maxlength="14">
            <small class="pm-hint">Código de referencia generado por tu banco.</small>
          </div>
        </div>

        <button type="submit" id="btnSubmitPagoMovil" class="btn-confirm-pagomovil">
          <span>⚡ Confirmar y Enviar Pago Móvil</span>
        </button>
      </form>

      <div class="pm-security-note">
        🛡️ Verificación automática por lectura de SMS en segundos. Tu pedido se registrará como <strong>Pendiente</strong> y pasará a <strong>Pagado</strong> en cuanto nuestro sistema reciba la confirmación bancaria.
      </div>
    </div>

    <!-- Panel de Éxito / Confirmación Inmediata -->
    <div id="panelPagoMovilSuccess" class="payment-success-card" style="display: none;">
      <div class="success-icon-pulse">⏳</div>
      <h4 class="success-title">¡Pago Móvil Registrado con Éxito!</h4>
      <div class="success-order-badge" id="successOrderNumber">ORD-000000</div>
      
      <div class="success-details-list">
        <div class="success-row">
          <span>Estado del Pedido:</span>
          <span class="badge-status-pending">PENDIENTE DE PAGO</span>
        </div>
        <div class="success-row">
          <span>Referencia Reportada:</span>
          <strong id="successRefNumber">------</strong>
        </div>
        <div class="success-row">
          <span>Monto:</span>
          <strong id="successAmountBs">Bs. 0,00</strong>
        </div>
      </div>

      <p class="success-info-text">
        Estamos esperando la confirmación bancaria por SMS en nuestro teléfono <strong>04122694517</strong>. En cuanto el banco confirme tu referencia, tu pedido se marcará automáticamente como <strong>PAGADO</strong>.
      </p>

      <div class="success-actions">
        <button type="button" class="btn-share-whatsapp-order" onclick="sharePendingOrderWhatsapp()">
          💬 Enviar comprobante por WhatsApp (Opcional)
        </button>
        <button type="button" class="btn-new-order-reset" onclick="resetOrderDrawer()">
          🛍️ Realizar otro pedido
        </button>
      </div>
    </div>
  `;

  // Insertar en el footer del drawer
  const drawerTotalRow = drawerFooter.querySelector('.drawer-total-row');
  const btnSubmitWhatsapp = document.getElementById('btnSubmitOrder');
  const drawerNote = drawerFooter.querySelector('.drawer-note');

  if (drawerTotalRow) {
    drawerFooter.insertBefore(container, drawerTotalRow);
  } else {
    drawerFooter.prepend(container);
  }

  // Ocultar botón original de whatsapp cuando pagomovil esté activo
  if (btnSubmitWhatsapp) {
    btnSubmitWhatsapp.style.display = 'none';
  }
  if (drawerNote) {
    drawerNote.style.display = 'none';
  }

  // Actualizar datos del comercio en la vista
  updatePagoMovilDetailsView();
}

// Cambiar entre pestaña Pago Móvil y WhatsApp
window.switchCheckoutMethod = function(method) {
  currentCheckoutMethod = method;
  const tabs = document.querySelectorAll('.method-tab-btn');
  tabs.forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-method') === method);
  });

  const panelPM = document.getElementById('panelPagoMovil');
  const btnSubmitWhatsapp = document.getElementById('btnSubmitOrder');
  const drawerNote = document.querySelector('.drawer-note');

  if (method === 'pagomovil') {
    if (panelPM) panelPM.style.display = 'block';
    if (btnSubmitWhatsapp) btnSubmitWhatsapp.style.display = 'none';
    if (drawerNote) drawerNote.style.display = 'none';
    updatePagoMovilAmounts();
  } else {
    if (panelPM) panelPM.style.display = 'none';
    if (btnSubmitWhatsapp) btnSubmitWhatsapp.style.display = 'flex';
    if (drawerNote) drawerNote.style.display = 'block';
  }
};

// Actualizar textos de datos receptores
function updatePagoMovilDetailsView() {
  const cfg = getPagoMovilConfig();
  const rate = getBcvRate();

  const elBank = document.getElementById('pmViewBank');
  const elPhone = document.getElementById('pmViewPhone');
  const elId = document.getElementById('pmViewId');
  const elRate = document.getElementById('pmViewRate');

  if (elBank) elBank.textContent = cfg.receiverBank;
  if (elPhone) elPhone.textContent = cfg.receiverPhone;
  if (elId) elId.textContent = cfg.receiverId;
  if (elRate) elRate.textContent = `Bs. ${rate.toFixed(2)} / $`;

  updatePagoMovilAmounts();
}

// Actualizar cálculo de Bolívares según total de carrito
function updatePagoMovilAmounts() {
  const elBs = document.getElementById('pmCalculatedBs');
  if (!elBs) return;

  if (typeof getCartTotals !== 'function') return;
  const { totalPrice } = getCartTotals();
  const rate = getBcvRate();
  const totalBs = totalPrice * rate;

  elBs.textContent = `Bs. ${totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Hook para actualizar montos cuando cambia el carrito
const originalRenderDrawerItems = window.renderDrawerItems;
if (typeof originalRenderDrawerItems === 'function') {
  window.renderDrawerItems = function() {
    originalRenderDrawerItems();
    updatePagoMovilAmounts();
  };
}

// Copiar datos de Pago Móvil al portapapeles
window.copyPagoMovilData = function() {
  const cfg = getPagoMovilConfig();
  const rate = getBcvRate();
  const { totalPrice } = typeof getCartTotals === 'function' ? getCartTotals() : { totalPrice: 0 };
  const totalBs = (totalPrice * rate).toFixed(2);

  const textToCopy = `DIP LF - Datos Pago Móvil:\nBanco: ${cfg.receiverBank}\nTeléfono: ${cfg.receiverPhone}\nCédula: ${cfg.receiverId}\nMonto a transferir: Bs. ${totalBs} ($${totalPrice.toFixed(2)} USD)`;

  navigator.clipboard.writeText(textToCopy).then(() => {
    alert('✅ Datos de Pago Móvil copiados al portapapeles.\nPégalos en la app de tu banco.');
  }).catch(() => {
    prompt('Copia los datos de Pago Móvil:', textToCopy);
  });
};

// =============================================================================
// SUBMIT DE PAGO MÓVIL (GUARDAR PEDIDO COMO PENDIENTE)
// =============================================================================
let lastCreatedOrder = null;

window.handlePagoMovilSubmit = async function(event) {
  event.preventDefault();

  if (typeof cart === 'undefined' || cart.length === 0) {
    alert('Tu consulta está vacía. Añade al menos una salsa antes de pagar.');
    return;
  }

  const { totalCount, totalPrice } = getCartTotals();
  const rate = getBcvRate();
  const totalBs = Number((totalPrice * rate).toFixed(2));

  const phoneInput = document.getElementById('pmSenderPhone');
  const bankInput = document.getElementById('pmSenderBank');
  const refInput = document.getElementById('pmReference');

  const senderPhone = (phoneInput?.value || '').trim().replace(/[^0-9]/g, '');
  const senderBank = (bankInput?.value || '').trim();
  const reference = (refInput?.value || '').trim().replace(/[^0-9]/g, '');

  if (senderPhone.length < 10) {
    alert('Por favor ingresa un número de teléfono válido (Ej: 04121234567).');
    phoneInput?.focus();
    return;
  }

  if (!senderBank) {
    alert('Por favor selecciona tu banco emisor.');
    bankInput?.focus();
    return;
  }

  if (reference.length < 4) {
    alert('Por favor ingresa el número de referencia bancaria (mínimo 4 dígitos).');
    refInput?.focus();
    return;
  }

  const btnSubmit = document.getElementById('btnSubmitPagoMovil');
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span>⏳ Registrando Pago Móvil...</span>';
  }

  // Construir objeto de pedido con estado PENDIENTE
  const orderData = {
    items: cart.map(i => ({
      flavorId: i.flavorId,
      name: i.name,
      sizeName: i.sizeName,
      sizeKey: i.sizeKey,
      price: i.price,
      quantity: i.quantity
    })),
    totalCount: totalCount,
    totalPrice: totalPrice,
    paymentMethod: 'pago_movil',
    paymentDetails: {
      senderPhone: senderPhone,
      originBank: senderBank,
      amountUsd: totalPrice,
      amountBs: totalBs,
      reference: reference,
      rate: rate,
      receiverPhone: getPagoMovilConfig().receiverPhone
    },
    customerNote: `Pago Móvil Ref: ${reference} (${senderBank})`,
    status: 'pendiente' // REGLA: Estado inicial PENDIENTE
  };

  // 1. Guardar en el sistema local (localStorage & CustomEvent para Almacén)
  let savedOrder = null;
  if (typeof recordNewOrder === 'function') {
    savedOrder = recordNewOrder(orderData);
  }

  if (!savedOrder) {
    savedOrder = {
      id: 'ORD-' + Math.floor(100000 + Math.random() * 900000),
      ...orderData,
      date: new Date().toISOString()
    };
  }

  lastCreatedOrder = savedOrder;

  // 2. Intentar sincronizar con el Servidor Webhook de fondo (si está corriendo)
  const webhookUrl = getWebhookServerUrl();
  try {
    fetch(`${webhookUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(savedOrder)
    }).catch(err => {
      // Si el servidor local no está activo en este momento, no detiene la experiencia del usuario
      console.log('Servidor webhook local offline o no alcanzable desde el navegador cliente:', err.message);
    });
  } catch (_) {}

  // 3. Vaciar el carrito
  cart = [];
  if (typeof saveCart === 'function') saveCart();
  if (typeof updateCartUI === 'function') updateCartUI();

  // 4. Mostrar panel de confirmación en el Drawer
  showOrderSuccessState(savedOrder);
};

// Mostrar pantalla de confirmación dentro del Drawer
function showOrderSuccessState(order) {
  const panelForm = document.getElementById('panelPagoMovil');
  const panelSuccess = document.getElementById('panelPagoMovilSuccess');
  const drawerTotalRow = document.querySelector('.drawer-total-row');

  if (panelForm) panelForm.style.display = 'none';
  if (drawerTotalRow) drawerTotalRow.style.display = 'none';

  if (panelSuccess) {
    panelSuccess.style.display = 'block';
    const elOrderNum = document.getElementById('successOrderNumber');
    const elRef = document.getElementById('successRefNumber');
    const elBs = document.getElementById('successAmountBs');

    if (elOrderNum) elOrderNum.textContent = `#${order.id}`;
    if (elRef) elRef.textContent = order.paymentDetails?.reference || 'N/A';
    if (elBs) elBs.textContent = `Bs. ${(order.paymentDetails?.amountBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
  }
}

// Compartir orden pendiente por WhatsApp con todos los datos
window.sharePendingOrderWhatsapp = function() {
  if (!lastCreatedOrder) return;

  const o = lastCreatedOrder;
  const p = o.paymentDetails || {};
  let msg = `¡Hola DIP LF! 👋 Acabo de registrar mi pedido en la web con Pago Móvil:\n\n`;
  msg += `📦 *ORDEN:* #${o.id}\n`;
  msg += `⏳ *ESTADO:* Pendiente de verificación\n`;
  msg += `💳 *BANCO EMISOR:* ${p.originBank}\n`;
  msg += `📱 *TELÉFONO EMISOR:* ${p.senderPhone}\n`;
  msg += `🔢 *REFERENCIA:* ${p.reference}\n`;
  msg += `💰 *MONTO:* Bs. ${p.amountBs} ($${o.totalPrice.toFixed(2)} USD)\n\n`;
  msg += `🛒 *DETALLE DEL PEDIDO:*\n`;

  (o.items || []).forEach(it => {
    msg += `• ${it.quantity}x ${it.name} (${it.sizeName})\n`;
  });

  msg += `\nAdjunto les estaré compartiendo la captura del banco. ¡Muchas gracias!`;

  const phone = (typeof WHATSAPP_PHONE !== 'undefined') ? WHATSAPP_PHONE : '584122694517';
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
};

// Reiniciar drawer para un nuevo pedido
window.resetOrderDrawer = function() {
  const panelForm = document.getElementById('panelPagoMovil');
  const panelSuccess = document.getElementById('panelPagoMovilSuccess');
  const drawerTotalRow = document.querySelector('.drawer-total-row');
  const btnSubmit = document.getElementById('btnSubmitPagoMovil');

  if (panelForm) panelForm.style.display = 'block';
  if (panelSuccess) panelSuccess.style.display = 'none';
  if (drawerTotalRow) drawerTotalRow.style.display = 'flex';
  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = '<span>⚡ Confirmar y Enviar Pago Móvil</span>';
  }

  // Limpiar campos
  const form = document.getElementById('formPagoMovilSubmit');
  if (form) form.reset();

  if (typeof toggleDrawer === 'function') {
    toggleDrawer(false);
  }
};
