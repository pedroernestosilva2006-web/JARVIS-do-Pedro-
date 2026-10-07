import { describe, expect, it } from "vitest";
import { analyzableKind, analyzeVerdict, fileExtension, fileTypeLabel, formatBytes, MAX_FILE_BYTES, safeStorageName } from "./rules";

describe("safeStorageName", () => {
  it("remove acentos, espaços e barras, mantendo a extensão", () => {
    expect(safeStorageName("Relatório Final (v2).PDF")).toBe("Relatorio-Final-v2.PDF");
    expect(safeStorageName("relatorio.final.v2.pdf")).toBe("relatorio-final-v2.pdf");
    expect(safeStorageName("../../etc/passwd")).not.toMatch(/\.\.|\//);
    expect(safeStorageName("áudio da palestra.m4a")).toBe("audio-da-palestra.m4a");
  });
  it("nunca devolve vazio e limita o tamanho", () => {
    expect(safeStorageName("???")).toBe("arquivo");
    expect(safeStorageName("a".repeat(300) + ".txt").length).toBeLessThanOrEqual(71);
  });
});

describe("analyzableKind", () => {
  it("reconhece pdf, imagem, áudio e texto por mime ou extensão", () => {
    expect(analyzableKind("x.pdf", "")).toBe("pdf");
    expect(analyzableKind("foto.jpg", "image/jpeg")).toBe("image");
    expect(analyzableKind("voz.m4a", "")).toBe("audio");
    expect(analyzableKind("anotacoes.md", "")).toBe("text");
    expect(analyzableKind("dados.csv", "text/csv")).toBe("text");
  });
  it("outros tipos só são guardados", () => {
    expect(analyzableKind("planilha.xlsx", "application/vnd.ms-excel")).toBeNull();
    expect(analyzableKind("logo.svg", "image/svg+xml")).toBeNull();
    expect(analyzableKind("pacote.zip", "application/zip")).toBeNull();
  });
});

describe("analyzeVerdict / formatos", () => {
  it("respeita os limites por tipo", () => {
    expect(analyzeVerdict("pdf", 1_000_000).ok).toBe(true);
    expect(analyzeVerdict("text", 500 * 1024).ok).toBe(false);
    expect(analyzeVerdict("audio", 30 * 1024 * 1024)).toMatchObject({ ok: false });
    expect(analyzeVerdict(null, 10)).toMatchObject({ ok: false });
  });
  it("formata tamanhos e rótulos", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(fileTypeLabel("a.xlsx", "")).toBe("XLSX");
    expect(fileExtension("sem-extensao")).toBe("");
    expect(MAX_FILE_BYTES).toBe(52428800);
  });
});
