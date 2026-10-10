// Resolver rutas relativas de imágenes universalmente para Web (GitHub Pages), subcarpetas y local
function resolveAssetPath(imagePath) {
  if (!imagePath || typeof imagePath !== 'string') return '';
  const trimmed = imagePath.trim();
  if (!trimmed) return '';

  // 1. Data URLs (Base64) o Blob URLs
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  // 2. URLs absolutas externas (http / https)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return encodeURI(trimmed);
  }

  // Limpiar cualquier prefijo relativo inicial (../, ./, /)
  const clean = trimmed.replace(/^(\.\.\/|\.\/|\/)+/, '');

  // 3. Entorno Web (GitHub Pages o servidor HTTP/HTTPS)
  if (window.location.protocol.startsWith('http')) {
    const parts = window.location.pathname.split('/').filter(Boolean);
    let repoBase = '';
    // En GitHub Pages: https://raituz.github.io/diplf-web/... -> parts[0] es 'diplf-web'
    if (window.location.hostname.includes('github.io') && parts.length > 0) {
      repoBase = '/' + parts[0];
    }
    return encodeURI(`${window.location.origin}${repoBase}/${clean}`);
  }

  // 4. Entorno Local de Archivos (file:///)
  // Verificar si la página actual está dentro de una subcarpeta llamada 'almacen'
  const isInsideAlmacenFolder = window.location.pathname.includes('/almacen/') || window.location.pathname.includes('\\almacen\\');
  if (isInsideAlmacenFolder) {
    return encodeURI('../' + clean);
  }
  return encodeURI(clean);
}

// Mecanismo de autoreparación si una imagen no carga en el navegador
window.handleAdminImgError = function(img, originalPath) {
  if (!img) return;
  const currentStep = parseInt(img.dataset.failStep || '0', 10);
  
  if (currentStep === 0) {
    img.dataset.failStep = '1';
    // Intento 1: ruta relativa directa sin ../
    if (originalPath) {
      img.src = encodeURI(originalPath.replace(/^(\.\.\/|\.\/|\/)+/, ''));
      return;
    }
  } else if (currentStep === 1) {
    img.dataset.failStep = '2';
    // Intento 2: ruta con ../
    if (originalPath) {
      img.src = encodeURI('../' + originalPath.replace(/^(\.\.\/|\.\/|\/)+/, ''));
      return;
    }
  } else if (currentStep === 2) {
    img.dataset.failStep = '3';
    // Intento 3: fallback con Logo oficial
    img.src = resolveAssetPath('assets/images/Logo.jpeg');
    return;
  }

  img.onerror = null;
};

document.addEventListener('DOMContentLoaded', () => {
  initAuthUI();
  setupEventListeners();
  
  if (isAdmin()) {
    initDashboard();
  }
});

// ==========================================
// 1. CONTROL DE ACCESO Y AUTENTICACIÓN
// ==========================================

function initAuthUI() {
  const loginScreen = document.getElementById('loginScreen');
  const dashboardScreen = document.getElementById('dashboardScreen');
  const user = getCurrentUser();

  if (isAdmin()) {
    if (loginScreen) loginScreen.style.display = 'none';
    if (dashboardScreen) dashboardScreen.style.display = 'block';

    // Rellenar datos de usuario en header
    const userEmailSpan = document.getElementById('adminUserEmail');
    if (userEmailSpan && user) {
      userEmailSpan.textContent = user.email;
    }
  } else {
    if (loginScreen) loginScreen.style.display = 'flex';
    if (dashboardScreen) dashboardScreen.style.display = 'none';
  }
}

// Configurar listeners generales
function setupEventListeners() {
  // Login Form
  const loginForm = document.getElementById('adminLoginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value;
      const pass = document.getElementById('loginPassword').value;
      const alertBox = document.getElementById('loginAlert');

      const result = loginUser(email, pass);
      if (result.success) {
        if (alertBox) alertBox.style.display = 'none';
        initAuthUI();
        initDashboard();
      } else {
        if (alertBox) {
          alertBox.textContent = result.message || 'Credenciales incorrectas.';
          alertBox.style.display = 'block';
        }
      }
    });
  }

  // Logout
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      if (confirm('¿Deseas cerrar la sesión del Almacén?')) {
        logoutUser();
        initAuthUI();
      }
    });
  }

  // Escuchar cambios de autenticación
  window.addEventListener('diplf_auth_changed', () => {
    initAuthUI();
    if (isAdmin()) initDashboard();
  });

  // Escuchar nuevos pedidos en tiempo real (incluso desde otras pestañas)
  window.addEventListener('storage', (e) => {
    if (e.key === 'diplf_orders') {
      onNewOrderDetected();
      renderOrdersList();
      renderOrdersStats();
    }
    if (e.key === 'diplf_custom_catalog') {
      renderProductsGrid();
    }
  });

  window.addEventListener('diplf_new_order', (e) => {
    onNewOrderDetected(e.detail);
    renderOrdersList();
    renderOrdersStats();
  });

  // Escuchar actualización remota del catálogo desde la nube
  window.addEventListener('diplf_catalog_updated', () => {
    renderProductsGrid();
  });
}

// Inicializar componentes del panel
function initDashboard() {
  initTabs();
  renderProductsGrid();
  initCreateProductForm();
  initOrdersView();
  initUsersView();
  initPagoMovilView();
  startOrdersPoller();
}

// ==========================================
// 2. SISTEMA DE PESTAÑAS (TABS)
// ==========================================

function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');
      switchTab(targetId);
    });
  });
}

function switchTab(tabId) {
  // Desactivar todos
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));

  // Activar seleccionado
  const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  const activeSection = document.getElementById(tabId);

  if (activeBtn) activeBtn.classList.add('active');
  if (activeSection) activeSection.classList.add('active');

  // Acciones al cambiar
  if (tabId === 'tabModificar') renderProductsGrid();
  if (tabId === 'tabPedidos') renderOrdersList();
  if (tabId === 'tabUsuarios') renderUsersList();
  if (tabId === 'tabPagoMovil') renderPagoMovilDashboard();
}

// ==========================================
// 3. TAB 1: MODIFICAR PRODUCTOS
// ==========================================

function renderProductsGrid(filterText = '') {
  const container = document.getElementById('productsAdminGrid');
  if (!container) return;

  const catalog = getCatalog();
  const search = filterText.trim().toLowerCase();

  const filtered = search
    ? catalog.filter(p => p.name.toLowerCase().includes(search) || p.desc.toLowerCase().includes(search))
    : catalog;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-placeholder" style="grid-column: 1 / -1;">
        <span class="icon">🔍</span>
        <h3>No se encontraron productos</h3>
        <p>Prueba con otro término de búsqueda o añade una nueva salsa.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(prod => `
    <div class="product-edit-card" data-id="${prod.id}">
      <div class="prod-card-top">
        <div class="prod-img-preview-wrap" id="preview_wrap_${prod.id}">
          ${prod.image 
            ? `<img src="${resolveAssetPath(prod.image)}" id="img_${prod.id}" alt="${escapeHtml(prod.name)}" onerror="handleAdminImgError(this, '${escapeHtml(prod.image)}')">` 
            : `<div class="no-img-text" id="img_text_${prod.id}">Sin imagen<br>(Próx.)</div>`}
        </div>
        <div class="prod-top-meta">
          <div class="prod-id-tag">ID: ${prod.id}</div>
          <div class="form-group" style="margin-bottom: 8px;">
            <label>Nombre de la Salsa</label>
            <input type="text" class="form-control" id="name_${prod.id}" value="${escapeHtml(prod.name)}">
          </div>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Categoría</label>
          <select class="form-control" id="cat_${prod.id}">
            <option value="cremosa" ${prod.category === 'cremosa' ? 'selected' : ''}>Cremosa</option>
            <option value="especial" ${prod.category === 'especial' ? 'selected' : ''}>Especial</option>
            <option value="vegetal" ${prod.category === 'vegetal' ? 'selected' : ''}>Vegetal</option>
            <option value="crujiente" ${prod.category === 'crujiente' ? 'selected' : ''}>Crujiente</option>
            <option value="picante" ${prod.category === 'picante' ? 'selected' : ''}>Picante</option>
          </select>
        </div>

        <div class="form-group">
          <label>Badge / Etiqueta</label>
          <input type="text" class="form-control" id="badge_${prod.id}" value="${escapeHtml(prod.badge || '')}" placeholder="Ej: ★ MÁS VENDIDA">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Estado de Inventario</label>
          <select class="form-control" id="stockStatus_${prod.id}">
            <option value="disponible" ${prod.stockStatus === 'disponible' ? 'selected' : ''}>🟢 Disponible (En Stock)</option>
            <option value="agotado" ${prod.stockStatus === 'agotado' ? 'selected' : ''}>🔴 Agotado Temporal</option>
            <option value="proximamente" ${prod.stockStatus === 'proximamente' || prod.isComingSoon ? 'selected' : ''}>🟡 Próximamente (En camino)</option>
          </select>
        </div>

        <div class="form-group">
          <label>Unidades Disponibles</label>
          <input type="number" class="form-control" id="stockQty_${prod.id}" value="${prod.stockQty || 0}" min="0">
        </div>
      </div>

      <div class="form-group">
        <label>Precios por Tamaño (USD $)</label>
        <div class="prices-grid-3">
          <div class="price-mini-box">
            <label>7 oz</label>
            <input type="number" step="0.5" id="price_7oz_${prod.id}" value="${prod.prices?.['7oz'] || 2}">
          </div>
          <div class="price-mini-box">
            <label>16 oz</label>
            <input type="number" step="0.5" id="price_16oz_${prod.id}" value="${prod.prices?.['16oz'] || 4}">
          </div>
          <div class="price-mini-box">
            <label>22 oz</label>
            <input type="number" step="0.5" id="price_22oz_${prod.id}" value="${prod.prices?.['22oz'] || 6}">
          </div>
        </div>
      </div>

      <div class="form-group">
        <label>Cambiar Imagen</label>
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
          <input type="file" accept="image/*" id="file_${prod.id}" style="display:none;" onchange="handleProductImageFile('${prod.id}', this)">
          <button type="button" class="btn-tool" onclick="document.getElementById('file_${prod.id}').click()">
            📁 Subir de la PC
          </button>
          <span style="font-size: 0.75rem; color: var(--text-dim);">o escribir URL/ruta:</span>
        </div>
        <input type="text" class="form-control" id="imgurl_${prod.id}" value="${escapeHtml(prod.image || '')}" placeholder="assets/images/Foto.jfif o URL externa" oninput="handleProductImageInput('${prod.id}', this.value)">
      </div>

      <div class="form-group">
        <label>Descripción del Producto</label>
        <textarea class="form-control" id="desc_${prod.id}" rows="2">${escapeHtml(prod.desc || '')}</textarea>
      </div>

      <div class="prod-actions-bar">
        <button type="button" class="btn-save-prod" onclick="saveProductChanges('${prod.id}')">
          💾 Guardar Cambios
        </button>
        <button type="button" class="btn-delete-prod" onclick="confirmDeleteProduct('${prod.id}', '${escapeHtml(prod.name)}')">
          🗑️ Eliminar
        </button>
      </div>
    </div>
  `).join('');

  // Escuchar búsqueda
  const searchInput = document.getElementById('searchProductsAdmin');
  if (searchInput && !searchInput.dataset.initialized) {
    searchInput.dataset.initialized = 'true';
    searchInput.addEventListener('input', (e) => {
      renderProductsGrid(e.target.value);
    });
  }
}

// Manejar cambio de imagen vía archivo local (Base64)
window.handleProductImageFile = function(prodId, input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
      const base64Url = e.target.result;
      document.getElementById(`imgurl_${prodId}`).value = base64Url;
      updateProductPreviewImg(prodId, base64Url);
    };
    reader.readAsDataURL(file);
  }
};

// Manejar cambio de imagen vía texto
window.handleProductImageInput = function(prodId, val) {
  updateProductPreviewImg(prodId, val);
};

function updateProductPreviewImg(prodId, src) {
  const wrap = document.getElementById(`preview_wrap_${prodId}`);
  if (!wrap) return;
  if (src && src.trim() !== '') {
    wrap.innerHTML = `<img src="${resolveAssetPath(src)}" id="img_${prodId}" alt="Preview" onerror="handleAdminImgError(this, '${escapeHtml(src)}')">`;
  } else {
    wrap.innerHTML = `<div class="no-img-text" id="img_text_${prodId}">Sin imagen<br>(Próx.)</div>`;
  }
}

// Guardar cambios de un producto
window.saveProductChanges = function(prodId) {
  const name = document.getElementById(`name_${prodId}`).value.trim();
  const category = document.getElementById(`cat_${prodId}`).value;
  const badge = document.getElementById(`badge_${prodId}`).value.trim();
  const stockStatus = document.getElementById(`stockStatus_${prodId}`).value;
  const stockQty = parseInt(document.getElementById(`stockQty_${prodId}`).value, 10) || 0;
  
  const price7 = parseFloat(document.getElementById(`price_7oz_${prodId}`).value) || 2;
  const price16 = parseFloat(document.getElementById(`price_16oz_${prodId}`).value) || 4;
  const price22 = parseFloat(document.getElementById(`price_22oz_${prodId}`).value) || 6;
  
  const image = document.getElementById(`imgurl_${prodId}`).value.trim();
  const desc = document.getElementById(`desc_${prodId}`).value.trim();

  if (!name) {
    alert('El nombre del producto no puede estar vacío.');
    return;
  }

  const res = updateProduct(prodId, {
    name,
    category,
    badge,
    stockStatus,
    stockQty,
    prices: { '7oz': price7, '16oz': price16, '22oz': price22 },
    image,
    desc
  });

  if (res.success) {
    showAdminToast(`¡"${name}" actualizado con éxito y guardado en la nube!`);
  } else {
    alert(res.message || 'Error al actualizar el producto.');
  }
};

// Confirmar y eliminar producto
window.confirmDeleteProduct = function(prodId, name) {
  if (confirm(`¿Estás seguro de que deseas eliminar permanentemente la salsa "${name}" del catálogo?`)) {
    const res = deleteProduct(prodId);
    if (res.success) {
      showAdminToast(`Salsa "${name}" eliminada.`);
      renderProductsGrid();
    }
  }
};

// ==========================================
// 4. TAB 2: CREAR NUEVO PRODUCTO (SEPARADO)
// ==========================================

function initCreateProductForm() {
  const form = document.getElementById('formNewProduct');
  const fileInput = document.getElementById('newProdFileInput');
  const imgUrlInput = document.getElementById('newProdImgUrl');
  const previewImg = document.getElementById('newProdPreviewImg');
  const previewPlaceholder = document.getElementById('newProdPreviewPlaceholder');

  // Selector de imagen de PC
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const b64 = evt.target.result;
          imgUrlInput.value = b64;
          previewImg.src = b64;
          previewImg.style.display = 'block';
          if (previewPlaceholder) previewPlaceholder.style.display = 'none';
        };
        reader.readAsDataURL(e.target.files[0]);
      }
    });
  }

  // Input de URL/ruta
  if (imgUrlInput) {
    imgUrlInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (val) {
        previewImg.src = val;
        previewImg.style.display = 'block';
        if (previewPlaceholder) previewPlaceholder.style.display = 'none';
      } else {
        previewImg.style.display = 'none';
        if (previewPlaceholder) previewPlaceholder.style.display = 'block';
      }
    });
  }

  // Envío del formulario
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const name = document.getElementById('newProdName').value.trim();
      const category = document.getElementById('newProdCategory').value;
      const badge = document.getElementById('newProdBadge').value.trim();
      const stockStatus = document.getElementById('newProdStockStatus').value;
      const stockQty = parseInt(document.getElementById('newProdStockQty').value, 10) || 30;

      const price7 = parseFloat(document.getElementById('newProdPrice7oz').value) || 2;
      const price16 = parseFloat(document.getElementById('newProdPrice16oz').value) || 4;
      const price22 = parseFloat(document.getElementById('newProdPrice22oz').value) || 6;

      const image = imgUrlInput.value.trim();
      const desc = document.getElementById('newProdDesc').value.trim();

      if (!name) {
        alert('Por favor ingresa un nombre para la nueva salsa.');
        return;
      }

      const res = addNewProduct({
        name,
        category,
        badge,
        stockStatus,
        stockQty,
        prices: { '7oz': price7, '16oz': price16, '22oz': price22 },
        image,
        desc
      });

      if (res.success) {
        showAdminToast(`¡Nueva salsa "${name}" creada y añadida a la web! 🎉`);
        form.reset();
        previewImg.style.display = 'none';
        if (previewPlaceholder) previewPlaceholder.style.display = 'block';

        // Cambiar automáticamente a la pestaña de modificar para verla
        setTimeout(() => switchTab('tabModificar'), 600);
      } else {
        alert(res.message || 'No se pudo crear el producto.');
      }
    });
  }
}

// ==========================================
// 5. TAB 3: PEDIDOS Y ALERTAS SONORAS
// ==========================================

let lastKnownOrdersCount = 0;

function initOrdersView() {
  // Configurar toggle de notificaciones
  const toggle = document.getElementById('toggleOrderNotif');
  if (toggle) {
    toggle.checked = isNotificationEnabled();
    toggle.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      setNotificationEnabled(enabled);
      if (enabled) {
        // Solicitar permisos de notificación si es compatible
        if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
          Notification.requestPermission();
        }
        playNotificationChime();
        showAdminToast('🔔 Notificaciones y sonido activados.');
      } else {
        showAdminToast('🔕 Notificaciones silenciadas.');
      }
    });
  }

  // Botón probar sonido
  const btnTestSound = document.getElementById('btnTestSound');
  if (btnTestSound) {
    btnTestSound.addEventListener('click', () => {
      playNotificationChime();
      showAdminToast('🔔 Sonido de notificación reproducido');
    });
  }

  // Botón simular pedido de prueba
  const btnSimulateOrder = document.getElementById('btnSimulateOrder');
  if (btnSimulateOrder) {
    btnSimulateOrder.addEventListener('click', () => {
      simulateTestOrder();
    });
  }

  // Botón limpiar historial
  const btnClearOrders = document.getElementById('btnClearOrders');
  if (btnClearOrders) {
    btnClearOrders.addEventListener('click', async () => {
      const currentOrders = getOrders();
      if (currentOrders.length === 0) {
        showAdminToast('El historial de pedidos ya está vacío.');
        return;
      }

      if (confirm(`¿Estás seguro de que deseas vaciar y eliminar los ${currentOrders.length} pedidos del historial?\n\nEsta acción borrará los pedidos permanentemente tanto de este navegador como del servidor webhook.`)) {
        btnClearOrders.disabled = true;
        btnClearOrders.style.opacity = '0.5';

        await clearAllOrders();
        lastKnownOrdersCount = 0;
        renderOrdersList();
        renderOrdersStats();
        showAdminToast('Historial de pedidos vaciado exitosamente en navegador y servidor.');

        btnClearOrders.disabled = false;
        btnClearOrders.style.opacity = '1';
      }
    });
  }

  // Filtro de estado
  const filterSelect = document.getElementById('filterOrderStatus');
  if (filterSelect) {
    filterSelect.addEventListener('change', () => {
      renderOrdersList(filterSelect.value);
    });
  }

  renderOrdersStats();
  renderOrdersList();

  lastKnownOrdersCount = getOrders().length;
}

// Renderizar estadísticas de pedidos
function renderOrdersStats() {
  const orders = getOrders();
  const total = orders.length;
  const pending = orders.filter(o => o.status === 'nuevo' || o.status === 'en_preparacion' || o.status === 'pendiente').length;
  const totalMoney = orders
    .filter(o => o.status !== 'cancelado')
    .reduce((sum, o) => sum + (o.totalPrice || 0), 0);

  const elTotal = document.getElementById('statTotalOrders');
  const elPending = document.getElementById('statPendingOrders');
  const elSales = document.getElementById('statTotalSales');
  const badgeCount = document.getElementById('orderBadgeCount');

  if (elTotal) elTotal.textContent = total;
  if (elPending) elPending.textContent = pending;
  if (elSales) elSales.textContent = `$${totalMoney.toFixed(2)}`;

  if (badgeCount) {
    const newCount = orders.filter(o => o.status === 'nuevo' || o.status === 'pendiente').length;
    if (newCount > 0) {
      badgeCount.textContent = newCount;
      badgeCount.style.display = 'inline-block';
    } else {
      badgeCount.style.display = 'none';
    }
  }
}

// Renderizar lista de pedidos
function renderOrdersList(filterStatus = 'todos') {
  const container = document.getElementById('ordersListContainer');
  if (!container) return;

  const orders = getOrders();
  const filtered = filterStatus === 'todos' 
    ? orders 
    : orders.filter(o => o.status === filterStatus);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-placeholder">
        <span class="icon">📦</span>
        <h3>No hay pedidos registrados</h3>
        <p>Cuando un cliente coordine una orden desde la tienda o uses "Simular Pedido", aparecerá aquí con alerta sonora.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(order => `
    <div class="order-item-card ${order.status === 'nuevo' || order.status === 'pendiente' ? 'is-new' : ''}" data-order-id="${order.id}">
      <div class="order-item-header">
        <div class="order-id-title">
          <span>${order.id}</span>
          <span class="order-status-badge ${order.status}">${formatStatusLabel(order.status)}</span>
        </div>
        <div style="font-size: 0.85rem; color: var(--text-muted);">
          📅 ${order.dateFormatted || order.date}
        </div>
      </div>

      <div class="order-customer-box">
        <div class="customer-info-line">
          <span>👤 <strong>Cliente:</strong> ${escapeHtml(order.customerName || 'Cliente Web')}</span>
          ${order.customerId ? `<span>🪪 <strong>C.I / RIF:</strong> ${escapeHtml(order.customerId)}</span>` : ''}
          ${order.customerPhone ? `<span>📱 <strong>Teléfono:</strong> ${escapeHtml(order.customerPhone)}</span>` : ''}
        </div>
        ${order.customerPhone ? `
          <a href="https://wa.me/58${order.customerPhone.replace(/[^0-9]/g, '').replace(/^0/, '')}?text=${encodeURIComponent(`¡Hola ${order.customerName || 'estimado cliente'}! 👋 Te contactamos de DIP LF respecto a tu orden #${order.id}.`)}" target="_blank" class="btn-wa-contact-customer" title="Chatear con el cliente en WhatsApp">
            💬 WhatsApp Cliente
          </a>
        ` : ''}
      </div>

      <table class="order-products-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Tamaño</th>
            <th>Cant.</th>
            <th style="text-align: right;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${(order.items || []).map(item => `
            <tr>
              <td><strong>${escapeHtml(item.name || item.flavorName)}</strong></td>
              <td>${item.sizeName || item.sizeKey}</td>
              <td>x${item.quantity}</td>
              <td style="text-align: right; color: var(--gold-primary);">$${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${order.paymentMethod === 'pago_movil' ? `
        <div class="order-payment-box">
          <div class="order-payment-header">
            <span class="payment-method-tag">📱 Pago Móvil (Venezuela)</span>
            ${order.status === 'pendiente' ? `
              <button type="button" class="btn-mark-paid-manual" onclick="quickMarkAsPaid('${order.id}')">✔ Marcar como Pagado Manualmente</button>
            ` : ''}
          </div>
          <div class="payment-grid-details">
            <div class="pm-detail-item">
              <span>Banco Emisor:</span>
              <strong>${escapeHtml(order.paymentDetails?.originBank || 'No especificado')}</strong>
            </div>
            <div class="pm-detail-item">
              <span>Teléfono Emisor:</span>
              <strong>${escapeHtml(order.paymentDetails?.senderPhone || 'N/A')}</strong>
            </div>
            <div class="pm-detail-item">
              <span>Referencia:</span>
              <strong style="color: var(--gold-primary); font-size: 0.95rem;">${escapeHtml(order.paymentDetails?.reference || 'N/A')}</strong>
            </div>
            <div class="pm-detail-item">
              <span>Monto en Bs:</span>
              <strong style="color: #38bdf8;">Bs. ${(order.paymentDetails?.amountBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
            </div>
          </div>
          ${order.smsMatch ? `
            <div class="payment-sms-matched-alert">
              <span>🤖 Conciliado automáticamente con SMS bancario de <strong>${escapeHtml(order.smsMatch.bank || order.smsMatch.sender)}</strong> (Ref SMS: ${escapeHtml(order.smsMatch.smsReference || '')})</span>
            </div>
          ` : ''}
        </div>
      ` : ''}

      <div class="order-bottom-actions">
        <div class="order-total-highlight">
          Total: $${(order.totalPrice || 0).toFixed(2)} USD
        </div>

        <div style="display: flex; gap: 8px; align-items: center;">
          <span style="font-size: 0.8rem; color: var(--text-dim);">Estado:</span>
          <select class="order-status-select" onchange="handleOrderStatusChange('${order.id}', this.value)">
            <option value="pendiente" ${order.status === 'pendiente' ? 'selected' : ''}>⏳ Pendiente (Pago Móvil)</option>
            <option value="pagado" ${order.status === 'pagado' ? 'selected' : ''}>✅ Pagado (Confirmado)</option>
            <option value="nuevo" ${order.status === 'nuevo' ? 'selected' : ''}>🟡 Nuevo (WhatsApp)</option>
            <option value="en_preparacion" ${order.status === 'en_preparacion' ? 'selected' : ''}>🔵 En Preparación</option>
            <option value="listo_entrega" ${order.status === 'listo_entrega' ? 'selected' : ''}>🛵 Listo para Entrega / Delivery</option>
            <option value="entregado" ${order.status === 'entregado' ? 'selected' : ''}>🟢 Entregado</option>
            <option value="cancelado" ${order.status === 'cancelado' ? 'selected' : ''}>🔴 Cancelado</option>
          </select>

          <button type="button" class="btn-delete-order" onclick="confirmDeleteIndividualOrder('${order.id}')" title="Eliminar permanentemente este pedido">
            🗑️ Eliminar
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

window.confirmDeleteIndividualOrder = async function(orderId) {
  if (confirm(`¿Estás seguro de que deseas eliminar permanentemente el pedido #${orderId} tanto del navegador como del servidor?`)) {
    await deleteOrderById(orderId);
    lastKnownOrdersCount = getOrders().length;
    renderOrdersStats();
    renderOrdersList(document.getElementById('filterOrderStatus')?.value || 'todos');
    showAdminToast(`Pedido #${orderId} eliminado.`);
  }
};

window.handleOrderStatusChange = function(orderId, newStatus) {
  updateOrderStatus(orderId, newStatus);
  renderOrdersStats();
  renderOrdersList(document.getElementById('filterOrderStatus')?.value || 'todos');
  showAdminToast(`Estado del pedido ${orderId} actualizado.`);
};

window.quickMarkAsPaid = function(orderId) {
  updateOrderStatus(orderId, 'pagado', {
    verifiedAt: new Date().toISOString(),
    verifiedByManual: true
  });
  playNotificationChime();
  renderOrdersStats();
  renderOrdersList(document.getElementById('filterOrderStatus')?.value || 'todos');
  showAdminToast(`¡Pedido ${orderId} verificado y marcado como PAGADO!`);
};

function formatStatusLabel(st) {
  switch (st) {
    case 'pendiente': return '⏳ Pendiente (Pago Móvil)';
    case 'pagado': return '✅ Pagado (Confirmado)';
    case 'nuevo': return '🟡 Nuevo (WhatsApp)';
    case 'en_preparacion': return 'En Preparación';
    case 'listo_entrega': return '🛵 Listo para Entrega';
    case 'entregado': return 'Entregado';
    case 'cancelado': return 'Cancelado';
    default: return st;
  }
}

// Simular un pedido de prueba
function simulateTestOrder() {
  const catalog = getCatalog().filter(p => !p.isComingSoon);
  const sample1 = catalog[Math.floor(Math.random() * catalog.length)] || { name: 'Tocineta', prices: { '16oz': 4 } };
  const sample2 = catalog[Math.floor(Math.random() * catalog.length)] || { name: 'Tártara', prices: { '16oz': 4 } };

  const qty1 = Math.floor(Math.random() * 2) + 1;
  const qty2 = 1;
  const price1 = (sample1.prices?.['16oz'] || 4);
  const price2 = (sample2.prices?.['7oz'] || 2);

  const testOrder = recordNewOrder({
    customerName: 'Carlos Mendoza',
    customerId: 'V-21726495',
    customerPhone: '04143572462',
    items: [
      { name: sample1.name, sizeName: '16 oz', sizeKey: '16oz', price: price1, quantity: qty1 },
      { name: sample2.name, sizeName: '7 oz', sizeKey: '7oz', price: price2, quantity: qty2 }
    ],
    totalCount: qty1 + qty2,
    totalPrice: (price1 * qty1) + (price2 * qty2),
    note: 'Pedido simulado de prueba técnica'
  });

  renderOrdersList();
  renderOrdersStats();
}

// Cuando se detecta un nuevo pedido
function onNewOrderDetected(order) {
  if (isNotificationEnabled()) {
    playNotificationChime();

    // Notificación nativa del navegador
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const title = '¡Nuevo Pedido DIP LF recibido!';
        const body = order ? `Pedido ${order.id} por $${order.totalPrice.toFixed(2)} USD` : 'Un cliente acaba de realizar un nuevo pedido.';
        new Notification(title, {
          body: body,
          icon: 'assets/images/Logo.jpeg'
        });
      } catch (e) {}
    }

    showOrderArrivalToast(order);
  }
}

// Banner flotante especial cuando entra un pedido
function showOrderArrivalToast(order) {
  let toast = document.getElementById('orderArrivalToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'orderArrivalToast';
    toast.className = 'toast-notif-box';
    document.body.appendChild(toast);
  }

  const orderId = order ? order.id : 'Recibido';
  const total = order ? `$${order.totalPrice.toFixed(2)}` : 'Nuevo';

  toast.innerHTML = `
    <div class="toast-notif-icon">🔔</div>
    <div class="toast-notif-info">
      <h4>¡Nuevo Pedido ${orderId}!</h4>
      <p>Monto: ${total} • Revisa la pestaña de Pedidos</p>
    </div>
  `;

  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 4500);
}

// Poller periódico para verificar si entraron pedidos y sincronizar con Webhook
function startOrdersPoller() {
  setInterval(async () => {
    // 1. Verificar cambios en localStorage
    const orders = getOrders();
    if (orders.length > lastKnownOrdersCount) {
      const newestOrder = orders[0];
      onNewOrderDetected(newestOrder);
      renderOrdersList();
      renderOrdersStats();
    }
    lastKnownOrdersCount = orders.length;

    // 2. Si el servidor webhook está activo, sincronizar pedidos actualizados por SMS
    try {
      const webhookUrl = typeof getWebhookServerUrl === 'function' ? getWebhookServerUrl() : 'http://localhost:3000';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1800);

      const res = await fetch(`${webhookUrl}/api/orders`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.orders)) {
          let hasUpdates = false;
          let currentLocal = getOrders();

          data.orders.forEach(remoteOrder => {
            const localIndex = currentLocal.findIndex(o => o.id === remoteOrder.id);
            if (localIndex >= 0) {
              const localOrder = currentLocal[localIndex];
              // Si pasó de pendiente a pagado remotamente por SMS
              if (localOrder.status === 'pendiente' && remoteOrder.status === 'pagado') {
                currentLocal[localIndex] = { ...localOrder, ...remoteOrder };
                hasUpdates = true;
                playNotificationChime();
                showOrderPaidToast(remoteOrder);
              }
            } else {
              // Pedido nuevo en servidor
              currentLocal.unshift(remoteOrder);
              hasUpdates = true;
              onNewOrderDetected(remoteOrder);
            }
          });

          if (hasUpdates) {
            localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(currentLocal));
            renderOrdersList();
            renderOrdersStats();
          }
        }
      }
    } catch (_) {
      // Servidor local offline, continuar en modo local
    }
  }, 3500);
}

function showOrderPaidToast(order) {
  let toast = document.getElementById('orderArrivalToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'orderArrivalToast';
    toast.className = 'toast-notif-box';
    document.body.appendChild(toast);
  }

  const orderId = order ? order.id : '';
  const ref = order.paymentDetails?.reference || 'SMS';

  toast.innerHTML = `
    <div class="toast-notif-icon" style="background: rgba(16, 185, 129, 0.2); color: #34d399;">💳</div>
    <div class="toast-notif-info">
      <h4 style="color: #34d399;">¡Pago Móvil Confirmado #${orderId}!</h4>
      <p>Ref: ${ref} • Pedido marcado como PAGADO automáticamente</p>
    </div>
  `;

  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 5000);
}

// ==========================================
// 6. TAB 4: USUARIOS Y GESTIÓN DE ROLES
// ==========================================

function initUsersView() {
  const form = document.getElementById('formAssignRole');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('userEmail').value;
      const name = document.getElementById('userName').value;
      const pass = document.getElementById('userPass').value;
      const role = document.getElementById('userRole').value;

      const res = assignUserRole(email, pass, role, name);
      if (res.success) {
        showAdminToast(`¡Rol ${role} asignado a ${email}!`);
        form.reset();
        renderUsersList();
      } else {
        alert(res.message || 'Error al asignar rol.');
      }
    });
  }

  renderUsersList();
}

function renderUsersList() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  const users = getAuthorizedUsers();
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>
        <strong>${escapeHtml(u.email)}</strong>
      </td>
      <td>${escapeHtml(u.name || '-')}</td>
      <td>
        <span class="user-role-badge ${u.role === 'admin' ? 'admin' : 'operador'}">
          ${u.role === 'admin' ? 'Administrador' : 'Operador'}
        </span>
      </td>
      <td>${u.date || '-'}</td>
      <td style="text-align: right;">
        ${u.email.toLowerCase() === DEFAULT_SUPER_ADMIN.email.toLowerCase()
          ? '<span style="font-size: 0.72rem; color: var(--gold-primary); font-weight: 700;">★ Principal</span>'
          : `<button class="btn-remove-user" onclick="confirmRemoveUser('${escapeHtml(u.email)}')">Eliminar</button>`
        }
      </td>
    </tr>
  `).join('');
}

window.confirmRemoveUser = function(email) {
  if (confirm(`¿Deseas revocar el acceso a "${email}"?`)) {
    const res = removeUserRole(email);
    if (res.success) {
      showAdminToast(`Acceso revocado a ${email}.`);
      renderUsersList();
    } else {
      alert(res.message || 'No se pudo eliminar el usuario.');
    }
  }
};

// ==========================================
// 7. TOAST GENERAL Y UTILIDADES
// ==========================================

function showAdminToast(msg) {
  let toast = document.getElementById('adminToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'adminToast';
    toast.className = 'toast-notif-box';
    document.body.appendChild(toast);
  }

  toast.innerHTML = `
    <div class="toast-notif-icon toast-logo-avatar">
      <img src="assets/images/Logo.jpeg" alt="Logo DIP LF">
    </div>
    <div class="toast-notif-info">
      <h4>Panel DIP LF</h4>
      <p>${escapeHtml(msg)}</p>
    </div>
  `;

  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2800);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================
// 8. TAB 5: PANEL PAGO MÓVIL Y WEBHOOK SMS
// ==========================================

function initPagoMovilView() {
  // Comprobar salud del servidor
  const btnCheck = document.getElementById('btnCheckServerHealth');
  if (btnCheck) {
    btnCheck.addEventListener('click', checkServerHealth);
  }

  // Guardar configuración completa de cuenta
  const formCfg = document.getElementById('formConfigPagoMovil');
  if (formCfg) {
    formCfg.addEventListener('submit', (e) => {
      e.preventDefault();
      savePagoMovilConfigFromForm();
    });
  }

  // Guardar Tasa BCV
  const btnBcv = document.getElementById('btnUpdateBcvRate');
  if (btnBcv) {
    btnBcv.addEventListener('click', () => {
      const input = document.getElementById('cfgBcvRate');
      const val = parseFloat(input?.value);
      if (!isNaN(val) && val > 0) {
        if (typeof setBcvRate === 'function') setBcvRate(val);
        showAdminToast(`Tasa BCV guardada: Bs. ${val.toFixed(2)} por 1 USD.`);
        syncConfigWithServer({ bcvRate: val });
        renderPagoMovilDashboard();
      } else {
        alert('Por favor introduce un valor válido de tasa.');
      }
    });
  }

  // Guardar URL personalizada del Servidor (Render.com)
  const btnSaveServerUrl = document.getElementById('btnSaveCustomServerUrl');
  if (btnSaveServerUrl) {
    btnSaveServerUrl.addEventListener('click', () => {
      let val = (document.getElementById('inputCustomServerUrl')?.value || '').trim();
      if (!val) {
        alert('Por favor introduce la URL de tu servidor (ej: https://tu-servicio.onrender.com)');
        return;
      }
      val = val.replace(/\/+$/, '').replace(/\/api\/webhook\/sms$/, '');
      if (typeof setWebhookServerUrl === 'function') {
        setWebhookServerUrl(val);
      }
      showAdminToast(`URL del servidor conectada: ${val}`);
      renderPagoMovilDashboard();
      checkServerHealth();
    });
  }

  // Ejecutar simulador de SMS
  const btnExecute = document.getElementById('btnExecuteSmsSim');
  if (btnExecute) {
    btnExecute.addEventListener('click', executeSmsSimulation);
  }

  renderPagoMovilDashboard();
  checkServerHealth();
}

// Renderizar valores en el formulario del panel
function renderPagoMovilDashboard() {
  const cfg = (typeof getPagoMovilConfig === 'function') ? getPagoMovilConfig() : {};
  const rate = (typeof getBcvRate === 'function') ? getBcvRate() : 395.00;
  const webhookUrl = (typeof getWebhookServerUrl === 'function') ? getWebhookServerUrl() : 'https://diplf.com';

  const inputRate = document.getElementById('cfgBcvRate');
  const inputBank = document.getElementById('cfgReceiverBank');
  const inputPhone = document.getElementById('cfgReceiverPhone');
  const inputId = document.getElementById('cfgReceiverId');
  const urlDisplay = document.getElementById('webhookUrlDisplay');
  const inputCustom = document.getElementById('inputCustomServerUrl');

  if (inputRate) inputRate.value = rate.toFixed(2);
  if (inputBank && cfg.receiverBank) inputBank.value = cfg.receiverBank;
  if (inputPhone && cfg.receiverPhone) inputPhone.value = cfg.receiverPhone;
  if (inputId && cfg.receiverId) inputId.value = cfg.receiverId;
  if (urlDisplay) urlDisplay.textContent = `${webhookUrl}/api/webhook/sms`;
  if (inputCustom) inputCustom.value = webhookUrl;
}

// Guardar configuración desde el formulario
function savePagoMovilConfigFromForm() {
  const rateVal = parseFloat(document.getElementById('cfgBcvRate')?.value) || 395.00;
  const currentCfg = (typeof getPagoMovilConfig === 'function') ? getPagoMovilConfig() : {};

  const newConfig = {
    ...currentCfg,
    defaultRate: rateVal
  };

  if (typeof savePagoMovilConfig === 'function') savePagoMovilConfig(newConfig);
  if (typeof setBcvRate === 'function') setBcvRate(rateVal);

  showAdminToast('¡Tasa oficial BCV actualizada con éxito!');
  syncConfigWithServer({ bcvRate: rateVal });
  renderPagoMovilDashboard();
}

// Sincronizar configuración con el servidor Webhook
async function syncConfigWithServer(partial) {
  try {
    const webhookUrl = (typeof getWebhookServerUrl === 'function') ? getWebhookServerUrl() : 'http://localhost:3000';
    await fetch(`${webhookUrl}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial)
    });
  } catch (_) {}
}

// Verificar conexión del servidor Webhook
async function checkServerHealth() {
  const badge = document.getElementById('serverStatusBadge');
  const webhookUrl = (typeof getWebhookServerUrl === 'function') ? getWebhookServerUrl() : 'http://localhost:3000';

  if (badge) {
    badge.className = 'server-status-pill offline';
    badge.innerHTML = '⏳ Verificando conexión...';
  }

  try {
    const res = await fetch(`${webhookUrl}/api/status`, { signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      const data = await res.json();
      if (badge) {
        badge.className = 'server-status-pill online';
        badge.innerHTML = `🟢 Conectado (${data.ordersStats?.paid || 0} pagados / ${data.ordersStats?.pending || 0} pendientes)`;
      }
      const urlDisplay = document.getElementById('webhookUrlDisplay');
      if (urlDisplay && data.publicWebhookUrl) {
        urlDisplay.textContent = data.publicWebhookUrl;
      }
      showAdminToast('✅ Servidor Webhook conectado y respondiendo.');
      return;
    }
  } catch (_) {}

  if (badge) {
    badge.className = 'server-status-pill offline';
    badge.innerHTML = '🔴 Servidor Local Desconectado';
  }
}

// Copiar URL del Webhook
window.copyWebhookUrl = function() {
  const urlDisplay = document.getElementById('webhookUrlDisplay');
  const text = urlDisplay ? urlDisplay.textContent : 'http://localhost:3000/api/webhook/sms';
  navigator.clipboard.writeText(text).then(() => {
    showAdminToast('📋 URL del Webhook copiada al portapapeles.');
  }).catch(() => {
    prompt('Copia esta URL en tu app de Android:', text);
  });
};

// Cargar plantillas de SMS según el banco
window.loadSmsTemplate = function(bankKey) {
  const inputSender = document.getElementById('simSenderNumber');
  const inputText = document.getElementById('simSmsText');
  const rate = (typeof getBcvRate === 'function') ? getBcvRate() : 395.00;
  const sampleBs = (4 * rate).toFixed(2); // Salsa de $4 en Bs

  switch (bankKey) {
    case 'bnc':
      if (inputSender) inputSender.value = '262';
      if (inputText) inputText.value = `BNC: Ha recibido un Pago Movil por Bs. ${sampleBs} de 04141234567. Referencia: 884102. Fecha: ${new Date().toLocaleDateString('es-VE')}.`;
      break;
    case 'bdv':
      if (inputSender) inputSender.value = '2661';
      if (inputText) inputText.value = `BDV: PagoMovil recibido por Bs. ${sampleBs} de 04121234567 en cta *1234. Ref: 894102. Fecha: ${new Date().toLocaleDateString('es-VE')}.`;
      break;
    case 'banesco':
      if (inputSender) inputSender.value = '2846';
      if (inputText) inputText.value = `Banesco: Recibiste Pago Movil por Bs. ${sampleBs} de JUAN PEREZ. Ref: 554109. Saldo disponible: Bs. ${sampleBs}.`;
      break;
    case 'mercantil':
      if (inputSender) inputSender.value = '24024';
      if (inputText) inputText.value = `Mercantil: Ha recibido Pago Movil por Bs. ${sampleBs} de 04241234567. Ref. 778912. Fecha ${new Date().toLocaleDateString('es-VE')}.`;
      break;
    case 'provincial':
      if (inputSender) inputSender.value = '1111';
      if (inputText) inputText.value = `BBVA Provincial informa: Abono de Dinero Rapido recibido por Bs. ${sampleBs} de 04149876543. Ref: 334190.`;
      break;
    case 'bancamiga':
      if (inputSender) inputSender.value = '26448';
      if (inputText) inputText.value = `Bancamiga: Pago Movil recibido por Bs. ${sampleBs} de 04149876543. Ref: 991204.`;
      break;
  }
  showAdminToast(`Plantilla de ${bankKey.toUpperCase()} cargada.`);
};

// Llenar el simulador con datos del primer pedido pendiente
window.fillTemplateWithPendingOrder = function() {
  const orders = getOrders();
  const pending = orders.find(o => o.status === 'pendiente' && o.paymentMethod === 'pago_movil');

  if (!pending) {
    alert('No hay pedidos actualmente con estado "Pendiente" y método Pago Móvil. Haz un pedido de prueba desde la tienda pública primero.');
    return;
  }

  const p = pending.paymentDetails || {};
  const ref = p.reference || '123456';
  const bs = p.amountBs || (pending.totalPrice * 395).toFixed(2);
  const phone = p.senderPhone || '04121234567';

  const inputSender = document.getElementById('simSenderNumber');
  const inputText = document.getElementById('simSmsText');

  if (inputSender) inputSender.value = '2661';
  if (inputText) {
    inputText.value = `BDV: PagoMovil recibido por Bs. ${bs} de ${phone} en cta *1234. Ref: ${ref}. Fecha: ${new Date().toLocaleDateString('es-VE')}.`;
  }

  showAdminToast(`🎯 Simulador cargado con Pedido #${pending.id} (Ref: ${ref})`);
};

// Ejecutar la simulación de recepción de SMS
async function executeSmsSimulation() {
  const sender = (document.getElementById('simSenderNumber')?.value || '2661').trim();
  const text = (document.getElementById('simSmsText')?.value || '').trim();
  const resultBox = document.getElementById('simResultBox');

  if (!text) {
    alert('Ingresa el texto del SMS bancario a simular.');
    return;
  }

  if (resultBox) {
    resultBox.style.display = 'block';
    resultBox.innerHTML = '<span style="color: var(--gold-primary);">⏳ Analizando mensaje de banco...</span>';
  }

  const webhookUrl = (typeof getWebhookServerUrl === 'function') ? getWebhookServerUrl() : 'http://localhost:3000';
  let serverHandled = false;

  // 1. Intentar enviar al servidor webhook si está corriendo
  try {
    const res = await fetch(`${webhookUrl}/api/test/sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: sender, message: text }),
      signal: AbortSignal.timeout(2500)
    });

    if (res.ok) {
      const data = await res.json();
      serverHandled = true;
      displaySimulationResult(data.parsed, data.matchResult);
      if (data.matchResult?.matched) {
        // Actualizar también en local
        updateOrderStatus(data.matchResult.orderId, 'pagado', {
          verifiedAt: new Date().toISOString(),
          verifiedBySms: true,
          smsMatch: {
            sender: sender,
            smsReference: data.parsed.reference,
            smsAmount: data.parsed.amount,
            rawText: text
          }
        });
        playNotificationChime();
        renderOrdersList();
        renderOrdersStats();
      }
      return;
    }
  } catch (_) {}

  // 2. Si el servidor local está apagado, ejecutar motor de parseo local en el navegador
  const parsed = clientSideParseBankSms(text, sender);
  const matchResult = clientSideMatchOrderWithSms(parsed);
  displaySimulationResult(parsed, matchResult);

  if (matchResult.matched) {
    updateOrderStatus(matchResult.orderId, 'pagado', {
      verifiedAt: new Date().toISOString(),
      verifiedBySms: true,
      smsMatch: {
        sender: sender,
        bank: parsed.bank,
        smsReference: parsed.reference,
        smsAmount: parsed.amount,
        rawText: text
      }
    });
    playNotificationChime();
    renderOrdersList();
    renderOrdersStats();
  }
}

// Mostrar tarjeta de resultados de la simulación
function displaySimulationResult(parsed, matchResult) {
  const resultBox = document.getElementById('simResultBox');
  if (!resultBox) return;

  resultBox.style.display = 'block';

  let html = `
    <div style="margin-bottom: 8px; font-weight: 800; color: #fff; font-size: 0.9rem;">
      📋 Resultado del Análisis de Expresiones Regulares:
    </div>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-bottom: 12px;">
      <div style="background: rgba(255,255,255,0.03); padding: 6px 10px; border-radius: 4px;">
        <span style="font-size: 0.68rem; color: var(--text-dim); display: block;">BANCO DETECTADO:</span>
        <strong style="color: var(--gold-primary); font-size: 0.8rem;">${escapeHtml(parsed?.bank || 'Desconocido')}</strong>
      </div>
      <div style="background: rgba(255,255,255,0.03); padding: 6px 10px; border-radius: 4px;">
        <span style="font-size: 0.68rem; color: var(--text-dim); display: block;">MONTO EXTRAÍDO:</span>
        <strong style="color: #38bdf8; font-size: 0.85rem;">${parsed?.amount !== null ? 'Bs. ' + Number(parsed.amount).toFixed(2) : 'No detectado'}</strong>
      </div>
      <div style="background: rgba(255,255,255,0.03); padding: 6px 10px; border-radius: 4px;">
        <span style="font-size: 0.68rem; color: var(--text-dim); display: block;">REFERENCIA EXTRAÍDA:</span>
        <strong style="color: #fff; font-size: 0.85rem; font-family: monospace;">${escapeHtml(parsed?.reference || 'No detectada')}</strong>
      </div>
    </div>
  `;

  if (matchResult?.matched) {
    html += `
      <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; border-radius: 6px; padding: 12px; color: #34d399;">
        <div style="font-weight: 800; font-size: 0.95rem; display: flex; align-items: center; gap: 8px;">
          <span>✅ ¡MATCH EXITOSO! ORDEN #${escapeHtml(matchResult.orderId)} PAGADA</span>
        </div>
        <p style="margin: 6px 0 0; font-size: 0.82rem; color: #d1fae5;">
          El monto y la referencia coinciden con un pedido pendiente. El pedido se actualizó automáticamente al estado <strong>PAGADO</strong> y se activó la alerta sonora.
        </p>
      </div>
    `;
  } else {
    html += `
      <div style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 6px; padding: 10px; color: #fca5a5;">
        <div style="font-weight: 700; font-size: 0.85rem;">⚠️ SMS Procesado pero sin coincidencia con pedidos pendientes:</div>
        <div style="font-size: 0.78rem; margin-top: 4px;">${escapeHtml(matchResult?.reason || 'No se encontró ninguna orden pendiente con esta referencia.')}</div>
      </div>
    `;
  }

  resultBox.innerHTML = html;
}

// Motor de parseo cliente cuando el servidor local esté apagado
function clientSideParseBankSms(smsText, sender) {
  const clean = smsText.trim();
  const lower = clean.toLowerCase();

  let bank = 'Desconocido';
  if (sender === '2661' || sender === '2662' || lower.includes('bdv') || lower.includes('banco de venezuela')) {
    bank = 'Banco de Venezuela (BDV)';
  } else if (sender === '2846' || lower.includes('banesco')) {
    bank = 'Banesco';
  } else if (sender === '24024' || lower.includes('mercantil')) {
    bank = 'Mercantil';
  } else if (sender === '1111' || lower.includes('provincial')) {
    bank = 'BBVA Provincial';
  } else if (sender === '26448' || lower.includes('bancamiga')) {
    bank = 'Bancamiga';
  }

  let amount = null;
  const amtMatch = clean.match(/(?:por\s+)?(?:bs\.?|bss|bol[ií]vares|monto:?)\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})|[0-9]+(?:[.,][0-9]{1,2})?)/i) ||
                   clean.match(/([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})|[0-9]+(?:[.,][0-9]{1,2})?)\s*(?:bs\.?|bss)/i);
  if (amtMatch && amtMatch[1]) {
    let numStr = amtMatch[1].replace(/\s+/g, '');
    if (numStr.includes('.') && numStr.includes(',')) numStr = numStr.replace(/\./g, '').replace(',', '.');
    else if (numStr.includes(',')) numStr = numStr.replace(',', '.');
    amount = parseFloat(numStr);
  }

  let reference = null;
  const refMatch = clean.match(/(?:ref(?:erencia)?\.?|operaci[oó]n|op\.?|recibo|comprobante|nro\.?)\s*:?\s*([0-9]{4,14})/i);
  if (refMatch && refMatch[1]) {
    reference = refMatch[1].trim();
  }

  return { bank, amount, reference, raw: clean };
}

function clientSideMatchOrderWithSms(parsed) {
  if (!parsed || !parsed.reference) {
    return { matched: false, reason: 'El SMS no contiene una referencia numérica válida (mínimo 4 dígitos).' };
  }

  const orders = getOrders();
  const pendingOrders = orders.filter(o => o.status === 'pendiente' || o.status === 'nuevo');

  if (pendingOrders.length === 0) {
    return { matched: false, reason: 'No hay pedidos actualmente con estado Pendiente.' };
  }

  const smsRef = String(parsed.reference).trim();
  const smsAmount = parsed.amount;

  for (let o of pendingOrders) {
    const orderRef = String(o.paymentDetails?.reference || '').trim();
    const orderBs = Number(o.paymentDetails?.amountBs || 0);

    if (!orderRef) continue;

    const refMatches = (
      orderRef === smsRef ||
      smsRef.endsWith(orderRef) ||
      orderRef.endsWith(smsRef) ||
      (orderRef.length >= 4 && smsRef.includes(orderRef))
    );

    if (refMatches) {
      let amountMatches = true;
      if (smsAmount !== null && orderBs > 0) {
        amountMatches = (Math.abs(smsAmount - orderBs) <= 3.0); // 3 Bs tolerancia
      }

      if (amountMatches) {
        return { matched: true, orderId: o.id };
      }
    }
  }

  return { matched: false, reason: `La referencia ${smsRef} no coincide con ningún pedido pendiente de pago móvil.` };
}
