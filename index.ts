import axios from "axios";
import { DateTime } from "luxon";
import { notify } from "./utils/telegram";
import { getSavedCookie, isSaturdayRequested, resetSaturdayFlag } from "./utils/db";
import { checkSession } from "./utils/session";

// --- CONFIGURACIÓN ---
const IDU = process.env.IDU as string;
const TARGET_HOUR_NORMAL = process.env.TARGET_HOUR as string;
const TARGET_TYPE = process.env.TARGET_TYPE as string;
const TARGET_DAY = process.env.TARGET_DAY as string;
const TARGET_HOUR_SATURDAY = process.env.TARGET_HOUR_SATURDAY as string;
const TARGET_TYPE_SATURDAY = process.env.TARGET_TYPE_SATURDAY as string;
const ZONE = "Europe/Madrid";

async function runSniper() {
  try {
    // 0. COMPROBACIÓN DE SESIÓN
    await checkSession();
    let cookieValue = getSavedCookie();

    let targetDate: DateTime;
    let targetType: string = TARGET_TYPE;

    // 1. GESTIÓN DE FECHAS
    if (TARGET_DAY) {
      targetDate = DateTime.fromFormat(TARGET_DAY, "dd/MM/yyyy", { zone: ZONE }).startOf("day");
    } else {
      targetDate = DateTime.now().setZone(ZONE).plus({ days: 2 }).startOf("day");
    }

    if (!targetDate.isValid) throw new Error("Fecha TARGET_DAY no válida. Usa DD/MM/YYYY");

    // 2. LÓGICA ESPECIAL DE SÁBADO
    const isSaturday = targetDate.weekday === 6;
    let currentTargetHour = TARGET_HOUR_NORMAL;

    if (isSaturday) {
      if (!isSaturdayRequested()) {
        console.log("ℹ️ El objetivo es Sábado, pero no se ha activado el modo sábado vía Telegram. Abortando.");
        return;
      }
      notify(`🔥 Modo Sábado ACTIVO. Cambiando objetivo a las ${TARGET_HOUR_SATURDAY}`);
      currentTargetHour = TARGET_HOUR_SATURDAY;
      targetType = TARGET_TYPE_SATURDAY;
    }
    const ticks = Math.floor(targetDate.toSeconds() + targetDate.offset * 60);
    console.log(`🎯 Objetivo: ${targetDate.toFormat("dd/MM/yyyy")} a las ${currentTargetHour}`);

    const loadUrl = `https://nasara.wodbuster.com/athlete/handlers/LoadClass.ashx?ticks=${ticks}&idu=${IDU}`;

    // 3. GESTIÓN DE RESERVA
    console.log("📡 Cargando datos de clase...");
    const resp = await axios.get(loadUrl, {
      headers: { Cookie: `.WBAuth=${cookieValue}` },
    });

    if (typeof resp.data === "string" && resp.data.includes("login")) {
      throw new Error(`⚠️ No se pudo reservar: ${resp.data}`);
    }

    // 4. BUSCAR ID DE CLASE
    const classId =
      resp.data.ListClases?.find((c: any) => c.Hora === currentTargetHour && c.NombreE.includes(targetType))?.Id ||
      resp.data.Data?.find((d: any) => d.Hora === currentTargetHour)?.Valores.find((v: any) =>
        v.Valor.Nombre.includes(targetType),
      )?.Valor.Id;

    if (!classId)
      throw new Error(`No se encontró la clase ${targetType} del ${targetDate.toISODate()} a las ${currentTargetHour}`);

    console.log(`📍 ID de clase localizado: ${classId}`);

    // 5. ESPERA (Solo en modo real)
    if (!TARGET_DAY) {
      console.log("⏳ Esperando a las 22:00:00 para disparar...");
      while (true) {
        const now = DateTime.now().setZone(ZONE);
        if (now.hour === 22 && now.minute === 0 && now.second === 0) break;
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    // 6. DISPARO EN RÁFAGA
    const reserveUrl = `https://nasara.wodbuster.com/athlete/handlers/Calendario_Inscribir.ashx?id=${classId}&ticks=${ticks}&idu=${IDU}`;
    let results: any[] = [];

    console.log("🚀 ¡FUEGO!");
    results = await Promise.allSettled([
      axios.get(reserveUrl, { headers: { Cookie: `.WBAuth=${cookieValue}` } }),
      axios.get(reserveUrl, { headers: { Cookie: `.WBAuth=${cookieValue}` } }),
      axios.get(reserveUrl, { headers: { Cookie: `.WBAuth=${cookieValue}` } }),
    ]);

    // 7. ANÁLISIS Y PLAN B (LISTA DE ESPERA)
    const responses = results.filter((r) => r.status === "fulfilled").map((r: any) => r.value);
    const success = responses.some((r) => r.data?.Res?.EsCorrecto ?? r.data?.EsCorrecto);
    const errorMsg = responses[0]?.data?.Res?.ErrorMsg ?? responses[0]?.data?.ErrorMsg ?? "";
    const isFull = errorMsg.includes("Clase llena") || errorMsg.includes("aforo máximo");

    if (success) {
      const msg = `✅ Reserva lograda: ${targetDate.toFormat("dd/MM")} ${currentTargetHour}`;
      console.log(msg);
      await notify(msg);
      if (isSaturday) resetSaturdayFlag();
    } else if (isFull) {
      console.log("⚠️ Clase llena. Intentando lista de espera...");
      await notify(`⚠️ Clase llena a las ${currentTargetHour}. Intentando lista de espera...`);

      const waitlistUrl = `https://nasara.wodbuster.com/athlete/handlers/Calendario_Avisar.ashx?id=${classId}&ticks=${ticks}&idu=${IDU}&connectionId=&_=${Date.now()}`;

      try {
        const waitResponse = await axios.get(waitlistUrl, { headers: { Cookie: `.WBAuth=${cookieValue}` } });
        if (waitResponse.status === 200) {
          await notify(`📩 ¡Apuntado a la lista de espera!`);
          if (isSaturday) resetSaturdayFlag();
        }
      } catch (waitError: any) {
        await notify(`💀 Fallo en lista de espera.`);
      }
    } else {
      console.log("⚠️ No se pudo reservar:", errorMsg);
      await notify(`⚠️ No se pudo reservar: ${errorMsg}`);
      if (isSaturday) resetSaturdayFlag();
    }
  } catch (e: any) {
    console.error("❌ ERROR:", e.message);
    await notify(`💀 Sniper Falló: ${e.message}`);
    process.exit(1);
  }
}

runSniper();
