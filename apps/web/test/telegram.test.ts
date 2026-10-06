import { describe, expect, it } from "vitest";
import { telegramToCapture } from "@/lib/capture/telegram";

const base = { update_id: 1, message: { message_id: 10, date: 1_790_000_000, chat: { id: 99, type: "private" }, from: { id: 7, first_name: "Pedro" } } };

describe("telegramToCapture", () => {
  it("texto vira captura de texto com chave de idempotência", () => {
    const c = telegramToCapture({ ...base, message: { ...base.message, text: "Cadência de 8 toques funciona" } })!;
    expect(c).toMatchObject({ channel: "telegram", kind: "text", externalUserId: "7", idempotencyKey: "tg:99:10" });
    expect(c.metadata.chat_id).toBe(99);
  });
  it("mensagem que é só um link vira captura de link", () => {
    const c = telegramToCapture({ ...base, message: { ...base.message, text: "https://exemplo.com/artigo" } })!;
    expect(c.kind).toBe("link");
    expect(c.url).toBe("https://exemplo.com/artigo");
  });
  it("texto longo com link continua texto", () => {
    const c = telegramToCapture({
      ...base,
      message: { ...base.message, text: "Achei muito bom esse artigo sobre cadência de outbound para SDRs https://x.com/a" },
    })!;
    expect(c.kind).toBe("text");
  });
  it("voz vira áudio OGG com file_id e duração", () => {
    const c = telegramToCapture({
      ...base,
      message: { ...base.message, voice: { file_id: "F1", file_unique_id: "U1", duration: 240, mime_type: "audio/ogg", file_size: 1000 } },
    })!;
    expect(c.kind).toBe("audio");
    expect(c.metadata).toMatchObject({ telegram_file_id: "F1", duration_seconds: 240, mime_type: "audio/ogg" });
  });
  it("foto escolhe a maior resolução e mantém a legenda", () => {
    const c = telegramToCapture({
      ...base,
      message: {
        ...base.message,
        caption: "slide da palestra",
        photo: [
          { file_id: "small", file_unique_id: "s", width: 90, height: 90, file_size: 1000 },
          { file_id: "big", file_unique_id: "b", width: 1280, height: 1280, file_size: 200_000 },
        ],
      },
    })!;
    expect(c.kind).toBe("image");
    expect(c.file?.ref).toBe("big");
    expect(c.text).toBe("slide da palestra");
  });
  it("PDF vira captura de pdf; outros documentos são ignorados", () => {
    const pdf = telegramToCapture({
      ...base,
      message: { ...base.message, document: { file_id: "D", file_unique_id: "d", mime_type: "application/pdf", file_name: "livro.pdf" } },
    })!;
    expect(pdf.kind).toBe("pdf");
    expect(
      telegramToCapture({
        ...base,
        message: { ...base.message, document: { file_id: "Z", file_unique_id: "z", mime_type: "application/zip" } },
      }),
    ).toBeNull();
  });
});
