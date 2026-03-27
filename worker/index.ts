/// <reference types="@cloudflare/workers-types" />

/**
 * WodBuster Bot — Cloudflare Worker
 *
 * Bot de Telegram en modo Webhook usando fetch nativo (sin telegraf).
 * Lee y escribe en Cloudflare KV (binding: CROSSFIT_KV).
 *
 * Endpoints:
 *   POST /webhook  → recibe updates de Telegram
 *   GET  /         → health check
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface Env {
  CROSSFIT_KV: KVNamespace;
  TELEGRAM_TOKEN: string;
  TELEGRAM_CHAT: string;
}

interface TgUser {
  id: number;
  first_name: string;
}
interface TgChat {
  id: number;
  type: string;
}
interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
  reply_markup?: {
    inline_keyboard: { text: string; callback_data?: string }[][];
  };
}
interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}
interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const KV_DAYS = "days_config";
const KV_COOKIE = "session_cookie";

const weekDays = [
  { id: 1, label: "Lun" },
  { id: 2, label: "Mar" },
  { id: 3, label: "Mié" },
  { id: 4, label: "Jue" },
  { id: 5, label: "Vie" },
  { id: 6, label: "Sáb" },
];

// ─── Helpers de teclado ───────────────────────────────────────────────────────

function buildKeyboard(activeDays: number[]) {
  const buttons = weekDays.map((day) => [
    {
      text: `${activeDays.includes(day.id) ? "✅" : "❌"} ${day.label}`,
      callback_data: `toggle_${day.id}`,
    },
  ]);
  // Reagrupar en filas de 3
  const rows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < buttons.length; i += 3) {
    rows.push([...buttons[i], ...buttons[i + 1], ...buttons[i + 2]]);
  }
  return { inline_keyboard: rows };
}

// ─── Helpers de KV ───────────────────────────────────────────────────────────

async function getActiveDays(kv: KVNamespace): Promise<number[]> {
  const raw = await kv.get(KV_DAYS);
  if (!raw) return [];
  const config = JSON.parse(raw);
  return config.activeDays ?? [];
}

async function saveActiveDays(kv: KVNamespace, days: number[]): Promise<void> {
  await kv.put(KV_DAYS, JSON.stringify({ activeDays: days }));
}

// ─── Telegram API (fetch nativo) ─────────────────────────────────────────────

async function tgCall(token: string, method: string, body: object): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telegram API error (${method}): ${text}`);
  }
}

async function sendMessage(token: string, chatId: number, text: string, replyMarkup?: object): Promise<void> {
  await tgCall(token, "sendMessage", {
    chat_id: chatId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function editMessageReplyMarkup(token: string, chatId: number, messageId: number, replyMarkup: object): Promise<void> {
  await tgCall(token, "editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup,
  });
}

async function answerCallbackQuery(token: string, callbackQueryId: string): Promise<void> {
  await tgCall(token, "answerCallbackQuery", { callback_query_id: callbackQueryId });
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleMessage(msg: TgMessage, env: Env): Promise<void> {
  const chatId = msg.chat.id;
  const text = (msg.text ?? "").trim();

  // /dias — muestra el menú de días activos
  if (text === "/dias" || text.startsWith("/dias@")) {
    const activeDays = await getActiveDays(env.CROSSFIT_KV);
    await sendMessage(
      env.TELEGRAM_TOKEN,
      chatId,
      "📅 Selecciona los días que quieres que el Sniper reserve:",
      buildKeyboard(activeDays),
    );
    return;
  }

  // cookie:<valor> — guarda la nueva cookie en KV
  const cookieMatch = text.match(/^cookie:(.+)/i);
  if (cookieMatch) {
    const newCookie = cookieMatch[1].trim();
    try {
      await env.CROSSFIT_KV.put(KV_COOKIE, newCookie);
      await sendMessage(
        env.TELEGRAM_TOKEN,
        chatId,
        "✅ Cookie actualizada en Cloudflare KV.\n\nEl Watcher de las 17:00 confirmará si es válida.",
      );
    } catch (err: any) {
      await sendMessage(env.TELEGRAM_TOKEN, chatId, "❌ Error guardando la cookie: " + err.message);
    }
    return;
  }
}

async function handleCallbackQuery(cb: TgCallbackQuery, env: Env): Promise<void> {
  const data = cb.data ?? "";
  const match = data.match(/^toggle_(\d+)$/);
  if (!match || !cb.message) return;

  const dayId = parseInt(match[1]);

  let activeDays: number[] = [];

  if (cb.message.reply_markup?.inline_keyboard) {
    for (const row of cb.message.reply_markup.inline_keyboard) {
      for (const btn of row) {
        if (btn.text.includes("✅") && btn.callback_data) {
          const m = btn.callback_data.match(/^toggle_(\d+)$/);
          if (m) activeDays.push(parseInt(m[1]));
        }
      }
    }
  } else {
    activeDays = await getActiveDays(env.CROSSFIT_KV);
  }

  // Alternamos el estado del día pulsado
  if (activeDays.includes(dayId)) {
    activeDays = activeDays.filter((d) => d !== dayId);
  } else {
    activeDays.push(dayId);
    activeDays.sort((a, b) => a - b);
  }

  await saveActiveDays(env.CROSSFIT_KV, activeDays);
  await answerCallbackQuery(env.TELEGRAM_TOKEN, cb.id);

  try {
    await editMessageReplyMarkup(env.TELEGRAM_TOKEN, cb.message.chat.id, cb.message.message_id, buildKeyboard(activeDays));
  } catch {
    // Telegram devuelve error si el teclado no cambia — ignorar
  }
}

// ─── Worker entrypoint ───────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (request.method === "GET") {
      return new Response("WodBuster Bot activo ✅", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // Webhook de Telegram
    if (request.method === "POST" && url.pathname === "/webhook") {
      try {
        const textToParse = await request.text();
        console.log("📥 Recibido raw:", textToParse);

        let update: TgUpdate;
        try {
          update = JSON.parse(textToParse);
        } catch (e: any) {
          console.error("❌ Error parseando JSON:", e.message);
          return new Response("OK", { status: 200 });
        }

        console.log("✅ Update parseado:", JSON.stringify(update));

        if (update.message) {
          await handleMessage(update.message, env);
        } else if (update.callback_query) {
          await handleCallbackQuery(update.callback_query, env);
        }

        return new Response("OK", { status: 200 });
      } catch (err: any) {
        console.error("❌ Error grave procesando webhook:", err?.stack ?? String(err));
        return new Response("OK", { status: 200 });
      }
    }

    return new Response("Not found", { status: 404 });
  },
};
