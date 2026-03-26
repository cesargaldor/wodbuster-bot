# WodBuster CrossFit Bot Serverless 🏋️‍♂️

Este repositorio contiene un bot automatizado ("sniper") para reservar clases de CrossFit en WodBuster. Ha sido migrado de una arquitectura tradicional en VPS (cron + PM2) a una arquitectura **Serverless**. Las ventajas de este diseño son su **costo cero** y que no hay servidores que mantener.

## 🏗️ Arquitectura del Sistema

El sistema se divide en tres piezas principales que colaboran entre sí de forma desacoplada:

1. **Bot de Telegram (Cloudflare Workers)** `worker/index.ts`
   Este es el frontal administrativo del usuario. Al ser un Cloudflare Worker, se levanta instantáneamente (costo $0) cuando Telegram le avisa por _webhook_ de un nuevo mensaje.
   - ✅ Permite elegir los días activos activando/desactivando días en un teclado interactivo.
   - ✅ Escucha el comando `cookie:<valor_cookie>` para renovar la sesión de WodBuster.
   - _La información se guarda directamente en Cloudflare KV (Base de Datos)._

2. **Capa de Almacenamiento (Cloudflare KV)** `wrangler.toml` (Configuración)
   Sustituye a los antiguos archivos locales `cookie.txt` y `days_config.json`. Cloudflare KV es un almacén clave-valor extremadamente rápido.
   - `session_cookie`: Guarda el valor de la sesión `.WBAuth`.
   - `days_config`: Guarda la configuración en JSON (`{"activeDays": [1, 2, ... ]}`).

3. **Capa de Ejecución (GitHub Actions)** `.github/workflows/`
   Son servidores efímeros que levanta GitHub en los momentos programados. Descargan los datos de Cloudflare KV transparentemente en archivos locales temporales y ejecutan los scripts originales, los cuales no saben que están en la nube.
   - **`booking.yml`**: Ejecuta `index.ts` _todos los días a una hora previa a las 22:00 de Madrid_. Espera y dispara en ráfaga para conseguir plaza a la hora exacta.
   - **`watcher.yml`**: Ejecuta `watcher.ts` _todos los días a las 17:00 de Madrid_. Verifica la salud de la cookie y notifica por Telegram si ha caducado.

---

## 📂 Visión General de los Archivos

### 🛠️ Código Principal

- `index.ts`: "Sniper" original. Lee la cookie y la config, localiza la clase apropiada basándose en las variables de entorno (`TARGET_TYPE`, etc.), y hace las peticiones concurrentes a Wodbuster.
- `watcher.ts`: Utilidad que, lanzada por su cron, comprueba si la cookie es válida e invoca alerta roja de Telegram en caso de que esté vencida.
- `utils/`: Contiene extractores y ayudantes para base de datos local y sesiones (que son pre-alimentadas mediante GitHub Actions desde Cloudflare KV).

### ☁️ Configuración del Worker

- `worker/index.ts`: Código fuente exclusivo del Cloudflare Worker rediseñado mediante el uso de la API REST nativa de Telegram (usando subyacente `fetch`, sin librerías externas), logrando 0 colisiones en el empaquetado y máxima compatibilidad V8.
- `worker/tsconfig.json`: Preferencias de compilador específicas del entorno Worker de Cloudflare.
- `wrangler.toml`: Hoja de ruta para el CLI oficial de Cloudflare (`wrangler`). Define el nombre del Worker y en qué base de datos KV se conectará.

### ⚙️ CI/CD Automático (GitHub Actions)

- `.github/workflows/booking.yml`: Lanza la reserva de clase.
- `.github/workflows/watcher.yml`: Comprueba estado de sesión. Contiene control automático para sortear los cambios de horario (Verano/Invierno) comprobando a las 15:00 UTC y 16:00 UTC pero continuando _sólo_ cuando en la zona de Madrid son las `17`.
- `.github/workflows/deploy-cloudflare.yml`: Cada vez que haces un cambio en la rama `main` en la carpeta `worker/`, actualiza de cero tu infraestructura del Bot en la Nube mediante Wrangler.

---

## 🧪 Cómo Comprobar que Todo Funciona

Si has desplegado con éxito, aquí tienes la ruta de comprobaciones:

### 1. Comprueba el Worker de Telegram (Bot)

Abre Telegram, vé a tu bot y envía el comando `/dias`.

- Si el bot te responde con el bloque de botones de lunes a sábado **¡El Worker de Cloudflare, la base KV y el Webhook de Telegram están funcionando en armonía!**
- Pulsa en un día. Debería reaccionar poniéndose verde (✅) o rojo (❌). _Este gesto graba la decisión en Cloudflare KV._
- Envía: `cookie:valor_de_prueba`. Te contestará que se ha actualizado en KV.

### 2. Comprueba el Watcher

Ve a tu repositorio de GitHub > pestaña **"Actions"**.

- Selecciona en la barra lateral el workflow llamado **"👁️ Watcher — Verificación de cookie"**.
- A la derecha, haz click en el desplegable **"Run workflow"** y lánzalo manually.
- Entra al Job cuando termine. Debería decir que se conectó con Cloudflare via Curl, bajó un archivo local ficticio, ejecutó el script `.ts` y (dependiendo de si subiste una cookie real a Cloudflare o no) el script fallará y **te avisará por Telegram** de que la cookie expiró. Si tienes una cookie válida y viva, pasará en verde limpio.

### 3. Comprueba el Reserva (Booking)

También en la pestaña Actions, repite para el workflow **"🏋️ Booking — Reserva de clase"**.
Al igual que el watcher, puedes probar a ejecutarlo fuera de base. Te advertirá de las características de la espera (debido a su programación para las 22:00h).
