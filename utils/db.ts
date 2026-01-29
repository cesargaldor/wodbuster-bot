import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const USER = process.env.WOD_USER;
const PASS = process.env.WOD_PASS;
const COOKIE_FILE = path.resolve("./cookie.txt");
const SATURDAY_FILE = path.resolve("./saturday_active.txt");

export function getSavedCookie() {
  try {
    console.log("🔍 Buscando cookie...");
    if (fs.existsSync(COOKIE_FILE)) {
      const cookie = fs.readFileSync(COOKIE_FILE, "utf-8");
      console.log("🍪 Cookie encontrada");
      return cookie.trim() || undefined;
    }
  } catch (error) {
    console.error("Error leyendo el archivo de cookie:", error);
  }
  console.log("❌ Cookie no encontrada.");
  return undefined;
}

export function saveCookie(cookie: string) {
  try {
    fs.writeFileSync(COOKIE_FILE, cookie, "utf-8");
    console.log("🍪 Cookie guardada localmente en archivo.");
  } catch (error) {
    console.error("Error guardando la cookie:", error);
  }
}

export async function loginAndSaveCookie() {
  console.log("🌐 Sesión expirada o faltante. Iniciando Playwright...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto("https://wodbuster.com/account/login.aspx?cb=nasara");
    await page.fill('input[id*="body_body_CtlLogin_IoEmail"]', USER!);
    await page.fill('input[id*="body_body_CtlLogin_IoPassword"]', PASS!);
    await page.click('input[id="body_body_CtlLogin_CtlAceptar"]');

    console.log("⏳ Esperando pantalla de confianza...");
    await page.waitForTimeout(2000);

    try {
      const labelSelector = 'label[for="body_body_CtlConfiar_CtlNoSeguroConfianza"]';

      if (await page.isVisible(labelSelector)) {
        console.log("🖱️ Haciendo clic en el label exacto...");
        await page.click(labelSelector);
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      console.log("⏩ No se encontró el label, saltando paso...");
    }

    await page.waitForURL("https://nasara.wodbuster.com/user/");
    const cookies = await context.cookies();
    const wbAuth = cookies.find((c) => c.name === ".WBAuth")?.value;
    const cookieStr = wbAuth ?? "";
    saveCookie(cookieStr);
    return cookieStr;
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
