import "server-only";
import { parseCommand, type CaptureCommand } from "@jarvis/core";
import { createNote, findNoteByTitle } from "@/lib/ingest/notes-repo";
import { runJarvis } from "@/lib/jarvis/agent";
import { createAdminClient } from "@/lib/supabase/admin";
import { activeSessionContext, saveCapture } from "./store";
import {
  TELEGRAM_MAX_DOWNLOAD_BYTES,
  sendTelegramMessage,
  sendTelegramTyping,
  telegramToCapture,
  type TelegramUpdate,
} from "./telegram";

const HELP = `Sou o JARVIS, sua linha direta com o segundo cérebro.

Mande texto, áudio, foto (slide, página de livro), link ou PDF — eu transformo em notas conectadas.

Comandos:
/evento <nome> — tudo que você mandar nas próximas 6h fica ligado ao evento
/livro <título> — idem, para um livro que você está lendo
/fim — encerra o contexto atual
/p <pergunta> — pergunte algo à sua base
/ajuda — esta mensagem`;

export type BotOutcome = { kind: "captured"; sourceId: string } | { kind: "handled" } | { kind: "ignored" };

/** Processa um update do Telegram. Retorna se houve captura (para disparar o worker). */
export async function handleTelegramUpdate(
  update: TelegramUpdate,
  schedule: (task: () => Promise<void>) => void,
): Promise<BotOutcome> {
  const msg = update.message;
  if (!msg?.from) return { kind: "ignored" };
  const db = createAdminClient();
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);
  const command = parseCommand(msg.text);

  const { data: identity } = await db
    .from("channel_identities")
    .select("workspace_id")
    .eq("channel", "telegram")
    .eq("external_user_id", userId)
    .maybeSingle();

  // --- Pareamento: /conectar CODIGO (ou deep link /start CODIGO) ---------------------
  if (!identity) {
    if ((command?.command === "conectar" || command?.command === "start") && command.arg) {
      const ok = await pairTelegram(command.arg, userId, String(chatId), msg.from.username ?? msg.from.first_name ?? null);
      await sendTelegramMessage(
        chatId,
        ok ? `Conectado! ✅\n\n${HELP}` : "Código inválido ou expirado. Gere outro em Configurações.",
      );
      return { kind: "handled" };
    }
    await sendTelegramMessage(
      chatId,
      "Olá! Para usar o JARVIS, gere um código em Configurações → Telegram e envie aqui: /conectar SEUCODIGO",
    );
    return { kind: "handled" };
  }
  const workspaceId = identity.workspace_id as string;

  if (command) {
    await handleCommand(command, { workspaceId, chatId, userId, schedule });
    return { kind: "handled" };
  }

  // --- Captura -----------------------------------------------------------------------
  const capture = telegramToCapture(update);
  if (!capture) {
    await sendTelegramMessage(chatId, "Ainda não sei processar esse tipo de mensagem. Mande texto, áudio, foto, link ou PDF.");
    return { kind: "handled" };
  }
  if ((capture.file?.sizeBytes ?? 0) > TELEGRAM_MAX_DOWNLOAD_BYTES) {
    await sendTelegramMessage(chatId, "Arquivo acima de 20 MB (limite da Bot API do Telegram). Envie em partes menores.");
    return { kind: "handled" };
  }
  const contextNoteId = await activeSessionContext(workspaceId, "telegram", userId);
  const { sourceId, duplicate } = await saveCapture(workspaceId, capture, contextNoteId);
  if (duplicate || !sourceId) return { kind: "ignored" };
  await sendTelegramTyping(chatId);
  return { kind: "captured", sourceId };
}

async function pairTelegram(code: string, userId: string, chatId: string, displayName: string | null) {
  const db = createAdminClient();
  const { data: link } = await db
    .from("channel_link_codes")
    .select("workspace_id, expires_at")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();
  if (!link || new Date(link.expires_at) < new Date()) return false;
  const { error } = await db.from("channel_identities").insert({
    workspace_id: link.workspace_id,
    channel: "telegram",
    external_user_id: userId,
    external_chat_id: chatId,
    display_name: displayName,
  });
  await db.from("channel_link_codes").delete().eq("code", code.trim().toUpperCase());
  return !error;
}

async function handleCommand(
  command: CaptureCommand,
  ctx: { workspaceId: string; chatId: number; userId: string; schedule: (task: () => Promise<void>) => void },
) {
  const db = createAdminClient();
  const { workspaceId, chatId, userId } = ctx;
  switch (command.command) {
    case "ajuda":
    case "start":
    case "conectar":
      await sendTelegramMessage(chatId, HELP);
      return;
    case "evento":
    case "livro": {
      if (!command.arg) {
        await sendTelegramMessage(chatId, `Use: /${command.command} <nome>`);
        return;
      }
      const type = command.command;
      const existing = await findNoteByTitle(db, workspaceId, command.arg);
      const noteId =
        existing && existing.type === type
          ? existing.id
          : (
              await createNote(db, workspaceId, {
                type,
                title: command.arg,
                properties: type === "evento" ? { data: new Date().toISOString().slice(0, 10) } : { status_leitura: "lendo" },
                created_by: "user",
              })
            ).id;
      await db.from("capture_sessions").insert({
        workspace_id: workspaceId,
        channel: "telegram",
        external_user_id: userId,
        context_note_id: noteId,
      });
      await sendTelegramMessage(
        chatId,
        `${existing ? "Retomando" : "Criei"} ${type === "evento" ? "o evento" : "o livro"} "${command.arg}". Tudo que você mandar nas próximas 6h fica ligado a ele. /fim para encerrar.`,
      );
      return;
    }
    case "fim": {
      await db
        .from("capture_sessions")
        .update({ expires_at: new Date().toISOString() })
        .eq("workspace_id", workspaceId)
        .eq("channel", "telegram")
        .eq("external_user_id", userId)
        .gt("expires_at", new Date().toISOString());
      await sendTelegramMessage(chatId, "Contexto encerrado. As próximas capturas ficam soltas (a IA tenta deduzir o contexto).");
      return;
    }
    case "pergunta": {
      if (!command.arg) {
        await sendTelegramMessage(chatId, "Use: /p <sua pergunta>");
        return;
      }
      await sendTelegramTyping(chatId);
      ctx.schedule(async () => {
        try {
          const { finalText } = await runJarvis({ db, workspaceId }, [{ role: "user", content: command.arg }]);
          await sendTelegramMessage(chatId, finalText || "Não encontrei uma resposta.");
        } catch (err) {
          await sendTelegramMessage(chatId, `Erro ao consultar o Jarvis: ${err instanceof Error ? err.message : err}`);
        }
      });
      return;
    }
  }
}
