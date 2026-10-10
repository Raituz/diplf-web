# 📱 GUÍA DE PAGO MÓVIL CON VERIFICACIÓN AUTOMÁTICA POR SMS
### DIP LF Salsas Artesanales Gourmet • Hand Made

Esta guía explica en detalle cómo funciona el módulo de **Pago Móvil (Venezuela)** con lectura de SMS bancarios para cuentas de persona natural en tu tienda web DIP LF, y cómo dejarlo funcionando al 100% en tu teléfono Android **04122694517**.

---

## 🎯 1. ¿Cómo Funciona el Flujo Completo?

```
[1. Cliente en la Web] 
       │ Añade salsas al carrito, abre el Drawer de pedido y elige "⚡ Pago Móvil".
       │ Elige entre las 2 cuentas destino activas:
       │  • Banco de Venezuela (0102): 0412-2694517 | Cédula V-21726495
       │  • Bancamiga (0172): 0412-2694517 | Cédula V-21726495
       │ Realiza el pago en su banco e ingresa su banco emisor y número de referencia.
       ▼
[2. Verificación Instantánea en Tiempo Real]
       │ El cliente pulsa "⚡ Confirmar y Enviar Pago Móvil".
       │ El sistema consulta el servidor Webhook para comprobar si el banco ya confirmó el abono.
       ▼
[3. Tu Teléfono Android (04122694517)]
       │ El banco (BDV al 2661 o Bancamiga al 26448) envía el SMS o notificación.
       │ La app "DIP LF Webhooks" en tu teléfono lee el SMS y lo envía de inmediato a:
       │ 👉 https://diplf.alwaysdata.net/api/webhook/sms
       ▼
[4. Servidor Webhook DIP LF en la Nube]
       │ Recibe el JSON con el texto del SMS bancario.
       │ Extrae Monto en Bs y Referencia bancaria.
       │ Valida y marca la orden directamente como "✅ PAGADO".
       ▼
[5. Confirmación al Cliente y Almacén]
       │ En la pantalla del cliente aparece de inmediato: "¡Pago Móvil Verificado y Aprobado!".
       │ En el panel de Almacén suena el timbre sonoro de caja registradora 🔔.
       │ La orden entra en preparación automáticamente.
```

---

## 🚀 2. Iniciar el Servidor Webhook en tu Computadora

En la carpeta principal de tu proyecto (`D:\DIP LF WEB`), hemos creado un lanzador directo:

1. Haz doble clic en el archivo **`Iniciar Servidor Webhook.bat`**.
2. Se abrirá una ventana de consola mostrando:
   ```
   ======================================================
   🚀 [DIP LF] Servidor Webhook Pago Móvil SMS Activo
   📡 Puerto: 3000
   📱 Teléfono Receptor Autorizado: 04143572462
   🔑 Webhook Secret Token: diplf_secret_2026
   ------------------------------------------------------
   📲 Dirección para configurar en tu teléfono Android:
      👉 https://diplf.alwaysdata.net/api/webhook/sms
   ======================================================
   ```
3. ¡Listo! Mientras esta ventana esté abierta, tu servidor estará escuchando y conciliando SMS las 24 horas.

---

## 📲 3. Configurar tu Teléfono Android (04143572462)

Para que tu teléfono reenvíe los SMS bancarios automáticamente al servidor Webhook, instalaremos una aplicación ligera y de código abierto.

### Opción Recomendada: **SMS Forwarder** (Open Source, Segura, Sin Publicidad)
* Desarrollador: **pppssh** (disponible en GitHub Releases y F-Droid, o Play Store buscando "SMS Forwarder").
* Alternativas que también funcionan: *Macrodroid*, *Tasker*, o *Webhook SMS Forwarder*.

### Pasos de Configuración en SMS Forwarder:

1. **Instalar la app** en tu teléfono Android **04122694517** y concederle el permiso de **Lectura de SMS** (`RECEIVE_SMS`).
2. En la app, ve a **Sender / Remitentes** (o Canales de Envío) y toca **"+" (Añadir Canal)**:
   * **Tipo de Canal**: Elige `Webhook` (o `HTTP GET / POST`).
   * **Nombre**: `DIP LF Servidor Webhook`.
   * **URL del Webhook**: Escribe la URL que te mostró la consola del servidor (ejemplo: `http://192.168.1.15:3000/api/webhook/sms` si tu teléfono y computadora están en el mismo WiFi).
   * **Método**: `POST`.
   * **Headers (Cabeceras)**:
     ```
     X-Webhook-Secret: diplf_secret_2026
     Content-Type: application/json
     ```
   * **Cuerpo del Mensaje (JSON Template)**:
     ```json
     {
       "phone": "04122694517",
       "sender": "[from]",
       "message": "[content]"
     }
     ```
3. Guarda el Canal y ve a la sección **Rules / Reglas de Reenvío**:
   * Toca **"+" (Añadir Regla)**.
   * **Filtro de remitente**: Activa la regla para los números cortos oficiales de bancos venezolanos:
     * `2661` y `2662` (Banco de Venezuela - BDV)
     * `2846` (Banesco)
     * `24024` (Mercantil)
     * `1111` (BBVA Provincial)
     * `262` (BNC)
     * O simplemente pon en el filtro de contenido que contenga la palabra: `Pago Movil` o `PagoMovil`.
   * **Canal destino**: Selecciona `DIP LF Servidor Webhook`.
4. En los ajustes de batería de Android de tu teléfono, selecciona la app y marca **"Sin restricciones de batería"** para que el sistema Android no la cierre en segundo plano.

---

## 🌐 4. ¿Cómo Conectar tu Teléfono si no estás en la misma red WiFi?

Si sales de tu casa y tu teléfono está con datos móviles (4G Digitel/Movistar), tu teléfono necesita llegar a tu computadora por internet:

* **Opción A (Fácil y Gratuita - Cloudflare Tunnel / Ngrok)**:
  * Ejecuta `npx ngrok http 3000` en tu terminal.
  * Te dará una URL pública segura como `https://abcd-123.ngrok-free.app`.
  * En la app de tu teléfono Android pones esa URL: `https://abcd-123.ngrok-free.app/api/webhook/sms`.
* **Opción B (Servidor en la Nube Gratuito)**:
  * Puedes subir la carpeta `webhook-server` con un solo clic a **Render.com**, **Railway.app** o **Fly.io** (ambos tienen plan gratuito permanente).
  * Te dará una URL pública fija `https://diplf-pago-movil.onrender.com/api/webhook/sms`.

---

## 🧪 5. Simulador Integrado en el Almacén (Para Pruebas sin Dinero Real)

Para comprobar que todo funciona de inmediato sin necesidad de transferirte dinero real:

1. Entra al **Almacén** (`almacen.html` o `https://raituz.github.io/diplf-web/almacen`).
2. Ve a la nueva pestaña: **📱 Pago Móvil & SMS**.
3. Verás:
   * **Estado de Conexión del Servidor**: Verde si el servidor está corriendo en tu computadora.
   * **Ajuste de Tasa BCV**: Puedes cambiar la tasa (ej. 395.00 Bs por dólar) y hacer clic en **"Guardar"**. Esto actualiza automáticamente la conversión de divisas en la tienda pública.
   * **Simulador de SMS Bancario**:
     * Haz clic en el botón **"🎯 Llenar con Pedido Pendiente"**.
     * El simulador tomará el primer pedido que esté en espera y creará un SMS idéntico al de un banco real (con la referencia y el monto exacto).
     * Haz clic en **"⚡ Procesar SMS y Verificar Pago"**.
     * ¡Verás cómo el motor de expresiones regulares extrae los datos, concilia la orden, la pasa a **PAGADO** y reproduce el timbre sonoro al instante!

---

## 📋 6. ¿Y si el Teléfono se queda sin Batería o no llega el SMS?

Diseñamos el sistema para que **NUNCA pierdas una venta**:
* En la lista de pedidos del Almacén, cada pedido con Pago Móvil muestra el banco emisor, teléfono, monto en Bs y referencia.
* Si el cliente te manda la captura por WhatsApp antes de que llegue el SMS, solo debes hacer clic en el botón:
  `[✔ Marcar como Pagado Manualmente]`
* El pedido pasará de inmediato a **Pagado** y quedará registrado.

---

## 🔒 7. Seguridad y Privacidad

* El webhook solo acepta peticiones autenticadas con la clave `X-Webhook-Secret: diplf_secret_2026`.
* Las expresiones regulares analizan únicamente SMS bancarios con palabras clave de abono y transferencia.
* Toda la base de datos de productos, catálogo y carrito original de tu tienda se mantiene **100% intacta e inalterada**, funcionando de forma modular y segura.
