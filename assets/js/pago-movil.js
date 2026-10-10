/**
 * DIP LF - Módulo Cliente de Pago Móvil con Verificación Automática por SMS
 * =========================================================================
 * Este módulo gestiona:
 * 1. Formulario de Pago Móvil en el Drawer de Checkout.
 * 2. Datos receptores del comercio (Teléfono 04122694517, Banco de Venezuela y Bancamiga, Cédula V-21726495).
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

// Cuentas oficiales de Pago Móvil receptoras activas en DIP LF
const OFFICIAL_PM_ACCOUNTS = [
  {
    id: 'bdv',
    badge: 'Venezuela (0102)',
    bankName: 'Banco de Venezuela (BDV)',
    bankCode: '0102',
    phone: '0412-2694517',
    phoneRaw: '04122694517',
    idCard: 'V-21726495',
    idCardRaw: '21726495',
    icon: '🏛️'
  },
  {
    id: 'bancamiga',
    badge: 'Bancamiga (0172)',
    bankName: 'Bancamiga',
    bankCode: '0172',
    phone: '0412-2694517',
    phoneRaw: '04122694517',
    idCard: 'V-21726495',
    idCardRaw: '21726495',
    icon: '💳'
  }
];

let selectedPmAccountId = 'bdv';

function getSelectedPmAccount() {
  return OFFICIAL_PM_ACCOUNTS.find(a => a.id === selectedPmAccountId) || OFFICIAL_PM_ACCOUNTS[0];
}

window.selectPmAccount = function(accountId) {
  const target = OFFICIAL_PM_ACCOUNTS.find(a => a.id === accountId);
  if (!target) return;
  selectedPmAccountId = accountId;

  const chips = document.querySelectorAll('.pm-account-chip');
  chips.forEach(chip => {
    chip.classList.toggle('active', chip.getAttribute('data-account') === accountId);
  });

  updatePagoMovilDetailsView();
};

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
    if (saved && saved.trim()) return saved.trim();
  } catch (e) {}
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    if (host === 'diplf.com' || host === 'www.diplf.com' || host === 'diplf.alwaysdata.net' || host.includes('alwaysdata.net') || host === 'localhost' || host === '127.0.0.1') {
      return window.location.origin;
    }
  }
  return 'https://diplf.com';
}

function setWebhookServerUrl(url) {
  try {
    localStorage.setItem(WEBHOOK_SERVER_URL_KEY, String(url).trim());
  } catch (e) {}
}

// Sincronizar datos del comercio en vivo desde el servidor Alwaysdata
async function syncPagoMovilConfigFromServer() {
  try {
    const serverUrl = getWebhookServerUrl();
    const res = await fetch(`${serverUrl}/api/config`);
    if (res.ok) {
      const data = await res.json();
      const cfgData = (data && data.config) ? data.config : data;
      if (cfgData) {
        if (cfgData.bcvRate) setBcvRate(cfgData.bcvRate);
        if (typeof updatePagoMovilDetailsView === 'function') {
          updatePagoMovilDetailsView();
        }
      }
    }
  } catch (_) {}
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
  syncPagoMovilConfigFromServer();
  const drawerBody = document.querySelector('.drawer-body');
  const drawerCartList = document.getElementById('drawerCartList');
  const drawerFooter = document.querySelector('.drawer-footer');
  if (!drawerBody || !drawerFooter) return;

  // Evitar duplicados si ya fue inicializado
  if (document.getElementById('pagoMovilModuleContainer')) return;

  // Contenedor principal de selección de método y formularios en .drawer-body
  const container = document.createElement('div');
  container.id = 'pagoMovilModuleContainer';
  container.className = 'pago-movil-checkout-module';

  container.innerHTML = `
    <!-- Datos del Cliente (Identificación y Entrega) -->
    <div class="drawer-section-heading">
      <span class="heading-badge">Paso 2</span>
      <span class="heading-title">Tus Datos para la Orden</span>
    </div>

    <div class="pm-customer-info-box">
      <div class="pm-form-grid pm-customer-grid">
        <div class="pm-input-group pm-col-full">
          <label for="pmCustomerName">
            <span>Nombre y Apellido</span>
            <span class="req-star">*</span>
          </label>
          <input type="text" id="pmCustomerName" class="pm-input" placeholder="Ej: Carlos Mendoza" required autocomplete="name">
        </div>

        <div class="pm-input-group">
          <label for="pmCustomerId">
            <span>Cédula o RIF</span>
            <span class="req-star">*</span>
          </label>
          <input type="text" id="pmCustomerId" class="pm-input" placeholder="Ej: V-21726495" required maxlength="12">
        </div>

        <div class="pm-input-group">
          <label for="pmSenderPhone">
            <span>Teléfono / WhatsApp</span>
            <span class="req-star">*</span>
          </label>
          <input type="tel" id="pmSenderPhone" class="pm-input" placeholder="Ej: 04121234567" required pattern="[0-9]{10,11}" maxlength="11" oninput="hidePmVerificationAlert()">
        </div>
      </div>
    </div>

    <!-- Divisor y Título de Sección -->
    <div class="drawer-section-heading" style="margin-top: 14px;">
      <span class="heading-badge">Paso 3</span>
      <span class="heading-title">Método de Pago</span>
    </div>

    <!-- Selector de Método de Pago -->
    <div class="checkout-method-tabs">
      <button type="button" class="method-tab-btn active" data-method="pagomovil" onclick="switchCheckoutMethod('pagomovil')">
        <span class="tab-icon">⚡</span>
        <span class="tab-text">Pago Móvil (Instantáneo)</span>
      </button>
      <button type="button" class="method-tab-btn" data-method="whatsapp" onclick="switchCheckoutMethod('whatsapp')">
        <span class="tab-icon">💬</span>
        <span class="tab-text">Coordinar WhatsApp</span>
      </button>
    </div>

    <!-- Panel 1: Formulario de Pago Móvil -->
    <div id="panelPagoMovil" class="payment-method-panel active">
      <!-- Tarjeta Compacta y Moderna de Datos Receptores DIP LF -->
      <div class="pm-receiver-box">
        <div class="pm-receiver-header">
          <div class="pm-receiver-title-badge">
            <span class="pm-badge-dot"></span>
            <span>Cuentas Pago Móvil DIP LF</span>
          </div>
          <button type="button" class="btn-copy-pm" onclick="copyPagoMovilData()" title="Copiar datos al portapapeles">
            📋 Copiar Datos
          </button>
        </div>

        <!-- Selector de Cuenta Bancaria Destino (Venezuela, Bancamiga) -->
        <div class="pm-account-selector-container">
          <span class="pm-account-selector-title">Selecciona la cuenta destino a transferir:</span>
          <div class="pm-account-chips">
            <button type="button" class="pm-account-chip ${selectedPmAccountId === 'bdv' ? 'active' : ''}" data-account="bdv" onclick="selectPmAccount('bdv')" title="Transferir a Banco de Venezuela">
              <span class="chip-icon">🏛️</span>
              <span class="chip-text">Venezuela (0102)</span>
            </button>
            <button type="button" class="pm-account-chip ${selectedPmAccountId === 'bancamiga' ? 'active' : ''}" data-account="bancamiga" onclick="selectPmAccount('bancamiga')" title="Transferir a Bancamiga">
              <span class="chip-icon">💳</span>
              <span class="chip-text">Bancamiga (0172)</span>
            </button>
          </div>
        </div>

        <div class="pm-receiver-grid">
          <div class="pm-data-pill">
            <span class="pm-pill-label">📱 Teléfono</span>
            <strong id="pmViewPhone" class="pm-pill-val">0412-2694517</strong>
          </div>
          <div class="pm-data-pill">
            <span class="pm-pill-label">🪪 Cédula / RIF</span>
            <strong id="pmViewId" class="pm-pill-val">V-21726495</strong>
          </div>
          <div class="pm-data-pill pm-pill-full">
            <span class="pm-pill-label">🏦 Banco Destino</span>
            <strong id="pmViewBank" class="pm-pill-val pm-pill-banks">Banco de Venezuela (BDV) (0102)</strong>
          </div>
          <div class="pm-data-pill pm-pill-full pm-pill-rate">
            <span class="pm-pill-label">📈 Tasa Oficial BCV</span>
            <strong id="pmViewRate" class="pm-pill-val rate-gold">Bs. 395.00 / $</strong>
          </div>
        </div>
      </div>

      <!-- Resumen en Bolívares con Alto Contraste -->
      <div class="pm-amount-summary">
        <div class="pm-amount-left">
          <span class="pm-amount-title">Monto exacto a transferir:</span>
          <span class="pm-amount-sub">Tasa oficial BCV</span>
        </div>
        <div class="pm-amount-right">
          <div id="pmCalculatedBs" class="pm-calculated-bs">Bs. 0,00</div>
          <div id="pmCalculatedUsdSub" class="pm-calculated-usd">($0.00 USD)</div>
        </div>
      </div>

      <!-- Formulario de Emisor y Referencia -->
      <form id="formPagoMovilSubmit" onsubmit="handlePagoMovilSubmit(event)">
        <div class="pm-form-grid" style="grid-template-columns: 1fr 1fr;">
          <div class="pm-input-group" style="grid-column: 1 / -1;">
            <label for="pmSenderBank">
              <span>Banco desde donde envías</span>
              <span class="req-star">*</span>
            </label>
            <select id="pmSenderBank" class="pm-input select-bank" required onchange="hidePmVerificationAlert()">
              <option value="" disabled selected>Selecciona tu banco emisor...</option>
              ${VENEZUELA_BANKS.map(b => `<option value="${b.name}">${b.name}</option>`).join('')}
            </select>
          </div>

          <div class="pm-input-group" style="grid-column: 1 / -1;">
            <label for="pmReference">
              <span>Número de Referencia</span>
              <span class="req-star">*</span>
            </label>
            <input type="text" id="pmReference" class="pm-input ref-input" placeholder="Ej: 007588648037 (o últimos dígitos)" required minlength="4" maxlength="14" oninput="hidePmVerificationAlert()">
          </div>
        </div>

        <!-- Alerta interactiva de error si no se encuentra el pago móvil en cuenta -->
        <div id="pmVerificationAlert" class="pm-verify-alert" style="display: none;"></div>
      </form>
    </div>

    <!-- Panel 2: Información para Coordinar por WhatsApp -->
    <div id="panelWhatsappInfo" class="panel-whatsapp-info" style="display: none;">
      <div class="wa-info-card">
        <div class="wa-info-icon">💬</div>
        <h5 class="wa-info-title">Atención Directa por WhatsApp</h5>
        <p class="wa-info-desc">
          Tus datos (Nombre, Cédula y Teléfono) quedarán registrados en tu orden. Al tocar el botón de abajo se abrirá WhatsApp con el resumen de tus salsas para coordinar tu método de pago preferido, entrega en persona o delivery.
        </p>
      </div>
    </div>

    <!-- Panel de Éxito / Confirmación Verificada -->
    <div id="panelPagoMovilSuccess" class="payment-success-card" style="display: none;">
      <div class="success-icon-pulse" id="successIcon">✅</div>
      <h4 class="success-title" id="successTitle">¡Pago Móvil Verificado y Aprobado!</h4>
      <div class="success-order-badge" id="successOrderNumber">ORD-000000</div>
      
      <div class="success-details-list">
        <div class="success-row">
          <span>Estado del Pedido:</span>
          <span id="successStatusBadge" class="badge-status-paid">PAGADO (VERIFICADO POR BANCO)</span>
        </div>
        <div class="success-row">
          <span>Referencia Confirmada:</span>
          <strong id="successRefNumber">------</strong>
        </div>
        <div class="success-row">
          <span>Monto Acreditado:</span>
          <strong id="successAmountBs">Bs. 0,00</strong>
        </div>
        <div class="success-row" id="successBankRow">
          <span>Banco:</span>
          <strong id="successBankName">------</strong>
        </div>
      </div>

      <p class="success-info-text" id="successInfoText">
        Hemos confirmado automáticamente la recepción de tu pago móvil en nuestra cuenta bancaria. ¡Tu orden ya está confirmada y en preparación!
      </p>

      <div class="success-actions">
        <button type="button" class="btn-track-order-direct" onclick="goToOrderTracking()">
          📦 Ver Guía y Rastreo de mi Orden
        </button>
        <button type="button" class="btn-share-whatsapp-order" onclick="sharePendingOrderWhatsapp()">
          💬 Notificar por WhatsApp
        </button>
        <button type="button" class="btn-new-order-reset" onclick="resetOrderDrawer()">
          🛍️ Realizar otro pedido
        </button>
      </div>
    </div>
  `;

  // 1. Insertar módulo de checkout en .drawer-body después de los productos
  if (drawerCartList) {
    drawerCartList.after(container);
  } else {
    drawerBody.appendChild(container);
  }

  // 2. Insertar botón de Pago Móvil en .drawer-footer (sticky abajo)
  let btnSubmitPagoMovil = document.getElementById('btnSubmitPagoMovil');
  if (!btnSubmitPagoMovil) {
    btnSubmitPagoMovil = document.createElement('button');
    btnSubmitPagoMovil.type = 'button';
    btnSubmitPagoMovil.id = 'btnSubmitPagoMovil';
    btnSubmitPagoMovil.className = 'btn-confirm-pagomovil';
    btnSubmitPagoMovil.onclick = function(e) { window.submitPagoMovilForm(e); };
    btnSubmitPagoMovil.innerHTML = '<span>⚡ Confirmar y Enviar Pago Móvil</span>';

    const btnWhatsapp = document.getElementById('btnSubmitOrder');
    if (btnWhatsapp) {
      drawerFooter.insertBefore(btnSubmitPagoMovil, btnWhatsapp);
    } else {
      drawerFooter.appendChild(btnSubmitPagoMovil);
    }
  }

  // 3. Agregar badge en Bolívares en la fila del total del footer
  let totalBsBadge = document.getElementById('drawerTotalBsBadge');
  if (!totalBsBadge) {
    const totalTitle = drawerFooter.querySelector('.total-title');
    if (totalTitle) {
      totalBsBadge = document.createElement('span');
      totalBsBadge.id = 'drawerTotalBsBadge';
      totalBsBadge.className = 'total-bs-tag';
      totalTitle.after(totalBsBadge);
    }
  }

  // 4. Agregar nota de seguridad compacta en el footer
  let pmSecNote = document.getElementById('pmSecurityNote');
  if (!pmSecNote) {
    pmSecNote = document.createElement('div');
    pmSecNote.id = 'pmSecurityNote';
    pmSecNote.className = 'pm-security-note-footer';
    pmSecNote.innerHTML = '🛡️ Verificación bancaria instantánea 24/7';
    drawerFooter.appendChild(pmSecNote);
  }

  // Activar método por defecto (Pago Móvil)
  switchCheckoutMethod('pagomovil');

  // Actualizar datos del comercio en la vista
  updatePagoMovilDetailsView();

  // Rellenar datos guardados del cliente si existen en localStorage
  try {
    const savedCustomer = JSON.parse(localStorage.getItem('diplf_customer_info') || '{}');
    const nameInput = document.getElementById('pmCustomerName');
    const idInput = document.getElementById('pmCustomerId');
    const phoneInput = document.getElementById('pmSenderPhone');
    if (savedCustomer.name && nameInput && !nameInput.value) nameInput.value = savedCustomer.name;
    if (savedCustomer.id && idInput && !idInput.value) idInput.value = savedCustomer.id;
    if (savedCustomer.phone && phoneInput && !phoneInput.value) phoneInput.value = savedCustomer.phone;
  } catch (_) {}
}

// Disparador manual para el botón de Pago Móvil del footer
window.submitPagoMovilForm = function(event) {
  if (event) event.preventDefault();
  const form = document.getElementById('formPagoMovilSubmit');
  if (!form) return;

  // Validación nativa HTML5 de inputs
  if (form.reportValidity && !form.reportValidity()) {
    return;
  }

  handlePagoMovilSubmit(event);
};

// Cambiar entre pestaña Pago Móvil y WhatsApp
window.switchCheckoutMethod = function(method) {
  currentCheckoutMethod = method;
  const tabs = document.querySelectorAll('.method-tab-btn');
  tabs.forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-method') === method);
  });

  const panelPM = document.getElementById('panelPagoMovil');
  const panelWA = document.getElementById('panelWhatsappInfo');
  const btnSubmitWhatsapp = document.getElementById('btnSubmitOrder');
  const btnSubmitPagoMovil = document.getElementById('btnSubmitPagoMovil');
  const drawerNote = document.querySelector('.drawer-note');
  const pmSecNote = document.getElementById('pmSecurityNote');

  if (method === 'pagomovil') {
    if (panelPM) panelPM.style.display = 'flex';
    if (panelWA) panelWA.style.display = 'none';
    if (btnSubmitPagoMovil) btnSubmitPagoMovil.style.display = 'flex';
    if (btnSubmitWhatsapp) btnSubmitWhatsapp.style.display = 'none';
    if (drawerNote) drawerNote.style.display = 'none';
    if (pmSecNote) pmSecNote.style.display = 'block';
    updatePagoMovilAmounts();
  } else {
    if (panelPM) panelPM.style.display = 'none';
    if (panelWA) panelWA.style.display = 'block';
    if (btnSubmitPagoMovil) btnSubmitPagoMovil.style.display = 'none';
    if (btnSubmitWhatsapp) btnSubmitWhatsapp.style.display = 'flex';
    if (drawerNote) drawerNote.style.display = 'block';
    if (pmSecNote) pmSecNote.style.display = 'none';
  }
};

// Actualizar textos de datos receptores
function updatePagoMovilDetailsView() {
  const account = getSelectedPmAccount();
  const rate = getBcvRate();

  const elBank = document.getElementById('pmViewBank');
  const elPhone = document.getElementById('pmViewPhone');
  const elId = document.getElementById('pmViewId');
  const elRate = document.getElementById('pmViewRate');

  if (elBank) elBank.textContent = `${account.bankName} (${account.bankCode})`;
  if (elPhone) elPhone.textContent = account.phone;
  if (elId) elId.textContent = account.idCard;
  if (elRate) elRate.textContent = `Bs. ${rate.toFixed(2)} / $`;

  updatePagoMovilAmounts();
}

// Actualizar cálculo de Bolívares según total de carrito
function updatePagoMovilAmounts() {
  const elBs = document.getElementById('pmCalculatedBs');
  const elUsdSub = document.getElementById('pmCalculatedUsdSub');
  const elTotalBsBadge = document.getElementById('drawerTotalBsBadge');
  const container = document.getElementById('pagoMovilModuleContainer');
  const drawerFooter = document.querySelector('.drawer-footer');

  if (typeof getCartTotals !== 'function') return;
  const { totalCount, totalPrice } = getCartTotals();
  const rate = getBcvRate();
  const totalBs = totalPrice * rate;
  const bsFormatted = `Bs. ${totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (elBs) elBs.textContent = bsFormatted;
  if (elUsdSub) elUsdSub.textContent = `($${(typeof formatUsdAmount === 'function' ? formatUsdAmount(totalPrice) : totalPrice.toFixed(2))} USD)`;
  if (elTotalBsBadge) elTotalBsBadge.textContent = bsFormatted;

  // Si la orden ya fue aprobada y estamos en pantalla de éxito, no alterar visibilidad
  if (window.isOrderSuccessActive) {
    if (container) container.style.display = 'flex';
    if (drawerFooter) drawerFooter.style.display = 'none';
    return;
  }

  // Si el carrito está vacío, ocultar el formulario de pago y el footer
  if (container) {
    container.style.display = (totalCount > 0) ? 'flex' : 'none';
  }
  if (drawerFooter) {
    drawerFooter.style.display = (totalCount > 0) ? 'block' : 'none';
  }
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
  const account = getSelectedPmAccount();
  const rate = getBcvRate();
  const { totalPrice } = typeof getCartTotals === 'function' ? getCartTotals() : { totalPrice: 0 };
  const totalBs = (totalPrice * rate).toFixed(2);

  const textToCopy = `DIP LF - Datos Pago Móvil:\nBanco: ${account.bankName} (${account.bankCode})\nTeléfono: ${account.phone}\nCédula: ${account.idCard}\nMonto a transferir: Bs. ${totalBs} ($${totalPrice.toFixed(2)} USD)`;

  navigator.clipboard.writeText(textToCopy).then(() => {
    alert(`✅ Datos de ${account.bankName} copiados al portapapeles.\nPégalos en la app de tu banco.`);
  }).catch(() => {
    prompt('Copia los datos de Pago Móvil:', textToCopy);
  });
};

// =============================================================================
// ALERTAS DE VERIFICACIÓN DE PAGO MÓVIL
// =============================================================================
function escapePmHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.hidePmVerificationAlert = function() {
  const alertEl = document.getElementById('pmVerificationAlert');
  if (alertEl) {
    alertEl.style.display = 'none';
    alertEl.innerHTML = '';
  }
};

window.showPmVerificationAlert = function({ reference, amountBs, reason }) {
  const alertEl = document.getElementById('pmVerificationAlert');
  if (!alertEl) return;

  const bsFormatted = Number(amountBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cleanRef = String(reference || '').trim();

  alertEl.innerHTML = `
    <div class="pm-alert-inner">
      <div class="pm-alert-icon">❌</div>
      <div class="pm-alert-text">
        <h5 class="pm-alert-title">Pago Móvil no encontrado en cuenta</h5>
        <p class="pm-alert-desc">
          No recibimos confirmación bancaria para la referencia <strong class="pm-alert-highlight">${escapePmHtml(cleanRef)}</strong> por el monto de <strong class="pm-alert-highlight">Bs. ${bsFormatted}</strong>.
        </p>
        <ul class="pm-alert-checklist">
          <li>Verifica que hayas escrito el número exacto de referencia que emitió tu banco.</li>
          <li>Si acabas de realizar la transferencia, espera 10 segundos a que el banco liquide e intenta nuevamente.</li>
        </ul>
        <div class="pm-alert-actions">
          <button type="button" class="btn-alert-whatsapp" onclick="openWhatsappManualVerification('${escapePmHtml(cleanRef)}', ${amountBs})">
            💬 ¿Ya te debitaron el dinero? Enviar comprobante por WhatsApp
          </button>
        </div>
      </div>
    </div>
  `;
  alertEl.style.display = 'block';
  alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window.openWhatsappManualVerification = function(ref, amountBs) {
  const phone = (typeof WHATSAPP_PHONE !== 'undefined') ? WHATSAPP_PHONE : '584122694517';
  const bsFormatted = Number(amountBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let msg = `¡Hola DIP LF! 👋 Realicé un Pago Móvil por Bs. ${bsFormatted} (Ref: ${ref}) para mi pedido, pero no fue detectado automáticamente por el banco.\n\n`;
  msg += `Aquí les comparto mi comprobante para verificarlo y procesar mi orden. ¡Gracias!`;
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
};

// =============================================================================
// SUBMIT DE PAGO MÓVIL (VERIFICACIÓN EN TIEMPO REAL CON EL BANCO)
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
  const nameInput = document.getElementById('pmCustomerName');
  const idInput = document.getElementById('pmCustomerId');

  const customerName = (nameInput?.value || '').trim();
  const customerId = (idInput?.value || '').trim().toUpperCase();
  const senderPhone = (phoneInput?.value || '').trim().replace(/[^0-9]/g, '');
  const senderBank = (bankInput?.value || '').trim();
  const reference = (refInput?.value || '').trim().replace(/[^0-9]/g, '');

  if (!customerName || customerName.length < 3) {
    alert('Por favor ingresa tu Nombre y Apellido para registrar la orden.');
    nameInput?.focus();
    return;
  }

  if (!customerId || customerId.length < 5) {
    alert('Por favor ingresa tu Cédula o RIF (Ej: V-21726495).');
    idInput?.focus();
    return;
  }

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

  // Guardar datos del cliente para su comodidad futura
  try {
    localStorage.setItem('diplf_customer_info', JSON.stringify({
      name: customerName,
      id: customerId,
      phone: senderPhone
    }));
  } catch (_) {}

  hidePmVerificationAlert();

  const btnSubmit = document.getElementById('btnSubmitPagoMovil');
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span class="pm-spinner">⏳</span> <span>Verificando pago con el banco...</span>';
  }

  // Realizar hasta 3 intentos de verificación espaciados por 2.5s
  const webhookUrl = getWebhookServerUrl();
  const maxAttempts = 3;
  let verifiedResult = null;
  let lastErrorMessage = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      if (btnSubmit) {
        btnSubmit.innerHTML = `<span class="pm-spinner">⏳</span> <span>Esperando confirmación bancaria (${attempt}/${maxAttempts})...</span>`;
      }
      await new Promise(r => setTimeout(r, 2500));
    }

    try {
      const response = await fetch(`${webhookUrl}/api/verify-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: reference,
          amountBs: totalBs,
          phone: senderPhone,
          bank: senderBank
        }),
        signal: AbortSignal.timeout(6000)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.verified) {
          verifiedResult = data;
          break;
        } else {
          lastErrorMessage = data.reason || 'Referencia no encontrada';
        }
      } else {
        lastErrorMessage = 'El servidor no pudo validar la referencia.';
      }
    } catch (err) {
      console.warn(`Intento ${attempt} de verificación falló:`, err.message);
      lastErrorMessage = 'No se pudo conectar con el servidor de verificación bancaria.';
    }
  }

  // SI NO SE VERIFICA: MOSTRAR ERROR, MANTENER CARRITO INTACTO Y NO CREAR ORDEN
  if (!verifiedResult || !verifiedResult.verified) {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = '<span>⚡ Confirmar y Enviar Pago Móvil</span>';
    }

    showPmVerificationAlert({
      reference: reference,
      amountBs: totalBs,
      reason: lastErrorMessage
    });

    if (refInput) {
      refInput.focus();
      refInput.select();
    }
    return;
  }

  // SI SE VERIFICA CON ÉXITO: CONSTRUIR Y REGISTRAR PEDIDO PAGADO
  const selectedAccount = getSelectedPmAccount();
  const orderData = {
    customerName: customerName,
    customerId: customerId,
    customerPhone: senderPhone,
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
      receiverPhone: selectedAccount.phoneRaw,
      receiverBank: selectedAccount.bankName,
      receiverBankCode: selectedAccount.bankCode,
      receiverId: selectedAccount.idCard
    },
    customerNote: `Pago Móvil Ref: ${reference} (${senderBank}) a ${selectedAccount.bankName} - Verificado por SMS`,
    status: 'pagado', // ESTADO PAGADO DIRECTO
    verifiedBySms: true,
    verifiedAt: new Date().toISOString(),
    smsId: verifiedResult.smsId,
    smsMatch: verifiedResult.parsed
  };

  // 1. Guardar en local (localStorage & CustomEvent para Almacén)
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

  // 2. Registrar en servidor webhook para marcar SMS como usado y asociarlo a la orden
  try {
    fetch(`${webhookUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...savedOrder,
        smsId: verifiedResult.smsId || savedOrder.smsId,
        verifiedBySms: true
      })
    }).catch(err => {
      console.log('Error notificando pedido al servidor:', err.message);
    });
  } catch (_) {}

  // 3. Activar bandera de orden confirmada para mantener panel de éxito visible en el drawer
  window.isOrderSuccessActive = true;

  // 4. Vaciar carrito SOLO tras confirmación real del banco
  cart = [];
  if (typeof saveCart === 'function') saveCart();
  if (typeof updateCartUI === 'function') updateCartUI();

  // 5. Mostrar panel de confirmación en el Drawer
  showOrderSuccessState(savedOrder, verifiedResult);
};

// Mostrar pantalla de confirmación verificada dentro del Drawer
function showOrderSuccessState(order, verifiedData) {
  window.isOrderSuccessActive = true;

  const container = document.getElementById('pagoMovilModuleContainer');
  const drawerEmpty = document.getElementById('drawerEmptyState');
  const drawerCartList = document.getElementById('drawerCartList');
  const sectionHeading = document.querySelector('.drawer-section-heading');
  const checkoutTabs = document.querySelector('.checkout-method-tabs');
  const panelForm = document.getElementById('panelPagoMovil');
  const panelSuccess = document.getElementById('panelPagoMovilSuccess');
  const drawerFooter = document.querySelector('.drawer-footer');
  const btnSubmit = document.getElementById('btnSubmitPagoMovil');

  if (drawerEmpty) drawerEmpty.style.display = 'none';
  if (drawerCartList) drawerCartList.style.display = 'none';
  if (sectionHeading) sectionHeading.style.display = 'none';
  if (checkoutTabs) checkoutTabs.style.display = 'none';
  if (panelForm) panelForm.style.display = 'none';
  if (drawerFooter) drawerFooter.style.display = 'none';

  // Asegurar que el contenedor principal esté visible
  if (container) container.style.display = 'flex';

  // Restaurar el botón para que no se quede con el spinner "Verificando..."
  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = '<span>⚡ Confirmar y Enviar Pago Móvil</span>';
  }

  if (panelSuccess) {
    panelSuccess.style.display = 'block';
    const elOrderNum = document.getElementById('successOrderNumber');
    const elRef = document.getElementById('successRefNumber');
    const elBs = document.getElementById('successAmountBs');
    const elBank = document.getElementById('successBankName');
    const elBadge = document.getElementById('successStatusBadge');
    const elTitle = document.getElementById('successTitle');
    const elInfo = document.getElementById('successInfoText');
    const elIcon = document.getElementById('successIcon');

    if (elOrderNum) elOrderNum.textContent = `#${order.id}`;
    if (elRef) elRef.textContent = order.paymentDetails?.reference || 'N/A';
    if (elBs) elBs.textContent = `Bs. ${(order.paymentDetails?.amountBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
    if (elBank) elBank.textContent = verifiedData?.parsed?.bank || order.paymentDetails?.originBank || 'Banco Nacional';
    
    if (elBadge) {
      elBadge.className = 'badge-status-paid';
      elBadge.textContent = 'PAGADO (VERIFICADO POR BANCO)';
    }
    if (elTitle) elTitle.textContent = '¡Pago Móvil Verificado y Aprobado!';
    if (elIcon) elIcon.textContent = '✅';
    if (elInfo) {
      const targetAccount = OFFICIAL_PM_ACCOUNTS.find(a => 
        a.phoneRaw === order.paymentDetails?.receiverPhone || 
        a.bankCode === order.paymentDetails?.receiverBankCode
      ) || getSelectedPmAccount();
      const bankLabel = order.paymentDetails?.receiverBank || targetAccount.bankName;
      const phoneLabel = order.paymentDetails?.receiverPhone || targetAccount.phone;
      elInfo.innerHTML = `Confirmamos con éxito la recepción de tu transferencia bancaria en nuestra cuenta <strong>${bankLabel}</strong> (${phoneLabel}). Tu pedido ya está marcado como <strong>PAGADO</strong> y entra en preparación de inmediato.`;
    }

    // Scroll al inicio del drawer suavemente
    const drawerBody = document.querySelector('.drawer-body');
    if (drawerBody) drawerBody.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// Compartir orden confirmada por WhatsApp
window.sharePendingOrderWhatsapp = function() {
  if (!lastCreatedOrder) return;

  const o = lastCreatedOrder;
  const p = o.paymentDetails || {};
  let msg = `¡Hola DIP LF! 👋 Acabo de realizar mi pedido en la web con Pago Móvil verificado:\n\n`;
  msg += `📦 *ORDEN:* #${o.id}\n`;
  msg += `✅ *ESTADO:* PAGADO (Confirmado por banco)\n`;
  if (o.customerName) msg += `👤 *CLIENTE:* ${o.customerName} (C.I: ${o.customerId || 'N/A'})\n`;
  if (o.customerPhone || p.senderPhone) msg += `📱 *TELÉFONO:* ${o.customerPhone || p.senderPhone}\n`;
  msg += `💳 *BANCO EMISOR:* ${p.originBank || 'N/A'}\n`;
  msg += `🔢 *REFERENCIA:* ${p.reference || 'N/A'}\n`;
  msg += `💰 *MONTO:* Bs. ${p.amountBs} ($${(o.totalPrice || 0).toFixed(2)} USD)\n\n`;
  msg += `🛒 *DETALLE DEL PEDIDO:*\n`;

  (o.items || []).forEach(it => {
    msg += `• ${it.quantity}x ${it.name} (${it.sizeName})\n`;
  });

  msg += `\n📍 *Por favor coordinar entrega o delivery para mi orden.* ¡Muchas gracias!`;

  const phone = (typeof WHATSAPP_PHONE !== 'undefined') ? WHATSAPP_PHONE : '584143572462';
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
};

// Navegar directamente a la página nueva de Órdenes
window.goToOrderTracking = function(orderId) {
  const targetId = orderId || (lastCreatedOrder ? lastCreatedOrder.id : null) || localStorage.getItem('diplf_last_order_id');
  
  if (typeof toggleDrawer === 'function') {
    toggleDrawer(false);
  }

  if (targetId) {
    window.location.href = `ordenes.html?id=${encodeURIComponent(targetId)}`;
  } else {
    window.location.href = 'ordenes.html';
  }
};

// Reiniciar drawer para un nuevo pedido
window.resetOrderDrawer = function() {
  window.isOrderSuccessActive = false;

  const container = document.getElementById('pagoMovilModuleContainer');
  const drawerEmpty = document.getElementById('drawerEmptyState');
  const drawerCartList = document.getElementById('drawerCartList');
  const sectionHeading = document.querySelector('.drawer-section-heading');
  const checkoutTabs = document.querySelector('.checkout-method-tabs');
  const panelForm = document.getElementById('panelPagoMovil');
  const panelSuccess = document.getElementById('panelPagoMovilSuccess');
  const drawerFooter = document.querySelector('.drawer-footer');
  const btnSubmit = document.getElementById('btnSubmitPagoMovil');

  hidePmVerificationAlert();

  const count = (typeof cart !== 'undefined' && Array.isArray(cart)) ? cart.length : 0;

  if (drawerEmpty) drawerEmpty.style.display = (count === 0) ? 'block' : 'none';
  if (drawerCartList) drawerCartList.style.display = (count > 0) ? 'flex' : 'none';
  if (sectionHeading) sectionHeading.style.display = (count > 0) ? 'flex' : 'none';
  if (checkoutTabs) checkoutTabs.style.display = (count > 0) ? 'grid' : 'none';
  if (panelForm) panelForm.style.display = (count > 0) ? 'flex' : 'none';
  if (panelSuccess) panelSuccess.style.display = 'none';
  if (container) container.style.display = (count > 0) ? 'flex' : 'none';
  if (drawerFooter) drawerFooter.style.display = (count > 0) ? 'block' : 'none';

  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = '<span>⚡ Confirmar y Enviar Pago Móvil</span>';
  }

  // Limpiar campos
  const form = document.getElementById('formPagoMovilSubmit');
  if (form) form.reset();

  switchCheckoutMethod('pagomovil');
};
