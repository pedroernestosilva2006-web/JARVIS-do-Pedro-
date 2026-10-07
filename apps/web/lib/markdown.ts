import { parseWikilinks } from "@jarvis/core";

/**
 * Renderizador de markdown mínimo e seguro (escapa todo HTML) com suporte a [[wikilinks]].
 * Cobre o que as notas usam: títulos, listas, citações, negrito/itálico, código, links.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function inline(text: string, cite = false): string {
  // Wikilinks primeiro (com placeholders para não serem escapados/reformatados)
  const links: string[] = [];
  let out = "";
  let last = 0;
  for (const l of parseWikilinks(text)) {
    out += text.slice(last, l.start);
    const label = l.alias ?? l.target;
    // No chat, a citação vira um chip que foca o nó no grafo (o clique é tratado no cliente)
    links.push(
      cite
        ? `<button type="button" class="cite" data-cite="${escapeHtml(l.target)}">${escapeHtml(label)}</button>`
        : `<a class="wikilink" href="/notes/resolve?title=${encodeURIComponent(l.target)}">${escapeHtml(label)}</a>`,
    );
    out += `\u0000${links.length - 1}\u0000`;
    last = l.end;
  }
  out += text.slice(last);

  let html = escapeHtml(out)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a class="external" href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a class="external" href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  html = html.replace(/\u0000(\d+)\u0000/g, (_, i) => links[Number(i)]!);
  return html;
}

export function renderMarkdown(md: string, opts: { cite?: boolean } = {}): string {
  const cite = opts.cite ?? false;
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];
  let quote: string[] = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map((t) => inline(t, cite)).join("<br/>")}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote>${quote.map((t) => inline(t, cite)).join("<br/>")}</blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if (!line.trim()) {
      flushAll();
    } else if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      flushAll();
      out.push(`<h${m[1]!.length}>${inline(m[2]!, cite)}</h${m[1]!.length}>`);
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara();
      flushList();
      quote.push(m[1]!);
    } else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
      flushPara();
      flushQuote();
      if (list !== "ul") {
        flushList();
        out.push("<ul>");
        list = "ul";
      }
      out.push(`<li>${inline(m[1]!, cite)}</li>`);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      flushQuote();
      if (list !== "ol") {
        flushList();
        out.push("<ol>");
        list = "ol";
      }
      out.push(`<li>${inline(m[1]!, cite)}</li>`);
    } else {
      flushList();
      flushQuote();
      para.push(line);
    }
  }
  flushAll();
  return out.join("\n");
}
