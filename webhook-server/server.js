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
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

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
let productsDb = loadJsonFile(PRODUCTS_FILE, []);

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
  const senderLower = String(sender || '').toLowerCase();
  if (sender === '2661' || sender === '2662' || senderLower.includes('bdv') || lower.includes('bdv') || lower.includes('banco de venezuela')) {
    parsed.bank = 'Banco de Venezuela (BDV)';
  } else if (sender === '2846' || senderLower.includes('banesco') || lower.includes('banesco')) {
    parsed.bank = 'Banesco';
  } else if (sender === '24024' || senderLower.includes('mercantil') || lower.includes('mercantil')) {
    parsed.bank = 'Mercantil Banco';
  } else if (sender === '1111' || senderLower.includes('provincial') || lower.includes('provincial') || lower.includes('bbva')) {
    parsed.bank = 'BBVA Provincial';
  } else if (sender === '26448' || senderLower.includes('bancamiga') || lower.includes('bancamiga')) {
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

  // 4. Extraer Teléfono Emisor (si está presente en el SMS o notificación)
  // Ejemplos: "de 04122694517", "desde el 04122694517", "del 0412-2694517", o número celular venezolano
  const phoneMatch = cleanText.match(/(?:desde\s+el\s+|desde\s+|del?\s+|de\s+)?(0412|0414|0424|0416|0426)[-\s]?([0-9]{7})/i);
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
      const rawStr = Buffer.concat(bodyChunks).toString('utf8');
      try {
        body = JSON.parse(rawStr);
      } catch (e) {
        // Fallback: si no es JSON válido (ej: texto plano de MacroDroid o URL-encoded)
        let handled = false;
        try {
          if (rawStr.includes('=') && !rawStr.startsWith('{')) {
            const params = new URLSearchParams(rawStr);
            for (const [k, v] of params.entries()) body[k] = v;
            handled = true;
          }
        } catch (_) {}

        if (!handled || !body.message) {
          body.rawText = rawStr;
          body.message = rawStr;
        }
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

    // Si viene con smsId o verifiedBySms, marcar el SMS correspondiente como matched en sms_logs.json
    if (body.smsId || body.verifiedBySms) {
      smsLogsDb = loadJsonFile(SMS_LOGS_FILE, []);
      const smsRef = body.paymentDetails?.reference ? String(body.paymentDetails.reference).trim() : '';
      const smsEntry = smsLogsDb.find(s => 
        (body.smsId && s.id === body.smsId) || 
        (smsRef && s.parsed && s.parsed.reference && String(s.parsed.reference).includes(smsRef))
      );
      if (smsEntry) {
        smsEntry.matched = true;
        smsEntry.matchedOrderId = newOrder.id;
        smsEntry.matchedAt = new Date().toISOString();
        saveJsonFile(SMS_LOGS_FILE, smsLogsDb);

        newOrder.status = 'pagado';
        newOrder.verifiedBySms = true;
        newOrder.verifiedAt = newOrder.verifiedAt || new Date().toISOString();
        if (!newOrder.smsMatch) {
          newOrder.smsMatch = {
            smsId: smsEntry.id,
            sender: smsEntry.sender,
            bank: smsEntry.parsed?.bank,
            smsReference: smsEntry.parsed?.reference,
            smsAmount: smsEntry.parsed?.amount,
            phone: smsEntry.parsed?.phone,
            rawText: smsEntry.rawText,
            matchedAt: smsEntry.matchedAt
          };
        }
      }
    }

    // Prevenir duplicados si ya vino registrado
    const existingIndex = ordersDb.findIndex(o => o.id === newOrder.id);
    if (existingIndex >= 0) {
      ordersDb[existingIndex] = { ...ordersDb[existingIndex], ...newOrder };
    } else {
      ordersDb.unshift(newOrder);
    }

    saveJsonFile(ORDERS_FILE, ordersDb);
    console.log(`[PEDIDO REGISTRADO] #${newOrder.id} - Estado: ${newOrder.status}`);

    return sendJsonResponse(res, 201, { success: true, order: newOrder });
  }

  // 5. VERIFICACIÓN DIRECTA DE PAGO MÓVIL POR SMS (POST /api/verify-payment)
  if (req.method === 'POST' && pathname === '/api/verify-payment') {
    const rawRef = String(body.reference || '').trim();
    const cleanRef = rawRef.replace(/[^0-9]/g, '');
    const clientAmount = Number(body.amountBs || 0);

    if (!cleanRef || cleanRef.length < 4) {
      return sendJsonResponse(res, 400, {
        verified: false,
        error: 'El número de referencia debe contener al menos 4 dígitos numéricos.'
      });
    }

    smsLogsDb = loadJsonFile(SMS_LOGS_FILE, []);
    systemConfig = loadJsonFile(CONFIG_FILE, DEFAULT_CONFIG);
    const tolerance = Number(systemConfig.autoVerifyToleranceBs) || 2.0;

    // Buscar coincidencia en smsLogsDb (desde el más reciente al más antiguo)
    let matchedSms = null;
    const clientPhone = String(body.phone || '').trim().replace(/[^0-9]/g, '');

    for (const entry of smsLogsDb) {
      // Ignorar SMS que ya hayan sido emparejados a otra orden previa
      if (entry.matched) continue;
      if (!entry.parsed) continue;

      // Verificación de monto si el SMS contiene monto
      let amountMatches = true;
      if (entry.parsed.amount !== null && entry.parsed.amount !== undefined && clientAmount > 0) {
        const diff = Math.abs(Number(entry.parsed.amount) - clientAmount);
        amountMatches = (diff <= tolerance);
      } else if (clientAmount > 0 && (entry.parsed.amount === null || entry.parsed.amount === undefined)) {
        amountMatches = false;
      }

      // CASO A: Coincidencia por número de referencia bancaria (BDV, Banesco, etc.)
      let refMatches = false;
      if (entry.parsed.reference) {
        const smsRef = String(entry.parsed.reference).trim();
        const smsCleanRef = smsRef.replace(/[^0-9]/g, '');

        const isExact = (smsRef === rawRef || (cleanRef.length >= 4 && smsCleanRef === cleanRef));
        const isSuffix = (
          (cleanRef.length >= 4 && smsCleanRef.endsWith(cleanRef)) ||
          (smsCleanRef.length >= 4 && cleanRef.endsWith(smsCleanRef))
        );
        const isSubstring = (
          (cleanRef.length >= 4 && smsCleanRef.includes(cleanRef)) ||
          (smsCleanRef.length >= 4 && cleanRef.includes(smsCleanRef))
        );

        refMatches = isExact || isSuffix || isSubstring;
      }

      // CASO B: Coincidencia por Teléfono Emisor + Monto (para Bancamiga Suite y apps cuyas notificaciones omiten la ref)
      let phoneAndAmountMatches = false;
      if (!refMatches && !entry.parsed.reference && entry.parsed.phone && clientPhone && amountMatches) {
        const smsPhoneClean = String(entry.parsed.phone).replace(/[^0-9]/g, '');
        if (smsPhoneClean === clientPhone || (smsPhoneClean.length >= 7 && clientPhone.endsWith(smsPhoneClean.slice(-7)))) {
          // Asegurar que la notificación fue en los últimos 30 minutos
          const receivedTime = new Date(entry.receivedAt).getTime();
          const ageMinutes = (Date.now() - receivedTime) / (1000 * 60);
          if (ageMinutes <= 30) {
            phoneAndAmountMatches = true;
          }
        }
      }

      if ((refMatches || phoneAndAmountMatches) && amountMatches) {
        matchedSms = entry;
        if (!matchedSms.parsed.reference) {
          matchedSms.parsed.reference = rawRef;
        }
        break;
      }
    }

    if (matchedSms) {
      console.log(`\n======================================================`);
      console.log(`>>> [VERIFICACIÓN DE PAGO MÓVIL EXITOSA] <<<`);
      console.log(`Referencia solicitada: ${rawRef} | Coincide con SMS: ${matchedSms.id}`);
      console.log(`Banco: ${matchedSms.parsed.bank} | Monto: Bs. ${matchedSms.parsed.amount}`);
      console.log(`======================================================\n`);

      return sendJsonResponse(res, 200, {
        verified: true,
        smsId: matchedSms.id,
        parsed: matchedSms.parsed,
        receivedAt: matchedSms.receivedAt,
        message: '¡Pago Móvil verificado y confirmado con el banco!'
      });
    }

    console.log(`[VERIFICACIÓN NO ENCONTRADA] Ref: "${rawRef}", Monto: Bs. ${clientAmount} no coincide con ningún SMS disponible.`);
    return sendJsonResponse(res, 200, {
      verified: false,
      reason: `No se encontró ningún Pago Móvil recibido con la referencia ${rawRef} por Bs. ${clientAmount.toFixed(2)}.`
    });
  }

  // 6. PEDIDOS: ACTUALIZAR ESTADO (PATCH /api/orders/:id)
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

  // 7. WEBHOOK PRINCIPAL: RECEPCIÓN DE SMS BANCARIO (POST /api/webhook/sms)
  if (req.method === 'POST' && (pathname === '/api/webhook/sms' || pathname === '/webhook/sms')) {
    // Validar token de seguridad (opcional pero recomendado)
    const incomingSecret = req.headers['x-webhook-secret'] || queryParams.get('token') || body.token || body.secret;
    const requiredSecret = systemConfig.webhookSecret || WEBHOOK_SECRET;

    if (requiredSecret && incomingSecret && incomingSecret !== requiredSecret) {
      console.warn(`[WEBHOOK ALERTA] Intento de acceso no autorizado con token incorrecto.`);
      return sendJsonResponse(res, 401, { error: 'Token de webhook no autorizado.' });
    }

    // Extraer texto del SMS o Notificación Push de la app bancaria
    // Varias apps de Android usan diferentes claves en su JSON
    let smsText = (
      body.message || body.text || body.body || body.content || body.sms || 
      body.notification || body.notification_text || body.not_text || body.rawText ||
      queryParams.get('message') || queryParams.get('text') || queryParams.get('sms') || ''
    );
    if (typeof smsText === 'string' && smsText.startsWith('{') && smsText.includes('"message"')) {
      const match = smsText.match(/"message"\s*:\s*"([^"]+)"/);
      if (match && match[1]) smsText = match[1];
    }
    if (body.title && typeof body.title === 'string' && !smsText.includes(body.title)) {
      smsText = `${body.title} - ${smsText}`;
    }
    const sender = (
      body.sender || body.from || body.origin || body.app || body.application || body.title ||
      queryParams.get('sender') || queryParams.get('from') || 'BANCO'
    );
    const devicePhone = body.phone || body.device || queryParams.get('phone') || AUTHORIZED_PHONE;

    if (!smsText) {
      return sendJsonResponse(res, 400, { error: 'El campo de mensaje o notificación no puede estar vacío.' });
    }

    if (smsText.includes('{not_text}') || smsText.includes('[notification_text]') && smsText.length < 30) {
      console.warn(`\n[MACRODROID ALERTA] Se recibió token sin reemplazar: "${smsText}". Verifica la etiqueta en los [...] de MacroDroid.`);
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

  // 8. SIMULADOR DE PRUEBA DE SMS (POST /api/test/sms)
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

  // 9. TASA BCV OFICIAL (GET /api/bcv)
  if (req.method === 'GET' && pathname === '/api/bcv') {
    systemConfig = loadJsonFile(CONFIG_FILE, DEFAULT_CONFIG);
    return sendJsonResponse(res, 200, {
      success: true,
      rate: systemConfig.bcvRate || 395.00,
      currency: 'VES',
      updatedAt: new Date().toISOString()
    });
  }

  // 10. PRODUCTOS: OBTENER CATÁLOGO GLOBAL (GET /api/products)
  if (req.method === 'GET' && pathname === '/api/products') {
    productsDb = loadJsonFile(PRODUCTS_FILE, []);
    return sendJsonResponse(res, 200, {
      success: true,
      count: productsDb.length,
      products: productsDb
    });
  }

  // 11. PRODUCTOS: GUARDAR O ACTUALIZAR CATÁLOGO COMPLETO (POST / PUT /api/products)
  if ((req.method === 'POST' || req.method === 'PUT') && pathname === '/api/products') {
    const incomingList = Array.isArray(body) ? body : (body.products || body.items);
    if (!Array.isArray(incomingList) || incomingList.length === 0) {
      return sendJsonResponse(res, 400, { error: 'Lista de productos inválida o vacía.' });
    }

    productsDb = incomingList;
    saveJsonFile(PRODUCTS_FILE, productsDb);
    console.log(`[CATÁLOGO ACTUALIZADO EN LA NUBE] Se guardaron ${productsDb.length} productos en data/products.json`);

    return sendJsonResponse(res, 200, {
      success: true,
      count: productsDb.length,
      products: productsDb
    });
  }

  // 12. PRODUCTOS: ACTUALIZAR PRODUCTO INDIVIDUAL (PATCH /api/products/:id)
  if (req.method === 'PATCH' && pathname.startsWith('/api/products/')) {
    const prodId = pathname.replace('/api/products/', '').trim();
    productsDb = loadJsonFile(PRODUCTS_FILE, []);
    const idx = productsDb.findIndex(p => p.id === prodId);

    if (idx === -1) {
      return sendJsonResponse(res, 404, { error: `Producto con ID "${prodId}" no encontrado.` });
    }

    productsDb[idx] = { ...productsDb[idx], ...body };
    saveJsonFile(PRODUCTS_FILE, productsDb);
    console.log(`[PRODUCTO ACTUALIZADO EN LA NUBE] ID: ${prodId}`);

    return sendJsonResponse(res, 200, {
      success: true,
      product: productsDb[idx]
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
  console.log(`   - Verificar:  POST /api/verify-payment`);
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
