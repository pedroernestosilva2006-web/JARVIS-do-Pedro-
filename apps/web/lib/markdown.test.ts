import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("escapa HTML (sem XSS)", () => {
    const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror="y">');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });
  it("renderiza wikilinks com alias", () => {
    const html = renderMarkdown("Ver [[Receita Previsível|o livro]]");
    expect(html).toContain('href="/notes/resolve?title=Receita%20Previs%C3%ADvel"');
    expect(html).toContain(">o livro</a>");
  });
  it("não deixa wikilink injetar HTML", () => {
    expect(renderMarkdown('[[<b onclick="x">]]')).not.toContain("<b ");
  });
  it("listas, títulos, citações e negrito", () => {
    const html = renderMarkdown("# Título\n\n- um\n- **dois**\n\n> citação");
    expect(html).toContain("<h1>Título</h1>");
    expect(html).toContain("<ul>\n<li>um</li>\n<li><strong>dois</strong></li>\n</ul>");
    expect(html).toContain("<blockquote>citação</blockquote>");
  });
  it("não aceita javascript: em links markdown", () => {
    expect(renderMarkdown("[x](javascript:alert(1))")).not.toContain("href=\"javascript");
  });
});
