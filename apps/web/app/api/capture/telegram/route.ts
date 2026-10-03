import { after } from "next/server";
import { handleTelegramUpdate } from "@/lib/capture/telegram-bot";
import type { TelegramUpdate } from "@/lib/capture/telegram";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/security";
import { drainQueues } from "@/lib/workers/drain";

export const maxDuration = 300;

/**
 * Webhook do Telegram. Configure com:
 *   curl "https://api.telegram.org/bot$TOKEN/setWebhook" \
 *     -d url=https://<app>/api/capture/telegram -d secret_token=$TELEGRAM_WEBHOOK_SECRET
 */
export async function POST(req: Request) {
  if (!safeEqual(req.headers.get("x-telegram-bot-api-secret-token"), env.telegramWebhookSecret())) {
    return new Response("unauthorized", { status: 401 });
  }
  const update = (await req.json()) as TelegramUpdate;
  try {
    const outcome = await handleTelegramUpdate(update, (task) => after(task));
    // Processa já, sem esperar o próximo minuto do pg_cron
    if (outcome.kind === "captured") after(() => drainQueues({ captures: 1, embeddings: 0 }).then(() => undefined));
  } catch (err) {
    console.error("telegram webhook", err);
  }
  // Sempre 200: o Telegram reenvia updates que falharem (a idempotência cobre o resto)
  return Response.json({ ok: true });
}
