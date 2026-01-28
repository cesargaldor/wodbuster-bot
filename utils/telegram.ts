import axios from "axios";

const TG_TOKEN = process.env.TELEGRAM_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT;

export async function notify(msg: string) {
  try {
    if (TG_TOKEN) {
      await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        chat_id: TG_CHAT,
        text: msg,
      });
    }
  } catch (error) {
    console.error("Error enviando Telegram", error);
  }
}
