import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import fs from "node:fs";
import path from "node:path";
import { Telegraf } from "telegraf";

chromium.use(stealth());

const USER = process.env.WOD_USER as string;
const PASS = process.env.WOD_PASS as string;
const TELEGRAM_CHAT = process.env.TELEGRAM_CHAT as string;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN as string;

const COOKIE_FILE = path.resolve("./cookie.txt");
const SATURDAY_FILE = path.resolve("./saturday_active.txt");

const bot = new Telegraf(TELEGRAM_TOKEN);

export function getSavedCookie() {
  try {
    if (fs.existsSync(COOKIE_FILE)) {
      const cookie = fs.readFileSync(COOKIE_FILE, "utf-8");
      return cookie.trim() || undefined;
    }
  } catch (error) {
    console.error("Error leyendo el archivo de cookie:", error);
  }
  return undefined;
}

export function saveCookie(cookie: string) {
  try {
    fs.writeFileSync(COOKIE_FILE, cookie, "utf-8");
  } catch (error) {
    console.error("Error guardando la cookie:", error);
  }
}

export async function loginAndSaveCookie() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    javaScriptEnabled: true,
    acceptDownloads: true,
    ignoreHTTPSErrors: false,
  });
  const page = await context.newPage();

  try {
    await page.goto("https://wodbuster.com/account/login.aspx?cb=nasara", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const emailSelector = 'input[id*="body_body_CtlLogin_IoEmail"]';
    await page.waitForSelector(emailSelector, { state: "visible", timeout: 15000 });
    await page.fill(emailSelector, USER);
    await page.fill('input[id*="body_body_CtlLogin_IoPassword"]', PASS);
    await page.click('input[id="body_body_CtlLogin_CtlAceptar"]');

    await page.waitForTimeout(5000);

    const trustLabel = 'label[for*="body_body_CtlConfiar_CtlNoSeguroConfianza"]';
    if (await page.isVisible(trustLabel)) {
      await page.click(trustLabel);
      await page.waitForTimeout(2000);
    }

    await page.waitForURL("**/user/**", { timeout: 20000 });

    const cookies = await context.cookies();
    const wbAuth = cookies.find((c) => c.name === ".WBAuth")?.value;
    const cookieStr = wbAuth ?? "";
    saveCookie(cookieStr);
    return cookieStr;
  } catch (error: any) {
    const screenshot = await page.screenshot({ fullPage: true }).catch(() => null);
    if (screenshot) {
      await bot.telegram.sendPhoto(
        TELEGRAM_CHAT,
        { source: screenshot },
        { caption: `❌ Sniper Falló:\n${error.message}` },
      );
    }
    throw error;
  } finally {
    await browser.close();
  }
}

export function isSaturdayRequested(): boolean {
  return fs.existsSync(SATURDAY_FILE);
}

export function resetSaturdayFlag() {
  if (fs.existsSync(SATURDAY_FILE)) {
    fs.unlinkSync(SATURDAY_FILE);
    console.log("🗑️ Flag de sábado reseteado.");
  }
}

export function setSaturdayFlag() {
  fs.writeFileSync(SATURDAY_FILE, "true", "utf-8");
}
