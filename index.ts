import axios from "axios";
import { DateTime } from "luxon";
import { notify } from "./utils/telegram";
import { getSavedCookie, loginAndSaveCookie } from "./utils/db";

const USER = process.env.WOD_USER as string;
const PASS = process.env.WOD_PASS as string;
const IDU = process.env.IDU as string;
const TARGET_HOUR = process.env.TARGET_HOUR as string;
const TARGET_TYPE = process.env.TARGET_TYPE as string;
const TARGET_DAY = process.env.TARGET_DAY as string;

async function runSniper() {
  try {
    let cookieValue = getSavedCookie();
    let targetDate: DateTime;
    const zona = "Europe/Madrid";

    // 1. Gestión de Fechas
    if (TARGET_DAY) {
      targetDate = DateTime.fromFormat(TARGET_DAY, "dd/MM/yyyy", { zone: zona }).startOf("day");
    } else {
      targetDate = DateTime.now().setZone(zona).plus({ days: 2 }).startOf("day");
    }

    if (!targetDate.isValid) throw new Error("Fecha TARGET_DAY no válida. Usa DD/MM/YYYY");

    const ticks = Math.floor(targetDate.toSeconds() + targetDate.offset * 60);

    const loadUrl = `https://nasara.wodbuster.com/athlete/handlers/LoadClass.ashx?ticks=${ticks}&idu=${IDU}`;

    // 2. Cargar Clases / Sesión
    let resp;
    try {
      if (!cookieValue) throw new Error("Sin cookie");
      resp = await axios.get(loadUrl, { headers: { Cookie: `.WBAuth=${cookieValue}` } });
      if (typeof resp.data === "string" && resp.data.includes("login")) throw new Error("Expirada");
    } catch (e) {
      console.log("🔄 Renovando sesión...");
      cookieValue = await loginAndSaveCookie();
      resp = await axios.get(loadUrl, { headers: { Cookie: `.WBAuth=${cookieValue}` } });
    }

    // 3. Buscar ID
    const classId =
      resp.data.ListClases?.find((c: any) => c.Hora === TARGET_HOUR && c.NombreE.includes(TARGET_TYPE))?.Id ||
      resp.data.Data?.find((d: any) => d.Hora === TARGET_HOUR)?.Valores.find((v: any) =>
        v.Valor.Nombre.includes(TARGET_TYPE),
      )?.Valor.Id;

    if (!classId) {
      throw new Error(`Clase no encontrada para el ${targetDate.toISODate()}`);
    } else {
      console.log("¡Clase encontrada!");
    }

    // 4. Espera
    if (!TARGET_DAY) {
      console.log("⏳ Esperando a las 22:00:00...");
      while (true) {
        const now = DateTime.now().setZone(zona);
        if (now.hour === 22 && now.minute === 0 && now.second === 0) break;
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    // 5. Reserva
    const reserveUrl = `https://nasara.wodbuster.com/athlete/handlers/Calendario_Inscribir.ashx?id=${classId}&ticks=${ticks}&idu=${IDU}`;
    let responses = [];

    if (TARGET_DAY) {
      responses.push(await axios.get(reserveUrl, { headers: { Cookie: `.WBAuth=${cookieValue}` } }));
    } else {
      responses = await Promise.all([
        axios.get(reserveUrl, { headers: { Cookie: `.WBAuth=${cookieValue}` } }),
        axios.get(reserveUrl, { headers: { Cookie: `.WBAuth=${cookieValue}` } }),
        axios.get(reserveUrl, { headers: { Cookie: `.WBAuth=${cookieValue}` } }),
      ]);
    }

    const success = responses.some((r) => r.data?.Res?.EsCorrecto);

    if (success) {
      await notify(`✅ Reservado: ${targetDate.toFormat("dd/MM")} ${TARGET_HOUR}`);
    } else {
      await notify(`⚠️ Error: ${JSON.stringify(responses[0].data?.Res?.ErrorMsg)}`);
    }
  } catch (e: any) {
    console.error(e.message);
    await notify(`💀 Sniper Falló: ${e.message}`);
  }
}

runSniper();
