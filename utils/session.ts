import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { Telegraf } from "telegraf";

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN as string;
const TELEGRAM_CHAT = process.env.TELEGRAM_CHAT as string;
const COOKIE_FILE = path.resolve("./cookie.txt");
const bot = new Telegraf(TELEGRAM_TOKEN);

export async function checkSession() {
  console.log("🔍 Verificando sesión...");

  if (!fs.existsSync(COOKIE_FILE)) {
    await bot.telegram.sendMessage(TELEGRAM_CHAT, "⚠️ Error: No encuentro el archivo `cookie.txt`.");
    throw new Error("⚠️ Error: No encuentro el archivo `cookie.txt");
  }

  const cookieValue = fs.readFileSync(COOKIE_FILE, "utf-8").trim();

  if (!cookieValue) {
    await bot.telegram.sendMessage(TELEGRAM_CHAT, "⚠️ Error: No hay cookie guardada en el archivo.");
    throw new Error("⚠️ Error: No hay cookie guardada en el archivo");

    /* Si en un futuro cambiara el servidor de digitalocean por una raspberry donde cloudflare
        no lo detectara como bot, podría hacer el login con playwright en modo headless aquí en vez
        de lanzar el error de arriba 👇 */
    // cookieValue = await loginAndSaveCookie()
  }

  try {
    const timestamp = Date.now();
    const url = `https://nasara.wodbuster.com/user/handlers/getalerts.ashx?_=${timestamp}`;

    const response = await axios.get(url, {
      headers: {
        Cookie: `.WBAuth=${cookieValue}`,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Referer: "https://nasara.wodbuster.com/user/Default.aspx",
      },
      timeout: 10000,
    });

    if (typeof response.data === "string" && response.data.includes("Access is denied")) {
      throw new Error("COOKIE_EXPIRED");
    }

    console.log("✅ Sesión activa. Todo listo para el sniper.");
  } catch (error: any) {
    if (error.response?.status === 403 || error.message === "COOKIE_EXPIRED") {
      console.log("❌ Cookie caducada.");
      await bot.telegram.sendMessage(
        TELEGRAM_CHAT,
        "💀 *SESIÓN CADUCADA*\nEl chequeo ha fallado. La cookie ya no funciona.\n\nActualiza el archivo `cookie.txt` del servidor.",
        { parse_mode: "Markdown" },
      );
    } else {
      console.error("⚠️ Error inesperado en el chequeo:", error.message);
      await bot.telegram.sendMessage(TELEGRAM_CHAT, `⚠️ Error técnico al verificar cookie: ${error.message}`);
    }

    throw error;
  }
}
