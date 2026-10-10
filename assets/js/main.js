/**
 * DIP LF - Salsas Artesanales
 * Lógica Interactiva, Carrito de Consulta y WhatsApp integration
 */

// Configuración de Precios y Tamaños Oficiales
const SIZES = {
  '7oz': { name: '7 oz', ounces: 7, price: 2 },
  '16oz': { name: '16 oz', ounces: 16, price: 4 },
  '22oz': { name: '22 oz', ounces: 22, price: 6 }
};

const WHATSAPP_PHONE = '584143572462'; // 0414-3572462 internacional

// Catálogo de Sabores DIP LF Oficiales
const FLAVORS_DATA = [
  {
    id: 'tocineta',
    name: 'Tocineta',
    category: 'cremosa',
    badge: '★ MÁS VENDIDA',
    desc: 'Cremosa base artesanal con trocitos de tocineta ahumada crujiente seleccionada.',
    image: 'assets/images/Tocineta foto vieja.jfif',
    defaultSize: '16oz',
    isDarkBg: false
  },
  {
    id: 'tartara',
    name: 'Tártara',
    category: 'cremosa',
    badge: 'CLÁSICA GOURMET',
    desc: 'Nuestra receta secreta con pepinillos finos, hierbas aromáticas y toque cítrico.',
    image: 'assets/images/Tartara foto vieja.jfif',
    defaultSize: '16oz',
    isDarkBg: false
  },
  {
    id: 'antipasto',
    name: 'Antipasto',
    category: 'especial',
    badge: 'TRADICIÓN ITALIANA',
    desc: 'Vegetales frescos macerados en aceite de oliva y especias premium de la casa.',
    image: 'assets/images/Antipasto Foto vieja.jfif',
    defaultSize: '16oz',
    isDarkBg: false
  },
  {
    id: 'ajo_perejil',
    name: 'Ajo con Perejil',
    category: 'cremosa',
    badge: 'SABOR INTENSO',
    desc: 'Equilibrio perfecto de ajo suave asado con perejil fresco del campo.',
    image: '',
    isComingSoon: true,
    defaultSize: '16oz',
    isDarkBg: false
  },
  {
    id: 'guasacaca',
    name: 'Guasacaca',
    category: 'vegetal',
    badge: '100% CRIOLLA',
    desc: 'Aguacate cremoso, pimentón verde, cilantro y condimentos tradicionales frescos.',
    image: '',
    isComingSoon: true,
    defaultSize: '16oz',
    isDarkBg: false
  },
  {
    id: 'atun',
    name: 'Atún Especial',
    category: 'especial',
    badge: 'DEL MAR',
    desc: 'Lomos de atún seleccionados mezclados con crema suave y toque de cebollín.',
    image: 'assets/images/Atun Foto vieja.jfif',
    defaultSize: '16oz',
    isDarkBg: false
  },
  {
    id: 'cebolla_dulce',
    name: 'Cebolla Dulce',
    category: 'cremosa',
    badge: 'CARAMELIZADA',
    desc: 'Cebollas suavemente caramelizadas a fuego lento con notas agridulces.',
    image: 'assets/images/Cebola dulce foto vieja.jfif',
    defaultSize: '16oz',
    isDarkBg: false
  },
  {
    id: 'pimenton',
    name: 'Pimentón Ahumado',
    category: 'especial',
    badge: 'DULCE & AHUMADO',
    desc: 'Pimentones rojos asados combinados en una salsa sutil y deliciosa.',
    image: 'assets/images/Pimenton foto vieja.jfif',
    defaultSize: '16oz',
    isDarkBg: false
  },
  {
    id: 'pepinillo',
    name: 'Pepinillo Deli',
    category: 'cremosa',
    badge: 'AGRIDULCE',
    desc: 'Deliciosa salsa con toque de pepinillos dulces tipo gourmet neoyorquino.',
    image: 'assets/images/Pepinillo foto Vieja.jfif',
    defaultSize: '16oz',
    isDarkBg: false
  },
  {
    id: 'mcdonalds',
    name: 'Estilo McDonald\'s',
    category: 'cremosa',
    badge: 'SECRETO CASERO',
    desc: 'Inspirada en la salsa especial de hamburguesa más famosa del mundo.',
    image: 'assets/images/McDonals Foto vieja.jfif',
    defaultSize: '16oz',
    isDarkBg: false
  },
  {
    id: 'taki',
    name: 'Taki Crunch',
    category: 'crujiente',
    badge: '★ PRONTO DISPONIBLE',
    desc: 'Explosión picante y crujiente con auténticos Takis Fuego. (Próximamente disponible).',
    image: '',
    isComingSoon: true,
    defaultSize: '16oz',
    isDarkBg: false
  }
];

// Helper para obtener catálogo activo (local o por defecto)
function getStoreCatalog() {
  if (typeof getCatalog === 'function') {
    return getCatalog();
  }
  return FLAVORS_DATA;
}

// Estado global de la consulta / carrito
let cart = [];

// Cargar carrito de localStorage
function loadCart() {
  try {
    const saved = localStorage.getItem('diplf_cart');
    if (saved) {
      cart = JSON.parse(saved);
    }
  } catch (e) {
    cart = [];
  }
  updateCartUI();
}

// Guardar carrito en localStorage
function saveCart() {
  try {
    localStorage.setItem('diplf_cart', JSON.stringify(cart));
  } catch (e) {}
}

// Añadir producto al carrito
function addToCart(flavorId, sizeKey, quantity = 1) {
  // Si veníamos de una confirmación previa de pago, reiniciar el panel para el nuevo pedido
  if (window.isOrderSuccessActive && typeof window.resetOrderDrawer === 'function') {
    window.resetOrderDrawer();
  }

  const catalog = getStoreCatalog();
  const flavor = catalog.find(f => f.id === flavorId);
  if (!flavor) return;

  const defaultPrice = SIZES[sizeKey] ? SIZES[sizeKey].price : 4;
  const itemPrice = (flavor.prices && flavor.prices[sizeKey] !== undefined)
    ? Number(flavor.prices[sizeKey])
    : defaultPrice;

  const sizeInfo = SIZES[sizeKey] || { name: sizeKey, ounces: 16, price: itemPrice };
  const cartItemId = `${flavorId}_${sizeKey}`;

  const existingIndex = cart.findIndex(item => item.cartItemId === cartItemId);

  if (existingIndex > -1) {
    cart[existingIndex].quantity += quantity;
  } else {
    cart.push({
      cartItemId: cartItemId,
      flavorId: flavor.id,
      name: flavor.name,
      sizeKey: sizeKey,
      sizeName: sizeInfo.name,
      price: itemPrice,
      image: flavor.image,
      quantity: quantity
    });
  }

  saveCart();
  updateCartUI();
  showOrderToast(`¡Añadido! ${flavor.name} (${sizeInfo.name})`);
}

// Actualizar cantidad en carrito
function updateCartItemQty(cartItemId, delta) {
  const itemIndex = cart.findIndex(i => i.cartItemId === cartItemId);
  if (itemIndex === -1) return;

  cart[itemIndex].quantity += delta;
  if (cart[itemIndex].quantity <= 0) {
    cart.splice(itemIndex, 1);
  }

  saveCart();
  updateCartUI();
}

// Eliminar producto de carrito
function removeCartItem(cartItemId) {
  cart = cart.filter(i => i.cartItemId !== cartItemId);
  saveCart();
  updateCartUI();
}

// Vaciar carrito
function clearCart() {
  cart = [];
  saveCart();
  updateCartUI();
}

// Formateador limpio de moneda en USD (evita problemas de precisión decimal como 6.000999999999994)
function formatUsdAmount(val) {
  const n = Number(val);
  if (isNaN(n)) return '0.00';
  // Si es un monto minúsculo para pruebas (ej: 0.001)
  if (n > 0 && n < 0.01) {
    return n.toFixed(3);
  }
  return n.toFixed(2);
}
window.formatUsdAmount = formatUsdAmount;

// Calcular totales
function getCartTotals() {
  let totalCount = 0;
  let totalPrice = 0;
  cart.forEach(item => {
    totalCount += item.quantity;
    totalPrice += item.price * item.quantity;
  });
  return { totalCount, totalPrice };
}

// Actualizar elementos de UI relacionados con el carrito
function updateCartUI() {
  const { totalCount, totalPrice } = getCartTotals();

  // 1. Header Badge
  const headerCount = document.getElementById('headerCartCount');
  if (headerCount) {
    headerCount.textContent = totalCount;
  }

  // 2. Barra flotante inferior izquierda
  const floatingBar = document.getElementById('floatingOrderBar');
  const floatingText = document.getElementById('floatingBarText');
  if (floatingBar && floatingText) {
    if (totalCount > 0) {
      floatingText.textContent = `Tu consulta: ${totalCount} ${totalCount === 1 ? 'salsa' : 'salsas'} · $${formatUsdAmount(totalPrice)}`;
      floatingBar.classList.add('visible');
    } else {
      floatingBar.classList.remove('visible');
    }
  }

  // 3. Renderizar items en el Drawer
  renderDrawerItems();
}

// Renderizar Drawer de Consulta
function renderDrawerItems() {
  const drawerList = document.getElementById('drawerCartList');
  const drawerEmpty = document.getElementById('drawerEmptyState');
  const drawerTotal = document.getElementById('drawerTotalAmount');

  if (!drawerList) return;

  const { totalCount, totalPrice } = getCartTotals();

  // Si la pantalla de confirmación exitosa está activa, no mostrar estado vacío
  if (window.isOrderSuccessActive) {
    if (drawerEmpty) drawerEmpty.style.display = 'none';
    drawerList.innerHTML = '';
    return;
  }

  if (totalCount === 0) {
    if (drawerEmpty) drawerEmpty.style.display = 'block';
    drawerList.innerHTML = '';
    if (drawerTotal) drawerTotal.textContent = '$0.00';
    return;
  }

  if (drawerEmpty) drawerEmpty.style.display = 'none';

  let html = '';
  cart.forEach(item => {
    const subtotal = formatUsdAmount(item.price * item.quantity);
    html += `
      <div class="cart-item-row">
        <div class="cart-item-img">
          <img src="${item.image}" alt="${item.name}">
        </div>
        <div class="cart-item-info">
          <h5>${item.name}</h5>
          <span class="cart-item-meta">${item.sizeName} • $${formatUsdAmount(item.price)} c/u</span>
          <div class="cart-item-controls">
            <button class="btn-qty" onclick="updateCartItemQty('${item.cartItemId}', -1)">-</button>
            <span class="qty-number">${item.quantity}</span>
            <button class="btn-qty" onclick="updateCartItemQty('${item.cartItemId}', 1)">+</button>
            <button class="btn-remove-item" onclick="removeCartItem('${item.cartItemId}')">✕ Eliminar</button>
          </div>
        </div>
        <div class="cart-item-subtotal">
          $${subtotal}
        </div>
      </div>
    `;
  });

  drawerList.innerHTML = html;
  if (drawerTotal) {
    drawerTotal.textContent = `$${formatUsdAmount(totalPrice)}`;
  }
}

// Abrir / Cerrar Drawer
function toggleDrawer(open) {
  const drawer = document.getElementById('consultDrawer');
  const overlay = document.getElementById('drawerOverlay');
  if (!drawer || !overlay) return;

  if (open) {
    drawer.classList.add('active');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  } else {
    drawer.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    // Si se cierra el drawer mientras la confirmación estaba en pantalla, reiniciar para el próximo uso
    if (window.isOrderSuccessActive && typeof window.resetOrderDrawer === 'function') {
      window.resetOrderDrawer();
    }
  }
}

// Enviar Pedido vía WhatsApp
function sendWhatsAppOrder() {
  const { totalCount, totalPrice } = getCartTotals();

  if (totalCount === 0) {
    alert('Primero añade al menos una salsa a tu consulta de pedido.');
    return;
  }

  // Obtener datos del cliente si los llenó en el formulario o los tiene guardados
  let customerName = (document.getElementById('pmCustomerName')?.value || '').trim();
  let customerId = (document.getElementById('pmCustomerId')?.value || '').trim();
  let customerPhone = (document.getElementById('pmSenderPhone')?.value || '').trim();

  if (!customerName || !customerId || !customerPhone) {
    try {
      const saved = JSON.parse(localStorage.getItem('diplf_customer_info') || '{}');
      if (!customerName && saved.name) customerName = saved.name;
      if (!customerId && saved.id) customerId = saved.id;
      if (!customerPhone && saved.phone) customerPhone = saved.phone;
    } catch (_) {}
  }

  // Si los llenó, persistir
  if (customerName || customerId || customerPhone) {
    try {
      localStorage.setItem('diplf_customer_info', JSON.stringify({
        name: customerName,
        id: customerId,
        phone: customerPhone
      }));
    } catch (_) {}
  }

  // Registrar el pedido en el sistema para que aparezca en Almacén y en Rastreo
  let savedOrder = null;
  if (typeof recordNewOrder === 'function') {
    savedOrder = recordNewOrder({
      customerName: customerName || 'Cliente Web',
      customerId: customerId || '',
      customerPhone: customerPhone || '',
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
      paymentMethod: 'whatsapp',
      status: 'nuevo',
      customerNote: 'Pedido para coordinar vía WhatsApp'
    });
  }

  const orderNum = savedOrder ? savedOrder.id : ('ORD-' + Math.floor(100000 + Math.random() * 900000));

  let text = `¡Hola DIP LF! 👋 Quiero consultar y coordinar este pedido:\n\n`;
  text += `📦 *ORDEN:* #${orderNum}\n`;
  if (customerName) text += `👤 *CLIENTE:* ${customerName} ${customerId ? `(C.I: ${customerId})` : ''}\n`;
  if (customerPhone) text += `📱 *TELÉFONO:* ${customerPhone}\n`;
  text += `\n🛒 *MI PEDIDO DE SALSAS:*\n`;

  cart.forEach(item => {
    const subtotal = item.price * item.quantity;
    text += `• ${item.quantity}x ${item.name} (${item.sizeName}) → $${subtotal.toFixed(2)}\n`;
  });

  text += `\n💵 *Total estimado:* $${totalPrice.toFixed(2)} USD\n`;
  text += `📍 *¿Tienen disponibilidad y delivery activo para hoy?*\n`;
  text += `\n(Pedido realizado desde la web de DIP LF - Guía #${orderNum})`;

  const url = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');

  showOrderToast(`¡Orden #${orderNum} creada! Puedes rastrearla en la web.`);
}

// Toast de notificación simple
function showOrderToast(msg) {
  let toast = document.getElementById('orderToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'orderToast';
    toast.style.cssText = `
      position: fixed;
      top: 80px;
      right: 24px;
      background: #f59e0b;
      color: #000;
      padding: 12px 20px;
      border-radius: 30px;
      font-weight: 800;
      font-size: 0.85rem;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      z-index: 3000;
      transition: all 0.3s ease;
      transform: translateY(-20px);
      opacity: 0;
      pointer-events: none;
    `;
    document.body.appendChild(toast);
  }

  toast.textContent = msg;
  toast.style.transform = 'translateY(0)';
  toast.style.opacity = '1';

  setTimeout(() => {
    toast.style.transform = 'translateY(-20px)';
    toast.style.opacity = '0';
  }, 2200);
}

// Renderizar Cuadrícula de Sabores Dinámica
function renderFlavorsGrid(categoryFilter = 'todos') {
  const grid = document.getElementById('flavorsGrid');
  if (!grid) return;

  const catalog = getStoreCatalog();
  const filtered = categoryFilter === 'todos' 
    ? catalog 
    : catalog.filter(f => f.category === categoryFilter);

  let html = '';
  filtered.forEach(flavor => {
    const price7 = (flavor.prices && flavor.prices['7oz'] !== undefined) ? flavor.prices['7oz'] : 2;
    const price16 = (flavor.prices && flavor.prices['16oz'] !== undefined) ? flavor.prices['16oz'] : 4;
    const price22 = (flavor.prices && flavor.prices['22oz'] !== undefined) ? flavor.prices['22oz'] : 6;

    const isUnavailable = Boolean(flavor.isComingSoon || flavor.stockStatus === 'proximamente' || flavor.stockStatus === 'agotado');
    let btnText = '+ Añadir';
    if (flavor.isComingSoon || flavor.stockStatus === 'proximamente') {
      btnText = 'Próximamente';
    } else if (flavor.stockStatus === 'agotado') {
      btnText = 'Agotado';
    }

    const bgClass = flavor.isDarkBg ? 'dark-bg' : 'light-bg';
    html += `
      <div class="flavor-card" data-flavor-id="${flavor.id}">
        <div class="flavor-img-wrapper ${bgClass} ${!flavor.image ? 'coming-soon-img' : ''}">
          <span class="flavor-badge-type">${flavor.badge || ''}</span>
          ${flavor.image 
            ? `<img src="${flavor.image}" alt="${flavor.name}" loading="lazy">` 
            : `<div class="coming-soon-placeholder">
                 <span class="coming-soon-icon">🌶️</span>
                 <span class="coming-soon-text">¡MUY PRONTO!</span>
                 <span class="coming-soon-sub">Receta & foto en camino</span>
               </div>`
          }
        </div>
        <div class="flavor-body">
          <h3 class="flavor-title">${flavor.name}</h3>
          <p class="flavor-desc">${flavor.desc}</p>
          
          <div class="size-selector-label">Selecciona el tamaño:</div>
          <div class="size-options">
            <div class="size-pill" data-size="7oz" onclick="selectCardSize('${flavor.id}', '7oz')">
              <span class="size-name">7 oz</span>
              <span class="size-price-tag">$${price7}</span>
            </div>
            <div class="size-pill active" data-size="16oz" onclick="selectCardSize('${flavor.id}', '16oz')">
              <span class="size-name">16 oz</span>
              <span class="size-price-tag">$${price16}</span>
            </div>
            <div class="size-pill" data-size="22oz" onclick="selectCardSize('${flavor.id}', '22oz')">
              <span class="size-name">22 oz</span>
              <span class="size-price-tag">$${price22}</span>
            </div>
          </div>
          
          <div class="flavor-card-footer">
            <div class="price-display-block">
              <span class="price-label-small">Precio:</span>
              <span class="price-amount" id="price_${flavor.id}">$${price16}</span>
            </div>
            <button class="btn-add-consult" onclick="handleAddFromCard('${flavor.id}')" ${isUnavailable ? 'disabled style="opacity: 0.55; cursor: not-allowed;"' : ''}>
              <span>${btnText}</span>
            </button>
          </div>
        </div>
      </div>
    `;
  });

  grid.innerHTML = html;
}

// Seleccionar tamaño en tarjeta de producto
const cardSelectedSizes = {};

function selectCardSize(flavorId, sizeKey) {
  cardSelectedSizes[flavorId] = sizeKey;
  const card = document.querySelector(`.flavor-card[data-flavor-id="${flavorId}"]`);
  if (!card) return;

  // Actualizar clases activas en píldoras de tamaño
  const pills = card.querySelectorAll('.size-pill');
  pills.forEach(p => {
    if (p.getAttribute('data-size') === sizeKey) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });

  // Actualizar precio visible
  const priceElem = document.getElementById(`price_${flavorId}`);
  if (priceElem) {
    const catalog = getStoreCatalog();
    const flavor = catalog.find(f => f.id === flavorId);
    const itemPrice = (flavor && flavor.prices && flavor.prices[sizeKey] !== undefined)
      ? flavor.prices[sizeKey]
      : (SIZES[sizeKey] ? SIZES[sizeKey].price : 4);
    priceElem.textContent = `$${itemPrice}`;
  }
}

function handleAddFromCard(flavorId) {
  const chosenSize = cardSelectedSizes[flavorId] || '16oz';
  addToCart(flavorId, chosenSize, 1);
}

// Interactividad en el Card Stack del Hero
let currentHeroSize = '16oz';

function selectHeroSize(sizeKey) {
  currentHeroSize = sizeKey;
  const sizeObj = SIZES[sizeKey];
  
  // Actualizar botones
  document.querySelectorAll('.hero-size-btn').forEach(btn => {
    if (btn.getAttribute('data-size') === sizeKey) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Actualizar precio
  const priceDisplay = document.getElementById('heroCardPrice');
  if (priceDisplay) {
    priceDisplay.textContent = `$${sizeObj.price}`;
  }
}

function addHeroCardToCart() {
  // Añade la salsa frontal del Hero (Tocineta o Cebolla Dulce)
  addToCart('tocineta', currentHeroSize, 1);
}

// Inicialización general al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  // Cargar estado
  loadCart();
  renderFlavorsGrid('todos');

  // Sticky Header Scroll
  const header = document.querySelector('.site-header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      header?.classList.add('scrolled');
    } else {
      header?.classList.remove('scrolled');
    }
  });

  // Filtros de categoría
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      const cat = e.target.getAttribute('data-category');
      renderFlavorsGrid(cat);
    });
  });

  // Delegar eventos de Drawer
  document.getElementById('btnOpenCart')?.addEventListener('click', () => toggleDrawer(true));
  document.getElementById('floatingOrderBar')?.addEventListener('click', () => toggleDrawer(true));
  document.getElementById('drawerCloseBtn')?.addEventListener('click', () => toggleDrawer(false));
  document.getElementById('drawerOverlay')?.addEventListener('click', () => toggleDrawer(false));
  document.getElementById('btnSubmitOrder')?.addEventListener('click', sendWhatsAppOrder);

  // Menú Móvil Toggle
  const btnMobileMenu = document.getElementById('btnMobileMenu');
  const navMenu = document.querySelector('.nav-menu');
  btnMobileMenu?.addEventListener('click', () => {
    navMenu?.classList.toggle('active');
  });

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      navMenu?.classList.remove('active');
    });
  });

  // Control de visibilidad del botón Almacén (SOLO para Administrador)
  function updateAdminHeaderButton() {
    const adminBtn = document.getElementById('headerAdminBtn');
    if (adminBtn) {
      if (typeof isAdmin === 'function' && isAdmin()) {
        adminBtn.style.display = 'inline-flex';
      } else {
        adminBtn.style.display = 'none';
      }
    }
  }

  // Determina si una orden está activa/incompleta (requiere atención del cliente o entrega)
  function isOrderActive(order) {
    if (!order || !order.status) return true;
    const s = String(order.status).toLowerCase().trim();
    // Desaparece si está entregado o completado, o si fue cancelado
    if (s === 'entregado' || s === 'completado' || s.includes('entregad')) return false;
    if (s === 'cancelado' || s === 'anulado' || s === 'rechazado' || s.includes('cancel')) return false;
    // Permanece para: pendiente, pagado, en_preparacion, listo_entrega, etc.
    return true;
  }

  // Actualizar contador del botón Órdenes
  function updateOrdersHeaderBadge() {
    const badge = document.getElementById('headerOrdersBadge');
    if (!badge) return;
    try {
      const raw = localStorage.getItem('diplf_orders');
      if (raw) {
        const orders = JSON.parse(raw);
        if (Array.isArray(orders)) {
          const activeOrders = orders.filter(isOrderActive);
          if (activeOrders.length > 0) {
            badge.textContent = activeOrders.length > 9 ? '9+' : activeOrders.length;
            badge.style.display = 'inline-flex';
            return;
          }
        }
      }
    } catch (_) {}
    badge.style.display = 'none';
  }

  // Sincronizar en tiempo real con el servidor Alwaysdata para reflejar de inmediato si el gerente marcó "entregado"
  async function syncOrdersWithServer() {
    try {
      const webhookUrl = (typeof getWebhookServerUrl === 'function') ? getWebhookServerUrl() : 'https://diplf.alwaysdata.net';
      const res = await fetch(`${webhookUrl}/api/orders`, { signal: AbortSignal.timeout(4500) });
      if (res.ok) {
        const data = await res.json();
        const remoteOrders = Array.isArray(data) ? data : (Array.isArray(data?.orders) ? data.orders : []);
        if (Array.isArray(remoteOrders) && remoteOrders.length > 0) {
          const localRaw = localStorage.getItem('diplf_orders');
          const localOrders = localRaw ? JSON.parse(localRaw) : [];
          const map = new Map();
          remoteOrders.forEach(ro => { if (ro && ro.id) map.set(ro.id, ro); });
          if (Array.isArray(localOrders)) {
            localOrders.forEach(lo => {
              if (lo && lo.id) {
                if (!map.has(lo.id)) {
                  map.set(lo.id, lo);
                } else {
                  const ro = map.get(lo.id);
                  map.set(lo.id, { ...lo, ...ro, status: ro.status || lo.status });
                }
              }
            });
          }
          const merged = Array.from(map.values());
          localStorage.setItem('diplf_orders', JSON.stringify(merged));
          updateOrdersHeaderBadge();
        }
      }
    } catch (_) {}
  }

  updateAdminHeaderButton();
  updateOrdersHeaderBadge();
  syncOrdersWithServer();
  setInterval(syncOrdersWithServer, 15000);

  // Escuchar si cambia la sesión, órdenes o el catálogo
  window.addEventListener('diplf_auth_changed', updateAdminHeaderButton);
  window.addEventListener('diplf_new_order', updateOrdersHeaderBadge);
  window.addEventListener('diplf_orders_updated', updateOrdersHeaderBadge);
  window.addEventListener('diplf_catalog_updated', () => renderFlavorsGrid());
  window.addEventListener('storage', (e) => {
    if (e.key === 'diplf_auth_user') updateAdminHeaderButton();
    if (e.key === 'diplf_orders') updateOrdersHeaderBadge();
    if (e.key === 'diplf_custom_catalog') renderFlavorsGrid();
  });
});
