/**
 * DIP LF - Lanzador Integrado de Servidor Webhook + Túnel Público Cloudflare
 * -------------------------------------------------------------------------
 * Este script:
 * 1. Inicia el microservidor de Webhook en el puerto 3000.
 * 2. Inicia automáticamente el túnel seguro de Cloudflare (tools/cloudflared.exe).
 * 3. Extrae la dirección pública HTTPS (https://*.trycloudflare.com).
 * 4. Guarda la URL pública en data/config.json para que el Almacén la reconozca.
 * 5. Muestra en pantalla la URL exacta que debes pegar en MacroDroid para que funcione con 4G.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Iniciar servidor local
const serverModule = require('./server.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const CLOUDFLARED_PATH = path.join(ROOT_DIR, 'tools', 'cloudflared.exe');
const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');

console.log('Iniciando túnel público de Cloudflare para conexión 4G móvil...');

if (!fs.existsSync(CLOUDFLARED_PATH)) {
  console.error(`[ERROR] No se encontró el ejecutable en: ${CLOUDFLARED_PATH}`);
  console.log('El servidor seguirá funcionando en red local Wi-Fi: http://localhost:3000');
  return;
}

// Iniciar Cloudflare Tunnel
const tunnel = spawn(CLOUDFLARED_PATH, ['tunnel', '--url', 'http://localhost:3000'], {
  stdio: ['ignore', 'pipe', 'pipe']
});

let publicUrlFound = false;

function handleTunnelOutput(data) {
  const text = data.toString();
  // Buscar enlace *.trycloudflare.com
  const match = text.match(/https:\/\/[a-zA-Z0-9\-]+\.trycloudflare\.com/);
  if (match && !publicUrlFound) {
    publicUrlFound = true;
    const basePublicUrl = match[0];
    const webhookPublicUrl = `${basePublicUrl}/api/webhook/sms`;

    // Guardar en config.json
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        cfg.publicWebhookUrl = webhookPublicUrl;
        cfg.lastTunnelUrl = basePublicUrl;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
      }
    } catch (_) {}

    console.log(`\n╔══════════════════════════════════════════════════════════════════════════════╗`);
    console.log(`║                  ✨ ¡TÚNEL PÚBLICO HTTPS ACTIVADO CON ÉXITO!                 ║`);
    console.log(`╠══════════════════════════════════════════════════════════════════════════════╣`);
    console.log(`║                                                                              ║`);
    console.log(`║  📲 COPIA ESTA URL EXACTA EN TU MACRODROID (PASO 2):                         ║`);
    console.log(`║                                                                              ║`);
    console.log(`║  👉  ${webhookPublicUrl.padEnd(68)}║`);
    console.log(`║                                                                              ║`);
    console.log(`║  📶 Funciona desde cualquier lugar con DATOS MÓVILES 4G (Digitel/Movistar)   ║`);
    console.log(`║     sin necesidad de estar conectado al Wi-Fi de tu casa.                    ║`);
    console.log(`║                                                                              ║`);
    console.log(`║  🔑 Token Secreto: diplf_secret_2026                                         ║`);
    console.log(`╚══════════════════════════════════════════════════════════════════════════════╝\n`);
  }
}

tunnel.stdout.on('data', handleTunnelOutput);
tunnel.stderr.on('data', handleTunnelOutput);

tunnel.on('close', (code) => {
  if (!publicUrlFound) {
    console.log(`Túnel de Cloudflare cerrado (código ${code}).`);
  }
});

// Manejo de salida limpia al presionar Ctrl+C
process.on('SIGINT', () => {
  console.log('\nDeteniendo servidor y túnel...');
  tunnel.kill();
  process.exit(0);
});

process.on('exit', () => {
  tunnel.kill();
});
