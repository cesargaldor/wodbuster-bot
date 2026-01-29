import { Telegraf } from "telegraf";
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

bot.launch();
console.log("🤖 Bot de control remoto iniciado...");
