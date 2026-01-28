import axios from "axios";
import { DateTime } from "luxon";
import { notify } from "./utils/telegram";
import { getSavedCookie, loginAndSaveCookie } from "./utils/db";

// --- CONFIGURACIÓN ---
const IDU = process.env.IDU as string;
const TARGET_HOUR = process.env.TARGET_HOUR as string;
const TARGET_TYPE = process.env.TARGET_TYPE as string;
const TARGET_DAY = process.env.TARGET_DAY as string;
const ZONE = "Europe/Madrid";

async function runSniper() {
  try {
    let cookieValue = getSavedCookie();
    let targetDate: DateTime;

    // 1. GESTIÓN DE FECHAS
    if (TARGET_DAY) {
      targetDate = DateTime.fromFormat(TARGET_DAY, "dd/MM/yyyy", { zone: ZONE }).startOf("day");
    } else {
      targetDate = DateTime.now().setZone(ZONE).plus({ days: 2 }).startOf("day");
    }

    if (!targetDate.isValid) throw new Error("Fecha TARGET_DAY no válida. Usa DD/MM/YYYY");

    const ticks = Math.floor(targetDate.toSeconds() + targetDate.offset * 60);

    const loadUrl = `https://nasara.wodbuster.com/athlete/handlers/LoadClass.ashx?ticks=${ticks}&idu=${IDU}`;

    // 2. GESTIÓN DE SESIÓN (COOKIE)
    let resp;
    try {
      if (!cookieValue) throw new Error("Sin cookie guardada");

      console.log("📡 Probando sesión existente...");
      resp = await axios.get(loadUrl, { headers: { Cookie: `.WBAuth=${cookieValue}` } });

      if (typeof resp.data === "string" && resp.data.includes("login")) throw new Error("Sesión expirada");
      console.log("✅ Sesión válida.");
    } catch (e) {
      console.log("🔄 Renovando sesión con Playwright...");
      cookieValue = await loginAndSaveCookie();
      resp = await axios.get(loadUrl, { headers: { Cookie: `.WBAuth=${cookieValue}` } });
    }

    // 3. LOCALIZAR ID DE LA CLASE
    // Buscamos en ambos formatos posibles de respuesta de Wodbuster
    const classId =
      resp.data.ListClases?.find((c: any) => c.Hora === TARGET_HOUR && c.NombreE.includes(TARGET_TYPE))?.Id ||
      resp.data.Data?.find((d: any) => d.Hora === TARGET_HOUR)?.Valores.find((v: any) =>
        v.Valor.Nombre.includes(TARGET_TYPE),
      )?.Valor.Id;

    if (!classId) {
      throw new Error(`No se encontró la clase ${TARGET_TYPE} a las ${TARGET_HOUR}`);
    }
    console.log(`📍 ID de clase localizado: ${classId}`);

    // 4. ESPERA (Solo si no es modo prueba)
    if (!TARGET_DAY) {
      console.log("⏳ Entrando en bucle de espera hasta las 22:00:00...");
      while (true) {
        const now = DateTime.now().setZone(ZONE);
        if (now.hour === 22 && now.minute === 0 && now.second === 0) break;
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    // 5. EJECUCIÓN DE LA RÁFAGA
    const reserveUrl = `https://nasara.wodbuster.com/athlete/handlers/Calendario_Inscribir.ashx?id=${classId}&ticks=${ticks}&idu=${IDU}`;
    let results: any[] = [];

    if (TARGET_DAY) {
      console.log("🚀 Disparo único (Modo Prueba)...");
      const r = await axios.get(reserveUrl, { headers: { Cookie: `.WBAuth=${cookieValue}` } });
      results.push({ status: "fulfilled", value: r });
    } else {
      console.log("🚀 ¡FUEGO EN RÁFAGA!");
      results = await Promise.allSettled([
        axios.get(reserveUrl, { headers: { Cookie: `.WBAuth=${cookieValue}` } }),
        axios.get(reserveUrl, { headers: { Cookie: `.WBAuth=${cookieValue}` } }),
        axios.get(reserveUrl, { headers: { Cookie: `.WBAuth=${cookieValue}` } }),
      ]);
    }

    // 6. ANÁLISIS DE RESULTADOS
    const responses = results.filter((r) => r.status === "fulfilled").map((r) => r.value);

    const success = responses.some((r) => r.data?.Res?.EsCorrecto ?? r.data?.EsCorrecto);
    const errorMsg = responses[0]?.data?.Res?.ErrorMsg ?? responses[0]?.data?.ErrorMsg ?? "";
    const isFull = errorMsg.includes("Clase llena") || errorMsg.includes("aforo máximo");

    if (success) {
      const msg = `✅ Reserva lograda: ${targetDate.toFormat("dd/MM")} ${TARGET_HOUR}`;
      console.log(msg);
      await notify(msg);
    } else if (isFull) {
      // PLAN B: LISTA DE ESPERA
      console.log("⚠️ Clase llena. Intentando apuntar a lista de espera...");
      const waitlistUrl = `https://nasara.wodbuster.com/athlete/handlers/Calendario_Avisar.ashx?id=${classId}&ticks=${ticks}&idu=${IDU}&connectionId=&_=${Date.now()}`;

      try {
        const waitResponse = await axios.get(waitlistUrl, { headers: { Cookie: `.WBAuth=${cookieValue}` } });
        if (waitResponse.status === 200) {
          const msgOk = `📩 ¡Apuntado a la lista de espera correctamente!`;
          console.log(msgOk);
          await notify(msgOk);
        }
      } catch (waitError: any) {
        await notify(`💀 Fallo al apuntar a lista de espera: ${waitError.message}`);
      }
    } else {
      const msgErr = `⚠️ No se pudo reservar: ${errorMsg ?? "Error desconocido"}`;
      console.log(msgErr);
      await notify(msgErr);
    }
  } catch (e: any) {
    console.error("❌ ERROR CRÍTICO:", e.message);
    await notify(`💀 Sniper Falló: ${e.message}`);
  }
}

runSniper();
