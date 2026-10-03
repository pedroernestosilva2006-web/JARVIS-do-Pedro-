import { describe, expect, it } from "vitest";
import { htmlToText } from "@/lib/ingest/normalize";

describe("htmlToText", () => {
  it("extrai título e corpo do <article>, sem scripts e menus", () => {
    const html = `<html><head><title>Cadência &amp; Outbound</title><script>evil()</script></head>
      <body><nav>Menu</nav><article><h1>Título</h1><p>Primeiro parágrafo.</p><p>Segundo &quot;parágrafo&quot;.</p>
      <script>track()</script></article><footer>Rodapé</footer></body></html>`;
    const text = htmlToText(html);
    expect(text.startsWith("# Cadência & Outbound")).toBe(true);
    expect(text).toContain("Primeiro parágrafo.");
    expect(text).toContain('Segundo "parágrafo".');
    expect(text).not.toContain("evil");
    expect(text).not.toContain("track");
    expect(text).not.toContain("Menu");
    expect(text).not.toContain("Rodapé");
  });
});
