/**
 * DIP LF - Catálogo de Productos y Registro de Pedidos
 * Gestiona el almacenamiento local y sincronización en tiempo real
 */

const CATALOG_STORAGE_KEY = 'diplf_custom_catalog';
const ORDERS_STORAGE_KEY = 'diplf_orders';
const NOTIF_SETTINGS_KEY = 'diplf_notif_enabled';

// Catálogo Inicial por Defecto
const INITIAL_FLAVORS = [
  {
    id: 'tocineta',
    name: 'Tocineta',
    category: 'cremosa',
    badge: '★ MÁS VENDIDA',
    desc: 'Cremosa base artesanal con trocitos de tocineta ahumada crujiente seleccionada.',
    image: 'assets/images/Tocineta foto vieja.jfif',
    prices: { '7oz': 2, '16oz': 4, '22oz': 6 },
    stockStatus: 'disponible',
    stockQty: 50,
    isComingSoon: false,
    isDarkBg: false
  },
  {
    id: 'tartara',
    name: 'Tártara',
    category: 'cremosa',
    badge: 'CLÁSICA GOURMET',
    desc: 'Nuestra receta secreta con pepinillos finos, hierbas aromáticas y toque cítrico.',
    image: 'assets/images/Tartara foto vieja.jfif',
    prices: { '7oz': 2, '16oz': 4, '22oz': 6 },
    stockStatus: 'disponible',
    stockQty: 45,
    isComingSoon: false,
    isDarkBg: false
  },
  {
    id: 'antipasto',
    name: 'Antipasto',
    category: 'especial',
    badge: 'TRADICIÓN ITALIANA',
    desc: 'Vegetales frescos macerados en aceite de oliva y especias premium de la casa.',
    image: 'assets/images/Antipasto Foto vieja.jfif',
    prices: { '7oz': 2, '16oz': 4, '22oz': 6 },
    stockStatus: 'disponible',
    stockQty: 40,
    isComingSoon: false,
    isDarkBg: false
  },
  {
    id: 'ajo_perejil',
    name: 'Ajo con Perejil',
    category: 'cremosa',
    badge: 'SABOR INTENSO',
    desc: 'Equilibrio perfecto de ajo suave asado con perejil fresco del campo.',
    image: '',
    prices: { '7oz': 2, '16oz': 4, '22oz': 6 },
    stockStatus: 'proximamente',
    stockQty: 0,
    isComingSoon: true,
    isDarkBg: false
  },
  {
    id: 'guasacaca',
    name: 'Guasacaca',
    category: 'vegetal',
    badge: '100% CRIOLLA',
    desc: 'Aguacate cremoso, pimentón verde, cilantro y condimentos tradicionales frescos.',
    image: '',
    prices: { '7oz': 2, '16oz': 4, '22oz': 6 },
    stockStatus: 'proximamente',
    stockQty: 0,
    isComingSoon: true,
    isDarkBg: false
  },
  {
    id: 'atun',
    name: 'Atún Especial',
    category: 'especial',
    badge: 'DEL MAR',
    desc: 'Lomos de atún seleccionados mezclados con crema suave y toque de cebollín.',
    image: 'assets/images/Atun Foto vieja.jfif',
    prices: { '7oz': 2, '16oz': 4, '22oz': 6 },
    stockStatus: 'disponible',
    stockQty: 35,
    isComingSoon: false,
    isDarkBg: false
  },
  {
    id: 'cebolla_dulce',
    name: 'Cebolla Dulce',
    category: 'cremosa',
    badge: 'CARAMELIZADA',
    desc: 'Cebollas suavemente caramelizadas a fuego lento con notas agridulces.',
    image: 'assets/images/Cebola dulce foto vieja.jfif',
    prices: { '7oz': 2, '16oz': 4, '22oz': 6 },
    stockStatus: 'disponible',
    stockQty: 50,
    isComingSoon: false,
    isDarkBg: false
  },
  {
    id: 'pimenton',
    name: 'Pimentón Ahumado',
    category: 'especial',
    badge: 'DULCE & AHUMADO',
    desc: 'Pimentones rojos asados combinados en una salsa sutil y deliciosa.',
    image: 'assets/images/Pimenton foto vieja.jfif',
    prices: { '7oz': 2, '16oz': 4, '22oz': 6 },
    stockStatus: 'disponible',
    stockQty: 30,
    isComingSoon: false,
    isDarkBg: false
  },
  {
    id: 'pepinillo',
    name: 'Pepinillo Deli',
    category: 'cremosa',
    badge: 'AGRIDULCE',
    desc: 'Deliciosa salsa con toque de pepinillos dulces tipo gourmet neoyorquino.',
    image: 'assets/images/Pepinillo foto Vieja.jfif',
    prices: { '7oz': 2, '16oz': 4, '22oz': 6 },
    stockStatus: 'disponible',
    stockQty: 35,
    isComingSoon: false,
    isDarkBg: false
  },
  {
    id: 'mcdonalds',
    name: 'Estilo McDonald\'s',
    category: 'cremosa',
    badge: 'SECRETO CASERO',
    desc: 'Inspirada en la salsa especial de hamburguesa más famosa del mundo.',
    image: 'assets/images/McDonals Foto vieja.jfif',
    prices: { '7oz': 2, '16oz': 4, '22oz': 6 },
    stockStatus: 'disponible',
    stockQty: 60,
    isComingSoon: false,
    isDarkBg: false
  },
  {
    id: 'taki',
    name: 'Taki Crunch',
    category: 'crujiente',
    badge: '★ PRONTO DISPONIBLE',
    desc: 'Explosión picante y crujiente con auténticos Takis Fuego. (Próximamente disponible).',
    image: '',
    prices: { '7oz': 2, '16oz': 4, '22oz': 6 },
    stockStatus: 'proximamente',
    stockQty: 0,
    isComingSoon: true,
    isDarkBg: false
  }
];

// Obtener catálogo completo
function getCatalog() {
  try {
    const raw = localStorage.getItem(CATALOG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error al cargar catálogo:', err);
  }
  // Inicializar por defecto
  saveCatalog(INITIAL_FLAVORS);
  return [...INITIAL_FLAVORS];
}

// Guardar catálogo
function saveCatalog(products) {
  try {
    localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(products));
    window.dispatchEvent(new CustomEvent('diplf_catalog_updated', { detail: products }));
    return true;
  } catch (err) {
    console.error('Error al guardar catálogo:', err);
    return false;
  }
}

// Restablecer catálogo de fábrica
function resetDefaultCatalog() {
  saveCatalog(INITIAL_FLAVORS);
  return [...INITIAL_FLAVORS];
}

// Obtener un producto por ID
function getProductById(id) {
  const catalog = getCatalog();
  return catalog.find(p => p.id === id) || null;
}

// Actualizar un producto existente
function updateProduct(id, updatedFields) {
  const catalog = getCatalog();
  const index = catalog.findIndex(p => p.id === id);
  if (index === -1) return { success: false, message: 'Producto no encontrado' };

  catalog[index] = {
    ...catalog[index],
    ...updatedFields
  };

  // Ajustar isComingSoon según stockStatus si corresponde
  if (updatedFields.stockStatus) {
    catalog[index].isComingSoon = (updatedFields.stockStatus === 'proximamente');
  }

  saveCatalog(catalog);
  return { success: true, product: catalog[index] };
}

// Añadir un nuevo producto al catálogo
function addNewProduct(productData) {
  const catalog = getCatalog();
  
  // Generar un ID único a partir del nombre
  let baseId = productData.name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  if (!baseId) baseId = 'salsa_' + Date.now();

  let finalId = baseId;
  let counter = 1;
  while (catalog.some(p => p.id === finalId)) {
    finalId = `${baseId}_${counter}`;
    counter++;
  }

  const newProd = {
    id: finalId,
    name: productData.name.trim(),
    category: productData.category || 'especial',
    badge: productData.badge ? productData.badge.trim() : 'NUEVO SABOR',
    desc: productData.desc ? productData.desc.trim() : 'Deliciosa salsa artesanal elaborada con ingredientes frescos seleccionados.',
    image: productData.image || '',
    prices: {
      '7oz': Number(productData.prices?.['7oz'] || 2),
      '16oz': Number(productData.prices?.['16oz'] || 4),
      '22oz': Number(productData.prices?.['22oz'] || 6)
    },
    stockStatus: productData.stockStatus || 'disponible',
    stockQty: Number(productData.stockQty || 30),
    isComingSoon: productData.stockStatus === 'proximamente',
    isDarkBg: false,
    createdAt: new Date().toISOString()
  };

  catalog.push(newProd);
  saveCatalog(catalog);
  return { success: true, product: newProd };
}

// Eliminar un producto del catálogo
function deleteProduct(id) {
  let catalog = getCatalog();
  const exists = catalog.some(p => p.id === id);
  if (!exists) return { success: false, message: 'Producto no encontrado' };

  catalog = catalog.filter(p => p.id !== id);
  saveCatalog(catalog);
  return { success: true };
}

// ==========================================
// GESTIÓN DE PEDIDOS
// ==========================================

// Obtener lista de pedidos
function getOrders() {
  try {
    const raw = localStorage.getItem(ORDERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error('Error al cargar pedidos:', err);
  }
  return [];
}

// Guardar nuevo pedido
function recordNewOrder(orderData) {
  try {
    const orders = getOrders();
    const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    const now = new Date();
    
    const newOrder = {
      id: orderId,
      date: now.toISOString(),
      dateFormatted: now.toLocaleString('es-VE', { 
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit' 
      }),
      items: orderData.items || [],
      totalCount: orderData.totalCount || 0,
      totalPrice: Number(orderData.totalPrice || 0),
      customerNote: orderData.note || 'Pedido web para WhatsApp',
      status: 'nuevo' // 'nuevo', 'en_preparacion', 'entregado', 'cancelado'
    };

    orders.unshift(newOrder); // Más reciente primero
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
    
    // Disparar evento de nuevo pedido
    window.dispatchEvent(new CustomEvent('diplf_new_order', { detail: newOrder }));
    return newOrder;
  } catch (err) {
    console.error('Error al registrar pedido:', err);
    return null;
  }
}

// Cambiar estado de un pedido
function updateOrderStatus(orderId, newStatus) {
  const orders = getOrders();
  const target = orders.find(o => o.id === orderId);
  if (!target) return false;

  target.status = newStatus;
  localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
  window.dispatchEvent(new CustomEvent('diplf_orders_updated', { detail: orders }));
  return true;
}

// Eliminar o limpiar historial de pedidos
function clearAllOrders() {
  localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify([]));
  window.dispatchEvent(new CustomEvent('diplf_orders_updated', { detail: [] }));
}

// Ajustes de notificaciones de sonido / push
function isNotificationEnabled() {
  const saved = localStorage.getItem(NOTIF_SETTINGS_KEY);
  return saved === null ? true : saved === 'true'; // Por defecto activo
}

function setNotificationEnabled(enabled) {
  localStorage.setItem(NOTIF_SETTINGS_KEY, enabled ? 'true' : 'false');
}

// Reproducir Chime de Notificación por Web Audio API
function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Si el contexto está suspendido (política del navegador), intentar reanudarlo
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Melodía elegante de timbre de caja / recepción (4 notas armónicas ascendentes)
    const chord = [523.25, 659.25, 783.99, 1046.50]; // Do5, Mi5, Sol5, Do6
    const startTime = ctx.currentTime + 0.05;

    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime + (idx * 0.1));

      gain.gain.setValueAtTime(0, startTime + (idx * 0.1));
      gain.gain.linearRampToValueAtTime(0.28, startTime + (idx * 0.1) + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + (idx * 0.1) + 0.55);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime + (idx * 0.1));
      osc.stop(startTime + (idx * 0.1) + 0.6);
    });

    // Vibración suave si está en dispositivo móvil compatible
    if (navigator.vibrate) {
      navigator.vibrate([180, 80, 180]);
    }
  } catch (e) {
    console.warn('No se pudo reproducir audio chime:', e);
  }
}
