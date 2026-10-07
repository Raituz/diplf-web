/**
 * DIP LF - Microservidor Webhook para Verificación Automática de Pago Móvil por SMS
 * ---------------------------------------------------------------------------------
 * Este servidor recibe los SMS bancarios reenviados desde el teléfono Android (04122694517),
 * extrae automáticamente el monto y número de referencia mediante expresiones regulares
 * adaptadas a los principales bancos de Venezuela (BDV, Banesco, Mercantil, Provincial, etc.),
 * busca pedidos con estado 'pendiente' y los actualiza a 'pagado'.
 *
 * Sin dependencias externas obligatorias (usa módulos nativos http, fs, path, crypto).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuración general
const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.IP || null;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'diplf_secret_2026';
const AUTHORIZED_PHONE = process.env.AUTHORIZED_PHONE || '04122694517';

// Rutas de almacenamiento local en JSON
const DATA_DIR = path.join(__dirname, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const SMS_LOGS_FILE = path.join(DATA_DIR, 'sms_logs.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// Asegurar directorio de datos
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Configuración por defecto de Pago Móvil
const DEFAULT_CONFIG = {
  receiverPhone: '04122694517',
  receiverBank: 'Banco de Venezuela (0102) / Bancamiga (0172)',
  receiverId: 'V-21726495',
  receiverName: 'DIP LF Salsas Artesanales',
  bcvRate: 395.00,
  webhookSecret: WEBHOOK_SECRET,
  autoVerifyToleranceBs: 2.0 // Tolerancia en Bs para diferencias de céntimos
};

// Cargar o inicializar archivos JSON
function loadJsonFile(filePath, defaultVal) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`Error al leer ${filePath}:`, err.message);
  }
  saveJsonFile(filePath, defaultVal);
  return defaultVal;
}

function saveJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error al guardar ${filePath}:`, err.message);
    return false;
  }
}

// Inicializar archivos si no existen
let ordersDb = loadJsonFile(ORDERS_FILE, []);
let smsLogsDb = loadJsonFile(SMS_LOGS_FILE, []);
let systemConfig = loadJsonFile(CONFIG_FILE, DEFAULT_CONFIG);

// =============================================================================
// MOTOR DE PARSEO DE SMS DE BANCOS VENEZOLANOS
// =============================================================================
/**
 * Normaliza y analiza el texto de un SMS recibido de bancos venezolanos.
 * Soporta formatos de:
 * - Banco de Venezuela (BDV) 2661 / 2662
 * - Banesco 2846
 * - Mercantil 24024
 * - BBVA Provincial 1111
 * - Bancamiga
 * - BNC 262
 * - Formato genérico de Pago Móvil venezolano
 */
function parseBankSms(smsText, sender) {
  if (!smsText || typeof smsText !== 'string') {
    return null;
  }

  const cleanText = smsText.trim();
  const lower = cleanText.toLowerCase();

  let parsed = {
    raw: cleanText,
    sender: sender || 'Desconocido',
    bank: 'Desconocido',
    amount: null,
    reference: null,
    phone: null,
    date: new Date().toISOString(),
    confidence: 0
  };

  // 1. Identificar Banco por remitente o texto
  if (sender === '2661' || sender === '2662' || lower.includes('bdv') || lower.includes('banco de venezuela')) {
    parsed.bank = 'Banco de Venezuela (BDV)';
  } else if (sender === '2846' || lower.includes('banesco')) {
    parsed.bank = 'Banesco';
  } else if (sender === '24024' || lower.includes('mercantil')) {
    parsed.bank = 'Mercantil Banco';
  } else if (sender === '1111' || lower.includes('provincial') || lower.includes('bbva')) {
    parsed.bank = 'BBVA Provincial';
  } else if (sender === '26448' || lower.includes('bancamiga')) {
    parsed.bank = 'Bancamiga';
  } else if (sender === '262' || lower.includes('bnc') || lower.includes('nacional de credito')) {
    parsed.bank = 'Banco Nacional de Crédito (BNC)';
  } else if (lower.includes('bancaribe')) {
    parsed.bank = 'Bancaribe';
  }

  // 2. Extraer Monto
  // Patrones:
  // "por Bs. 1.250,50", "Bs 1250,00", "Bs. 450", "monto Bs: 350.00", "BsS 500"
  const amountPatterns = [
    /(?:por\s+)?(?:bs\.?|bss|bol[ií]vares|monto:?)\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})|[0-9]+(?:[.,][0-9]{1,2})?)/i,
    /([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})|[0-9]+(?:[.,][0-9]{1,2})?)\s*(?:bs\.?|bss|bol[ií]vares)/i,
    /(?:abono|pago\s*m[oó]vil|recibido)\s+por\s+([0-9.,]+)/i
  ];

  for (const regex of amountPatterns) {
    const match = cleanText.match(regex);
    if (match && match[1]) {
      let numStr = match[1].replace(/\s+/g, '');
      // Si tiene punto como separador de miles y coma como decimal: 1.250,50 -> 1250.50
      if (numStr.includes('.') && numStr.includes(',')) {
        numStr = numStr.replace(/\./g, '').replace(',', '.');
      } else if (numStr.includes(',')) {
        numStr = numStr.replace(',', '.');
      }
      const val = parseFloat(numStr);
      if (!isNaN(val) && val > 0) {
        parsed.amount = val;
        parsed.confidence += 40;
        break;
      }
    }
  }

  // 3. Extraer Referencia
  // Patrones:
  // "Ref: 12345678", "Ref. 987654", "Referencia: 45678", "Operacion: 1234", "Op: 9876", "Nro: 123456"
  const refPatterns = [
    /(?:ref(?:erencia)?\.?|operaci[oó]n|op\.?|recibo|comprobante|nro\.?|secuencia)\s*:?\s*([0-9]{4,14})/i,
    /(?:ref\s+)([0-9]{4,14})/i,
    /#([0-9]{4,14})/
  ];

  for (const regex of refPatterns) {
    const match = cleanText.match(regex);
    if (match && match[1]) {
      parsed.reference = match[1].trim();
      parsed.confidence += 40;
      break;
    }
  }

  // 4. Extraer Teléfono Emisor (si está presente en el SMS)
  // 0412, 0414, 0424, 0416, 0426 seguido de 7 dígitos
  const phoneMatch = cleanText.match(/(?:de\s+)?(0412|0414|0424|0416|0426)[-\s]?([0-9]{7})/i);
  if (phoneMatch) {
    parsed.phone = `${phoneMatch[1]}${phoneMatch[2]}`;
    parsed.confidence += 20;
  }

  return parsed;
}

// =============================================================================
// MOTOR DE CONCILIACIÓN / MATCHING DE PEDIDOS
// =============================================================================
function matchOrderWithSms(parsedSms) {
  if (!parsedSms || !parsedSms.reference) {
    return { matched: false, reason: 'SMS no contiene número de referencia identificable.' };
  }

  ordersDb = loadJsonFile(ORDERS_FILE, []);
  
  // Buscar pedidos pendientes
  const pendingOrders = ordersDb.filter(o => 
    o.status === 'pendiente' || o.status === 'nuevo'
  );

  if (pendingOrders.length === 0) {
    return { matched: false, reason: 'No hay pedidos con estado pendiente en la base de datos.' };
  }

  const smsRef = String(parsedSms.reference).trim();
  const smsAmount = parsedSms.amount;
  const tolerance = systemConfig.autoVerifyToleranceBs || 2.0;

  for (let order of pendingOrders) {
    const pDetails = order.paymentDetails || {};
    const orderRef = String(pDetails.reference || '').trim();
    const orderBs = Number(pDetails.amountBs || 0);

    if (!orderRef) continue;

    // Criterio de coincidencia de referencia:
    // 1. Coincidencia exacta
    // 2. Coincidencia por sufijo (el cliente puso los últimos 6 dígitos y el banco mandó 8 con ceros, o viceversa)
    const refMatch = (
      orderRef === smsRef ||
      smsRef.endsWith(orderRef) ||
      orderRef.endsWith(smsRef) ||
      (orderRef.length >= 4 && smsRef.includes(orderRef))
    );

    if (!refMatch) continue;

    // Verificar monto si el SMS tiene monto
    let amountMatch = true;
    if (smsAmount !== null && orderBs > 0) {
      const diff = Math.abs(smsAmount - orderBs);
      amountMatch = (diff <= tolerance);
    }

    if (refMatch && amountMatch) {
      // ¡MATCH EXITOSO! Actualizar pedido a PAGADO
      order.status = 'pagado';
      order.verifiedAt = new Date().toISOString();
      order.verifiedBySms = true;
      order.smsMatch = {
        sender: parsedSms.sender,
        bank: parsedSms.bank,
        smsReference: smsRef,
        smsAmount: smsAmount,
        phone: parsedSms.phone,
        rawText: parsedSms.raw,
        matchedAt: new Date().toISOString()
      };

      saveJsonFile(ORDERS_FILE, ordersDb);

      console.log(`\n======================================================`);
      console.log(`>>> [PAGO MÓVIL VERIFICADO CON ÉXITO] <<<`);
      console.log(`Orden: #${order.id}`);
      console.log(`Referencia SMS: ${smsRef} | Referencia Orden: ${orderRef}`);
      console.log(`Monto SMS: Bs. ${smsAmount} | Monto Orden: Bs. ${orderBs}`);
      console.log(`Nuevo Estado: PAGADO`);
      console.log(`======================================================\n`);

      return {
        matched: true,
        orderId: order.id,
        order: order
      };
    }
  }

  return {
    matched: false,
    reason: `Referencia ${smsRef} no coincide con ningún pedido pendiente o monto fuera de tolerancia.`
  };
}

// =============================================================================
// SERVIDOR HTTP REST & WEBHOOK
// =============================================================================
function sendJsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Webhook-Secret, X-Requested-With'
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Webhook-Secret, X-Requested-With'
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Leer cuerpo para métodos con datos
  let bodyChunks = [];
  req.on('data', chunk => bodyChunks.push(chunk));
  req.on('end', () => {
    let body = {};
    if (bodyChunks.length > 0) {
      try {
        body = JSON.parse(Buffer.concat(bodyChunks).toString('utf8'));
      } catch (e) {
        // Podría ser formulario URL encoded
        const rawStr = Buffer.concat(bodyChunks).toString('utf8');
        try {
          const params = new URLSearchParams(rawStr);
          for (const [k, v] of params.entries()) body[k] = v;
        } catch (_) {}
      }
    }

    handleRoute(req, res, pathname, parsedUrl.searchParams, body);
  });
});

function handleRoute(req, res, pathname, queryParams, body) {
  // 1. ESTADO DEL SERVIDOR (Healthcheck)
  if (req.method === 'GET' && (pathname === '/' || pathname === '/api/status')) {
    ordersDb = loadJsonFile(ORDERS_FILE, []);
    smsLogsDb = loadJsonFile(SMS_LOGS_FILE, []);
    const pendingCount = ordersDb.filter(o => o.status === 'pendiente').length;
    const paidCount = ordersDb.filter(o => o.status === 'pagado').length;

    systemConfig = loadJsonFile(CONFIG_FILE, DEFAULT_CONFIG);
    return sendJsonResponse(res, 200, {
      status: 'online',
      service: 'DIP LF - Webhook Pago Móvil SMS',
      version: '1.0.0',
      authorizedPhone: systemConfig.receiverPhone || AUTHORIZED_PHONE,
      publicWebhookUrl: systemConfig.publicWebhookUrl || null,
      uptimeSeconds: Math.floor(process.uptime()),
      ordersStats: {
        total: ordersDb.length,
        pending: pendingCount,
        paid: paidCount
      },
      lastSms: smsLogsDb[0] || null,
      serverTime: new Date().toISOString()
    });
  }

  // 2. CONFIGURACIÓN (GET / POST)
  if (pathname === '/api/config') {
    if (req.method === 'GET') {
      systemConfig = loadJsonFile(CONFIG_FILE, DEFAULT_CONFIG);
      return sendJsonResponse(res, 200, systemConfig);
    }
    if (req.method === 'POST') {
      systemConfig = { ...systemConfig, ...body };
      saveJsonFile(CONFIG_FILE, systemConfig);
      return sendJsonResponse(res, 200, { success: true, config: systemConfig });
    }
  }

  // 3. PEDIDOS: OBTENER TODOS (GET /api/orders)
  if (req.method === 'GET' && pathname === '/api/orders') {
    ordersDb = loadJsonFile(ORDERS_FILE, []);
    return sendJsonResponse(res, 200, { success: true, orders: ordersDb });
  }

  // 4. PEDIDOS: REGISTRAR NUEVO PEDIDO DESDE LA WEB (POST /api/orders)
  if (req.method === 'POST' && pathname === '/api/orders') {
    if (!body || !body.items) {
      return sendJsonResponse(res, 400, { error: 'Datos de pedido inválidos.' });
    }

    ordersDb = loadJsonFile(ORDERS_FILE, []);
    const orderId = body.id || ('ORD-' + Math.floor(100000 + Math.random() * 900000));
    const now = new Date();

    const newOrder = {
      id: orderId,
      date: body.date || now.toISOString(),
      dateFormatted: body.dateFormatted || now.toLocaleString('es-VE'),
      items: body.items || [],
      totalCount: body.totalCount || 0,
      totalPrice: Number(body.totalPrice || 0),
      paymentMethod: body.paymentMethod || 'pago_movil',
      paymentDetails: body.paymentDetails || null,
      customerNote: body.customerNote || 'Pedido web con Pago Móvil',
      status: body.status || 'pendiente', // Por defecto pendiente
      verifiedAt: null,
      smsMatch: null
    };

    // Prevenir duplicados si ya vino registrado
    const existingIndex = ordersDb.findIndex(o => o.id === newOrder.id);
    if (existingIndex >= 0) {
      ordersDb[existingIndex] = { ...ordersDb[existingIndex], ...newOrder };
    } else {
      ordersDb.unshift(newOrder);
    }

    saveJsonFile(ORDERS_FILE, ordersDb);
    console.log(`[NUEVO PEDIDO REGISTRADO] #${newOrder.id} - Estado: ${newOrder.status}`);

    return sendJsonResponse(res, 201, { success: true, order: newOrder });
  }

  // 5. PEDIDOS: ACTUALIZAR ESTADO (PATCH /api/orders/:id)
  if (req.method === 'PATCH' && pathname.startsWith('/api/orders/')) {
    const orderId = pathname.replace('/api/orders/', '').trim();
    ordersDb = loadJsonFile(ORDERS_FILE, []);
    const order = ordersDb.find(o => o.id === orderId);

    if (!order) {
      return sendJsonResponse(res, 404, { error: 'Pedido no encontrado' });
    }

    if (body.status) order.status = body.status;
    if (body.verifiedBySms !== undefined) order.verifiedBySms = body.verifiedBySms;
    if (body.verifiedAt) order.verifiedAt = body.verifiedAt;
    
    saveJsonFile(ORDERS_FILE, ordersDb);
    return sendJsonResponse(res, 200, { success: true, order: order });
  }

  // 6. WEBHOOK PRINCIPAL: RECEPCIÓN DE SMS BANCARIO (POST /api/webhook/sms)
  if (req.method === 'POST' && (pathname === '/api/webhook/sms' || pathname === '/webhook/sms')) {
    // Validar token de seguridad (opcional pero recomendado)
    const incomingSecret = req.headers['x-webhook-secret'] || queryParams.get('token') || body.token || body.secret;
    const requiredSecret = systemConfig.webhookSecret || WEBHOOK_SECRET;

    if (requiredSecret && incomingSecret && incomingSecret !== requiredSecret) {
      console.warn(`[WEBHOOK ALERTA] Intento de acceso no autorizado con token incorrecto.`);
      return sendJsonResponse(res, 401, { error: 'Token de webhook no autorizado.' });
    }

    // Extraer texto del SMS
    // Varias apps de Android usan diferentes claves en su JSON
    const smsText = body.message || body.text || body.body || body.content || body.sms || '';
    const sender = body.sender || body.from || body.origin || 'BANCO';
    const devicePhone = body.phone || body.device || AUTHORIZED_PHONE;

    if (!smsText) {
      return sendJsonResponse(res, 400, { error: 'El campo de mensaje SMS no puede estar vacío.' });
    }

    console.log(`\n--- [SMS RECIBIDO DE ${sender}] ---`);
    console.log(`Texto: "${smsText}"`);

    // Parsear SMS
    const parsed = parseBankSms(smsText, sender);
    console.log('Datos extraídos del SMS:', JSON.stringify(parsed, null, 2));

    // Registrar en log histórico de SMS
    smsLogsDb = loadJsonFile(SMS_LOGS_FILE, []);
    const logEntry = {
      id: 'SMS-' + Date.now(),
      receivedAt: new Date().toISOString(),
      sender: sender,
      rawText: smsText,
      parsed: parsed,
      matched: false
    };

    // Intentar conciliación con pedidos pendientes
    const matchResult = matchOrderWithSms(parsed);
    logEntry.matched = matchResult.matched;
    if (matchResult.matched) {
      logEntry.matchedOrderId = matchResult.orderId;
    } else {
      logEntry.reason = matchResult.reason;
    }

    smsLogsDb.unshift(logEntry);
    if (smsLogsDb.length > 200) smsLogsDb.pop(); // Mantener últimos 200
    saveJsonFile(SMS_LOGS_FILE, smsLogsDb);

    return sendJsonResponse(res, 200, {
      success: true,
      parsed: parsed,
      matchResult: matchResult
    });
  }

  // 7. SIMULADOR DE PRUEBA DE SMS (POST /api/test/sms)
  if (req.method === 'POST' && pathname === '/api/test/sms') {
    const smsText = body.message || body.text || '';
    const sender = body.sender || '2661';

    if (!smsText) {
      return sendJsonResponse(res, 400, { error: 'Falta el texto del mensaje a simular.' });
    }

    const parsed = parseBankSms(smsText, sender);
    const matchResult = matchOrderWithSms(parsed);

    return sendJsonResponse(res, 200, {
      success: true,
      simulation: true,
      parsed: parsed,
      matchResult: matchResult
    });
  }

  // 8. TASA BCV OFICIAL (GET /api/bcv)
  if (req.method === 'GET' && pathname === '/api/bcv') {
    systemConfig = loadJsonFile(CONFIG_FILE, DEFAULT_CONFIG);
    return sendJsonResponse(res, 200, {
      success: true,
      rate: systemConfig.bcvRate || 395.00,
      currency: 'VES',
      updatedAt: new Date().toISOString()
    });
  }

  // 404 No encontrado
  sendJsonResponse(res, 404, { error: `Ruta no encontrada: ${req.method} ${pathname}` });
}

// Manejo de errores de escucha
server.on('error', (err) => {
  console.error('[ERROR CRÍTICO] Error en el servidor HTTP:', err.message);
});

function onServerListening() {
  console.log(`\n======================================================`);
  console.log(`🚀 [DIP LF] Servidor Webhook Pago Móvil SMS Activo`);
  console.log(`📡 Puerto: ${PORT} | Host: ${HOST || 'todas las interfaces (dual IPv4/IPv6)'}`);
  console.log(`📱 Teléfono Receptor Autorizado: ${systemConfig.receiverPhone || AUTHORIZED_PHONE}`);
  console.log(`🔑 Webhook Secret Token: ${systemConfig.webhookSecret || WEBHOOK_SECRET}`);
  console.log(`------------------------------------------------------`);
  console.log(`📍 Endpoints disponibles:`);
  console.log(`   - Webhook SMS: POST /api/webhook/sms`);
  console.log(`   - API Pedidos: GET/POST /api/orders`);
  console.log(`   - Simulador:   POST /api/test/sms`);
  console.log(`   - Estado:      GET  /api/status`);
  console.log(`======================================================\n`);
  // Mostrar IPs locales para configurar la app Android
  const networkInterfaces = os.networkInterfaces();
  console.log(`📲 Direcciones para configurar en tu teléfono Android (misma red WiFi):`);
  for (const netName in networkInterfaces) {
    for (const net of networkInterfaces[netName]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`   👉 http://${net.address}:${PORT}/api/webhook/sms`);
      }
    }
  }
  console.log(`======================================================\n`);
}

// Iniciar servidor
if (HOST) {
  server.listen(PORT, HOST, onServerListening);
} else {
  server.listen(PORT, onServerListening);
}
