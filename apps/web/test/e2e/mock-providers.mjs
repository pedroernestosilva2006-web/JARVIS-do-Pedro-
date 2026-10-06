// Servidor mock para e2e: imita a Bot API do Telegram, a Messages API da Anthropic e
// os embeddings da OpenAI. Nada sai da máquina e nenhum token é gasto.
import http from "node:http";

export const telegramSent = [];
export const anthropicCalls = [];

const EXTRACTION = {
  capture_type: "evento",
  summary: "Palestra do Aaron Ross sobre cadência de outbound.",
  context: { event_name: null, book_title: null, book_author: null, date: null },
  entities: [
    { name: "Aaron Ross", type: "pessoa", role: "palestrante" },
    { name: "Receita Previsível", type: "livro", role: null },
  ],
  insights: [
    {
      title: "Cadência de oito toques supera três toques no outbound B2B",
      body_md: "A maioria das respostas em outbound vem depois do quarto toque. Cadências curtas desperdiçam leads.",
      evidence_excerpt: "a maioria das respostas em outbound vem depois do quarto toque",
      related_entities: ["Aaron Ross"],
      applies_to: "Ajustar a cadência do SDR de IA para oito toques.",
    },
    {
      title: "Separar SDR e closer cria métricas claras por etapa da cadência",
      body_md: "Especializar funções dá previsibilidade porque cada etapa da cadência ganha uma métrica.",
      evidence_excerpt: "separar SDR de closer não é só organograma",
      related_entities: ["Receita Previsível"],
      applies_to: null,
    },
  ],
  quotes: [],
  ideas: [],
  action_items: ["Revisar a cadência do SDR de IA"],
};

function bagOfWordsVector(text, dims = 1536) {
  const v = new Array(dims).fill(0);
  const words = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);
  for (const w of words) {
    let h = 2166136261;
    for (const c of w) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    v[Math.abs(h) % dims] += 1;
  }
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((x) => x / norm);
}

function sse(res, events) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  for (const e of events) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  res.end();
}

function anthropicMessage(text, model) {
  return {
    id: `msg_${Date.now()}`,
    type: "message",
    role: "assistant",
    model,
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  };
}

function streamChat(res, body) {
  const hasToolResult = body.messages.some(
    (m) => Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result"),
  );
  const start = {
    type: "message_start",
    message: { id: "msg_chat", type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 50, output_tokens: 1 } },
  };
  if (!hasToolResult) {
    return sse(res, [
      start,
      { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_e2e", name: "search_knowledge", input: {} } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ query: "cadência outbound" }) } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 20 } },
      { type: "message_stop" },
    ]);
  }
  const toolResult = body.messages.at(-1).content.find((b) => b.type === "tool_result");
  const found = JSON.parse(toolResult.content).results?.[0]?.title ?? "nada";
  const text = `Na sua base: [[${found}]]. Quer que eu monte um script de cadência?`;
  return sse(res, [
    start,
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(0, 20) } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(20) } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 30 } },
    { type: "message_stop" },
  ]);
}

export function startMockServer(port = 4010) {
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const url = new URL(req.url, "http://x");

    // Telegram Bot API
    const tg = url.pathname.match(/^\/bot[^/]+\/(\w+)$/);
    if (tg) {
      if (tg[1] === "sendMessage") telegramSent.push(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, result: { message_id: 1 } }));
    }

    // Anthropic Messages API
    if (url.pathname.startsWith("/v1/messages")) {
      const system = (Array.isArray(body.system) ? body.system.map((b) => b.text).join("\n") : body.system) ?? "";
      anthropicCalls.push({ model: body.model, stream: !!body.stream, system: system.slice(0, 60), tools: body.tools?.length ?? 0 });
      if (body.stream) return streamChat(res, body);
      res.writeHead(200, { "Content-Type": "application/json" });
      if (system.includes("módulo de ingestão")) return res.end(JSON.stringify(anthropicMessage(JSON.stringify(EXTRACTION), body.model)));
      if (system.includes("Você decide se duas notas")) {
        return res.end(JSON.stringify(anthropicMessage(JSON.stringify({ relation: "apoia", confidence: 0.9, rationale: "Ambas tratam de cadência de outbound." }), body.model)));
      }
      if (system.includes("brief do JARVIS")) {
        return res.end(JSON.stringify(anthropicMessage("📚 Brief de teste: você aprendeu sobre cadência.", body.model)));
      }
      if (system.includes("memória episódica")) {
        return res.end(JSON.stringify(anthropicMessage("Pedro perguntou sobre cadência de outbound.", body.model)));
      }
      return res.end(JSON.stringify(anthropicMessage("ok", body.model)));
    }

    // OpenAI embeddings
    if (url.pathname === "/v1/embeddings") {
      const inputs = Array.isArray(body.input) ? body.input : [body.input];
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          object: "list",
          model: body.model,
          data: inputs.map((t, index) => ({ object: "embedding", index, embedding: bagOfWordsVector(t) })),
          usage: { prompt_tokens: 10 * inputs.length, total_tokens: 10 * inputs.length },
        }),
      );
    }

    res.writeHead(404);
    res.end("not mocked: " + url.pathname);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
