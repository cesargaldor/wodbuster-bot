import axios from "axios";
import { notify } from "./utils/telegram";
import { getSavedCookie, loginAndSaveCookie } from "./utils/db";

// --- CONFIGURACIÓN ---
const USER = process.env.WOD_USER;
const PASS = process.env.WOD_PASS;
const IDU = process.env.IDU;
const TARGET_HOUR = process.env.TARGET_HOUR;
const TARGET_TYPE = process.env.TARGET_TYPE;

// --- FUNCIÓN PRINCIPAL ---
async function runSniper() {
  try {
    let cookieStr = getSavedCookie();

    // 1. Calcular Ticks (Clase dentro de 2 días)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 2);
    targetDate.setHours(0, 0, 0, 0);
    const ticks = Math.floor(targetDate.getTime() / 1000);

    const loadUrl = `https://nasara.wodbuster.com/athlete/handlers/LoadClass.ashx?ticks=${ticks}&idu=${IDU}`;

    let resp;
    try {
      if (!cookieStr) throw new Error("Sin cookie");
      console.log("📡 Probando sesión existente...");
      resp = await axios.get(loadUrl, { headers: { Cookie: `.WBAuth=${cookieStr}` } });

      console.log("Datos de la respuesta: ", resp.data);
      // Si el JSON no tiene los campos esperados o redirige al login
      if (typeof resp.data === "string" && resp.data.includes("login")) {
        throw new Error("Sesión expirada");
      }
    } catch (e) {
      cookieStr = await loginAndSaveCookie();
      resp = await axios.get(loadUrl, { headers: { Cookie: `.WBAuth=${cookieStr}` } });
    }

    // 2. Localizar ID de la clase
    const classId =
      resp.data.ListClases?.find((c: any) => c.Hora === TARGET_HOUR && c.NombreE.includes(TARGET_TYPE))?.Id ||
      resp.data.Data?.find((d: any) => d.Hora === TARGET_HOUR)?.Valores.find((v: any) =>
        v.Valor.Nombre.includes(TARGET_TYPE),
      )?.Valor.Id;

    if (!classId) {
      throw new Error(`No se encontró la clase ${TARGET_TYPE} a las ${TARGET_HOUR}`);
    }

    console.log(`🎯 Objetivo fijado: ID ${classId}. Esperando a la hora ${TARGET_HOUR}...`);

    // 3. Sniper (Espera activa los últimos segundos)
    while (true) {
      const now = new Date();
      if (now.getHours() === 22 && now.getMinutes() === 0 && now.getSeconds() === 0) {
        break;
      }
      // Pequeño respiro de 100ms para no quemar la CPU hasta el último segundo
      if (now.getHours() < 22) await new Promise((r) => setTimeout(r, 100));
    }

    // 4. Disparo en ráfaga
    const reserveUrl = `https://nasara.wodbuster.com/athlete/handlers/Calendario_Inscribir.ashx?id=${classId}&ticks=${ticks}&idu=${IDU}`;
    console.log("🚀 FUEGO!");

    const burst = await Promise.all([
      axios.get(reserveUrl, { headers: { Cookie: cookieStr } }),
      axios.get(reserveUrl, { headers: { Cookie: cookieStr } }),
      axios.get(reserveUrl, { headers: { Cookie: cookieStr } }),
    ]);

    const exito = burst.some(
      (r) => JSON.stringify(r.data).includes("OK") || JSON.stringify(r.data).includes("inscrito"),
    );

    if (exito) {
      await notify(`✅ Reserva lograda para el día ${targetDate.toLocaleDateString()}`);
    } else {
      await notify(`⚠️ Error en reserva: ${JSON.stringify(burst[0].data)}`);
    }
  } catch (e: any) {
    console.error("Error:", e.message);
    await notify(`💀 Sniper Falló: ${e.message}`);
  }
}

runSniper();
