import "server-only";
import { sendTelegramMessage } from "./telegram";

/** Responde no canal de origem da captura. */
export async function notifyChannel(
  channel: string,
  metadata: Record<string, unknown>,
  text: string,
): Promise<void> {
  if (channel === "telegram" && metadata.chat_id != null) {
    await sendTelegramMessage(metadata.chat_id as number, text);
  }
  // whatsapp/email: adicionar adaptadores aqui (Fase 5)
}
