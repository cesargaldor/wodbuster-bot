import { Telegraf } from "telegraf";
import fs from "node:fs";
import { setSaturdayFlag, isSaturdayRequested, resetSaturdayFlag } from "./utils/db";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN as string);

bot.command("hola", async (ctx) => {
  await ctx.reply("Hola! Soy el bot de control remoto.\n\n");
});

bot.command("sabado", async (ctx) => {
  setSaturdayFlag();
  await ctx.reply("🚀 ¡Entendido! El Sniper buscará clase el sábado a las 10:15.");
});

bot.command("status", async (ctx) => {
  const active = isSaturdayRequested();
  await ctx.reply(active ? "✅ El modo Sábado está ACTIVADO." : "😴 El modo Sábado está APAGADO.");
});

bot.command("sabado_off", async (ctx) => {
  resetSaturdayFlag();
  await ctx.reply("😴 El modo Sábado ha sido DESACTIVADO.");
});

bot.hears(/^cookie:(.+)/, (ctx) => {
  const newCookie = ctx.match[1].trim();

  try {
    fs.writeFileSync("./cookie.txt", newCookie, "utf-8");
    ctx.reply("✅ Cookie actualizada correctamente en el servidor.");
  } catch (err: any) {
    ctx.reply("❌ Error al guardar la cookie: " + err.message);
  }
});

bot.launch();
console.log("🤖 Bot de control remoto iniciado...");
