import { Telegraf } from "telegraf";

const TG_TOKEN = process.env.TELEGRAM_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT;
const bot = new Telegraf(TG_TOKEN as string);

export async function notify(msg: string) {
  try {
    if (TG_TOKEN) {
      bot.telegram.sendMessage(TG_CHAT as string, msg);
    }
  } catch (error) {
    console.error("Error enviando Telegram", error);
  }
}
