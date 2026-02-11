import { Telegraf, Markup } from "telegraf";
import fs from "node:fs";
import { getDaysConfig, saveDaysConfig } from "./utils/db";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN as string);

// Aux Functions
const weekDays = [
  { id: 1, label: "Lun" },
  { id: 2, label: "Mar" },
  { id: 3, label: "Mié" },
  { id: 4, label: "Jue" },
  { id: 5, label: "Vie" },
  { id: 6, label: "Sáb" },
];

const generateButtons = (activeDays: number[]) => {
  const buttons = weekDays.map((day) => {
    const check = activeDays.includes(day.id) ? "✅" : "❌";
    return Markup.button.callback(`${check} ${day.label}`, `toggle_${day.id}`);
  });
  return Markup.inlineKeyboard(buttons, { columns: 3 });
};

// Commands
bot.command("dias", (ctx) => {
  const config = getDaysConfig();
  const activeDays = config.activeDays ?? [];

  ctx.reply("📅 Selecciona los días que quieres que el Sniper reserve:", generateButtons(activeDays));
});

// --- Buttons actions ---

bot.action(/toggle_(\d+)/, async (ctx) => {
  const dayId = parseInt(ctx.match[1]);
  let config = getDaysConfig();
  let activeDays = config.activeDays ?? [];

  if (activeDays.includes(dayId)) {
    activeDays = activeDays.filter((d: number) => d !== dayId);
  } else {
    activeDays.push(dayId);
  }

  saveDaysConfig(activeDays);
  await ctx.answerCbQuery();

  try {
    await ctx.editMessageReplyMarkup(generateButtons(activeDays).reply_markup);
  } catch (err) {
    // Ignore if the user clicks too fast and there are no changes
  }
});

// --- Cookie management ---
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
