// E2E do JARVIS contra um Supabase local (supabase start) + mocks de Telegram/Anthropic/OpenAI.
//
//   supabase start && supabase db reset
//   pnpm --filter web build   (com as NEXT_PUBLIC_* do Supabase local)
//   node apps/web/test/e2e/run.mjs
//
// Cobre: pareamento do Telegram, /evento, captura → pgmq → pipeline → notas/links → resposta
// no canal, embeddings + links semânticos, chat com tools (streaming), grafo, MCP e isolamento.
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { unzipSync, strFromU8 } from "fflate";
import { startMockServer, telegramSent, anthropicCalls } from "./mock-providers.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!PUBLISHABLE || !SECRET) throw new Error("Defina SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY (veja `supabase status`)");

const APP = "http://127.0.0.1:3100";
const MOCK = "http://127.0.0.1:4010";
const WEBHOOK_SECRET = "e2e-webhook-secret";
const CRON_SECRET = "e2e-cron-secret";
const admin = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } });

const results = [];
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✅ ${name} (${Date.now() - t} ms)`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`❌ ${name}\n   ${err.stack ?? err}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, { timeout = 30_000, every = 500 } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("timeout aguardando condição");
    await sleep(every);
  }
}

/** Faz login com senha usando @supabase/ssr e devolve o header Cookie que o app espera. */
async function sessionCookie(email, password) {
  const jar = new Map();
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value)) },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), client };
}

async function telegram(update) {
  const res = await fetch(`${APP}/api/capture/telegram`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
    body: JSON.stringify(update),
  });
  assert.equal(res.status, 200);
}
// IDs aleatórios por execução: o teste não depende do estado deixado por rodadas anteriores
const TG_USER = 100000 + Math.floor(Math.random() * 900000);
let msgId = Math.floor(Math.random() * 1e6);
const tgMessage = (text, userId = TG_USER) => ({
  update_id: msgId,
  message: { message_id: msgId++, date: Math.floor(Date.now() / 1000), chat: { id: userId, type: "private" }, from: { id: userId, first_name: "Pedro" }, text },
});

async function main() {
  const mock = await startMockServer(4010);
  const webDir = path.resolve(import.meta.dirname, "../..");
  const app = spawn(path.join(webDir, "node_modules/.bin/next"), ["start", "-p", "3100"], {
    cwd: webDir,
    detached: true, // grupo de processos próprio: derrubamos o next-server junto no final
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
      SUPABASE_SECRET_KEY: SECRET,
      NEXT_PUBLIC_APP_URL: APP,
      TELEGRAM_BOT_TOKEN: "123:e2e",
      TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
      TELEGRAM_API_BASE: MOCK,
      CRON_SECRET,
      JARVIS_REQUIRE_LOGIN: "1", // este e2e cobre o modo com login; o modo interno está em open-access.mjs
      ANTHROPIC_API_KEY: "sk-ant-e2e",
      ANTHROPIC_BASE_URL: MOCK,
      OPENAI_API_KEY: "sk-e2e",
      OPENAI_BASE_URL: `${MOCK}/v1`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let appLog = "";
  app.stdout.on("data", (d) => (appLog += d));
  app.stderr.on("data", (d) => (appLog += d));
  await waitFor(() => fetch(`${APP}/login`).then((r) => r.ok).catch(() => false), { timeout: 60_000 });

  const email = `pedro+${randomUUID().slice(0, 8)}@e2e.dev`;
  const password = "senha-forte-e2e-123";
  let cookie, userClient, workspaceId, insightId;

  await step("cria usuário e workspace (bootstrap_workspace)", async () => {
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    ({ cookie, client: userClient } = await sessionCookie(email, password));
    const { data, error: e2 } = await userClient.rpc("bootstrap_workspace", { p_name: "Cérebro E2E" });
    if (e2) throw e2;
    workspaceId = data;
    const again = await userClient.rpc("bootstrap_workspace", {});
    assert.equal(again.data, workspaceId, "bootstrap deve ser idempotente");
  });

  await step("páginas protegidas: sem sessão → /login; com sessão → 200", async () => {
    const anon = await fetch(`${APP}/graph`, { redirect: "manual" });
    assert.equal(anon.status, 307);
    assert.match(anon.headers.get("location"), /\/login$/);
    for (const p of ["/graph", "/notes", "/files", "/chat", "/timeline", "/settings"]) {
      const r = await fetch(`${APP}${p}`, { headers: { cookie } });
      assert.equal(r.status, 200, `${p} → ${r.status}`);
    }
  });

  await step("webhook do Telegram rejeita secret inválido", async () => {
    const r = await fetch(`${APP}/api/capture/telegram`, { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "errado" }, body: "{}" });
    assert.equal(r.status, 401);
  });

  await step("pareamento do Telegram com /conectar CODIGO", async () => {
    await telegram(tgMessage("oi"));
    assert.match(telegramSent.at(-1).text, /\/conectar/);
    const code = "E2E" + randomUUID().slice(0, 8).toUpperCase();
    const { error } = await userClient.from("channel_link_codes").insert({ code, workspace_id: workspaceId });
    if (error) throw error;
    await telegram(tgMessage(`/conectar ${code}`));
    assert.match(telegramSent.at(-1).text, /Conectado/);
    const { data } = await admin.from("channel_identities").select("workspace_id").eq("external_user_id", String(TG_USER)).single();
    assert.equal(data.workspace_id, workspaceId);
  });

  await step("/evento cria o evento e o contexto de sessão", async () => {
    await telegram(tgMessage("/evento RD Summit 2026"));
    assert.match(telegramSent.at(-1).text, /Criei o evento "RD Summit 2026"/);
    const { data } = await admin.from("capture_sessions").select("context_note_id").eq("workspace_id", workspaceId);
    assert.equal(data.length, 1);
  });

  await step("captura de texto → pgmq → pipeline → notas atômicas + links + resposta no canal", async () => {
    const before = telegramSent.length;
    await telegram(tgMessage("Saindo da palestra do Aaron Ross: a maioria das respostas em outbound vem depois do quarto toque, e separar SDR de closer não é só organograma."));
    const reply = await waitFor(() => telegramSent.slice(before).find((m) => /Registrei/.test(m.text)), { timeout: 30_000 });
    const { data: notes } = await admin.from("notes").select("id, type, title, stage, created_by").eq("workspace_id", workspaceId);
    const insights = notes.filter((n) => n.type === "insight");
    insightId = insights.find((n) => n.title.startsWith("Cadência"))?.id;
    assert.match(reply.text, /Registrei em "RD Summit 2026": 2 insights, 1 pessoa, 1 tarefa, 1 livro\./);
    assert.equal(insights.length, 2);
    assert.ok(insights.every((n) => n.stage === "semente" && n.created_by === "ai"), "notas da IA nascem semente");
    assert.ok(notes.some((n) => n.type === "pessoa" && n.title === "Aaron Ross"));
    assert.ok(notes.some((n) => n.type === "tarefa"));
    const { data: links } = await admin.from("links").select("relation, origin, status").eq("workspace_id", workspaceId);
    const rels = links.map((l) => l.relation);
    assert.ok(rels.includes("aprendido_em") && rels.includes("palestrante_em") && rels.includes("menciona"), rels.join(","));
    const { data: prov } = await admin.from("note_sources").select("excerpt").eq("workspace_id", workspaceId).not("excerpt", "is", null);
    assert.ok(prov.some((p) => p.excerpt.includes("quarto toque")), "proveniência com trecho literal");
    const { data: src } = await admin.from("sources").select("status, normalized_text").eq("workspace_id", workspaceId).eq("kind", "text").single();
    assert.equal(src.status, "done");
  });

  await step("reenvio do mesmo update é idempotente", async () => {
    const dup = tgMessage("mensagem duplicada");
    await telegram(dup);
    await telegram(dup);
    const { count } = await admin.from("sources").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("raw_text", "mensagem duplicada");
    assert.equal(count, 1);
  });

  await step("worker (cron) gera embeddings e sugere links semânticos com relação tipada", async () => {
    const unauthorized = await fetch(`${APP}/api/workers/drain`, { method: "POST" });
    assert.equal(unauthorized.status, 401);
    await waitFor(async () => {
      const r = await fetch(`${APP}/api/workers/drain`, { method: "POST", headers: { Authorization: `Bearer ${CRON_SECRET}` } });
      assert.equal(r.status, 200);
      const { count } = await admin.from("notes").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).is("embedding", null);
      return count === 0;
    });
    const { data: sem } = await admin.from("links").select("relation, rationale, status").eq("workspace_id", workspaceId).eq("origin", "ai_semantic");
    assert.ok(sem.length > 0, "deveria haver links semânticos");
    assert.ok(sem.every((l) => l.rationale), "links semânticos trazem rationale");
    const { count: usage } = await admin.from("ai_usage").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
    assert.ok(usage >= 3, "uso de IA registrado por workspace");
  });


  await step("fonte longa vira chunks com embedding (RAG)", async () => {
    const before = telegramSent.length;
    const paragraph = "Neste capítulo o autor explica como a cadência de prospecção deve combinar e-mail, telefone e LinkedIn. ";
    const long = Array.from({ length: 110 }, (_, i) => `Seção ${i}. ${paragraph}`).join("\n\n");
    await telegram(tgMessage(long));
    await waitFor(() => telegramSent.slice(before).find((m) => /Registrei/.test(m.text)), { timeout: 30_000 });
    // (filtrar por raw_text inteiro estoura a URL do PostgREST, e captured_at tem resolução de 1 s no Telegram:
    // usamos só o começo do texto, que é único)
    const { data: src } = await admin
      .from("sources")
      .select("id, raw_text")
      .eq("workspace_id", workspaceId)
      .like("raw_text", "Seção 0.%")
      .single();
    assert.equal(src.raw_text, long);
    const { data: chunks } = await admin.from("chunks").select("ordinal, embedding").eq("source_id", src.id).order("ordinal");
    assert.ok(chunks.length >= 5, `chunks: ${chunks.length}`);
    assert.ok(chunks.every((c) => c.embedding), "todo chunk tem embedding");
  });

  await step("/brief no Telegram e worker de brief (cron)", async () => {
    const before = telegramSent.length;
    await telegram(tgMessage("/brief"));
    const reply = await waitFor(() => telegramSent.slice(before).find((m) => /Brief de teste/.test(m.text)));
    assert.match(reply.text, /\/inbox$/);
    assert.equal((await fetch(`${APP}/api/workers/brief?periodo=dia`, { method: "POST" })).status, 401);
    const r = await fetch(`${APP}/api/workers/brief?periodo=semana`, { method: "POST", headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    const report = await r.json();
    assert.equal(report[workspaceId], "enviado");
  });

  await step("API do grafo devolve snapshot e salva posições", async () => {
    const r = await fetch(`${APP}/api/graph`, { headers: { cookie } });
    const snap = await r.json();
    assert.ok(snap.nodes.length >= 5 && snap.edges.length >= 4, `${snap.nodes.length} nós / ${snap.edges.length} arestas`);
    const save = await fetch(`${APP}/api/graph`, {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify(snap.nodes.map((n, i) => ({ id: n.id, x: i, y: i * 2 }))),
    });
    assert.equal(save.status, 200);
  });

  await step("painel da nota traz conexões e proveniência; /notes/:id e /inbox redirecionam", async () => {
    const detail = await (await fetch(`${APP}/api/notes/${insightId}`, { headers: { cookie } })).json();
    assert.ok(detail.note.title.includes("Cadência de oito toques"), "título");
    assert.ok(detail.excerpts.some((x) => x.includes("quarto toque")), "trecho da fonte");
    assert.ok(detail.links.some((l) => l.other?.title === "RD Summit 2026"), "link para o evento");
    const old = await fetch(`${APP}/notes/${insightId}`, { headers: { cookie }, redirect: "manual" });
    assert.equal(old.status, 307);
    assert.match(old.headers.get("location"), new RegExp(`/notes\\?sel=${insightId}$`));
    const inbox = await fetch(`${APP}/inbox`, { headers: { cookie }, redirect: "manual" });
    assert.match(inbox.headers.get("location"), /\/graph\?review=1$/);
    const review = await (await fetch(`${APP}/api/review`, { headers: { cookie } })).json();
    assert.ok(Array.isArray(review.seeds) && review.seeds.length > 0, "fila de revisão tem sementes");
    const count = await (await fetch(`${APP}/api/review?count=1`, { headers: { cookie } })).json();
    assert.ok(count.count >= review.seeds.length);
  });

  await step("chat com o Jarvis: streaming + tool search_knowledge + persistência", async () => {
    const r = await fetch(`${APP}/api/chat`, {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ message: "O que aprendi sobre cadência?" }),
    });
    const events = (await r.text()).trim().split("\n").map((l) => JSON.parse(l));
    assert.ok(events.some((e) => e.type === "tool" && e.name === "search_knowledge"));
    const text = events.filter((e) => e.type === "text").map((e) => e.text).join("");
    assert.match(text, /Na sua base: \[\[.+\]\]/);
    assert.ok(!events.some((e) => e.type === "error"), JSON.stringify(events.filter((e) => e.type === "error")));
    const conversationId = events.find((e) => e.type === "meta").conversationId;
    const { data: msgs } = await admin.from("messages").select("role").eq("conversation_id", conversationId).order("created_at");
    assert.deepEqual(msgs.map((m) => m.role), ["user", "assistant", "user", "assistant"]);
    const chatCall = anthropicCalls.find((c) => c.stream);
    assert.equal(chatCall.tools, 11);
  });

  await step("memória episódica: conversa resumida com embedding após o chat", async () => {
    const { data } = await waitFor(async () => {
      const r = await admin.from("conversations").select("summary, embedding").eq("workspace_id", workspaceId).not("summary", "is", null);
      return r.data?.length ? r : null;
    });
    assert.match(data[0].summary, /cadência/);
    assert.ok(data[0].embedding);
  });

  await step("exportação: zip no formato do Obsidian", async () => {
    const r = await fetch(`${APP}/api/export`, { headers: { cookie } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "application/zip");
    const files = unzipSync(new Uint8Array(await r.arrayBuffer()));
    const names = Object.keys(files);
    assert.ok(names.includes("LEIA-ME.md"));
    const insight = names.find((n) => n.startsWith("Insights/Cadência de oito toques"));
    assert.ok(insight, names.join(", "));
    const md = strFromU8(files[insight]);
    assert.match(md, /^---\njarvis_id: /);
    assert.match(md, /aprendido_em:: \[\[RD Summit 2026\]\]/);
    assert.ok(names.includes("Eventos/RD Summit 2026.md"));
    assert.equal((await fetch(`${APP}/api/export`)).status, 401);
  });

  await step("autocomplete de [[ busca títulos (só do próprio workspace)", async () => {
    const r = await fetch(`${APP}/api/notes/titles?q=cad`, { headers: { cookie } });
    const titles = (await r.json()).map((n) => n.title);
    assert.ok(titles.some((t) => t.startsWith("Cadência de oito toques")), titles.join(", "));
  });

  await step("servidor MCP: token, tools/list, tools/call e token inválido", async () => {
    const token = "jv_e2e_" + randomUUID();
    await userClient.from("api_tokens").insert({ workspace_id: workspaceId, name: "e2e", token_hash: createHash("sha256").update(token).digest("hex") });
    const rpc = (body, t = token) =>
      fetch(`${APP}/api/mcp`, { method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "jv_errado")).status, 401);
    const init = await (await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })).json();
    assert.equal(init.result.serverInfo.name, "jarvis-segundo-cerebro");
    const list = await (await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
    assert.equal(list.result.tools.length, 11);
    const call = await (await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search_knowledge", arguments: { query: "cadência" } } })).json();
    assert.equal(call.result.isError, false, call.result.content[0].text);
    assert.match(call.result.content[0].text, /Cadência de oito toques/);
  });

  await step("isolamento: outro usuário não vê nada do workspace do Pedro", async () => {
    const other = `intruso+${randomUUID().slice(0, 8)}@e2e.dev`;
    await admin.auth.admin.createUser({ email: other, password, email_confirm: true });
    const { cookie: c2, client } = await sessionCookie(other, password);
    await client.rpc("bootstrap_workspace", {});
    const { data } = await client.from("notes").select("id").eq("workspace_id", workspaceId);
    assert.equal(data.length, 0);
    const snap = await (await fetch(`${APP}/api/graph`, { headers: { cookie: c2 } })).json();
    assert.equal(snap.nodes.length, 0);
    const page = await fetch(`${APP}/api/notes/${insightId}`, { headers: { cookie: c2 } });
    assert.equal(page.status, 404);
    const titles = await (await fetch(`${APP}/api/notes/titles?q=cad`, { headers: { cookie: c2 } })).json();
    assert.equal(titles.length, 0, "autocomplete não pode vazar títulos");
    const files = unzipSync(new Uint8Array(await (await fetch(`${APP}/api/export`, { headers: { cookie: c2 } })).arrayBuffer()));
    assert.deepEqual(Object.keys(files), ["LEIA-ME.md"], "exportação não pode vazar notas");
  });

  try {
    process.kill(-app.pid, "SIGKILL");
  } catch {
    app.kill("SIGKILL");
  }
  mock.closeAllConnections();
  mock.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passos OK`);
  if (failed.length) {
    console.log("\n--- log do app ---\n" + appLog.slice(-4000));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
