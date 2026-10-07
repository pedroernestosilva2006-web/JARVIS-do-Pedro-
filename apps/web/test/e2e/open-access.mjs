// E2E do MODO INTERNO (sem login) usando o AI Gateway e SEM OPENAI_API_KEY:
//   - páginas e APIs abrem sem sessão, como o dono; /login redireciona para o app;
//   - com JARVIS_REQUIRE_LOGIN=1 o bloqueio volta (testado em run.mjs);
//   - a IA funciona só com AI_GATEWAY_API_KEY (sem ANTHROPIC_API_KEY);
//   - sem OPENAI_API_KEY: captura processa, busca por palavra-chave funciona, embeddings ficam pendentes.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { startMockServer, anthropicCalls } from "./mock-providers.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!PUBLISHABLE || !SECRET) throw new Error("Defina SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY");
const APP = "http://127.0.0.1:3101";
const MOCK = "http://127.0.0.1:4011";
const admin = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } });
const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(true);
    console.log(`✅ ${name}`);
  } catch (err) {
    results.push(false);
    console.log(`❌ ${name}\n   ${err.stack ?? err}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout = 30_000) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("timeout");
    await sleep(400);
  }
}

const mock = await startMockServer(4011);
const webDir = path.resolve(import.meta.dirname, "../..");
const email = `dono+${randomUUID().slice(0, 8)}@interno.dev`;
// o dono precisa ser o usuário MAIS ANTIGO: fixamos por JARVIS_OWNER_EMAIL
const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password: "senha-interna-123", email_confirm: true });
if (cErr) throw cErr;
const ownerId = created.user.id;

const app = spawn(path.join(webDir, "node_modules/.bin/next"), ["start", "-p", "3101"], {
  cwd: webDir,
  detached: true,
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
    SUPABASE_SECRET_KEY: SECRET,
    NEXT_PUBLIC_APP_URL: APP,
    TELEGRAM_BOT_TOKEN: "123:e2e",
    TELEGRAM_WEBHOOK_SECRET: "x",
    TELEGRAM_API_BASE: MOCK,
    CRON_SECRET: "cron",
    JARVIS_OWNER_EMAIL: email,
    // sem JARVIS_REQUIRE_LOGIN (modo interno), sem ANTHROPIC_API_KEY e sem OPENAI_API_KEY
    ANTHROPIC_API_KEY: "",
    OPENAI_API_KEY: "",
    AI_GATEWAY_API_KEY: "gw-e2e",
    AI_GATEWAY_BASE_URL: MOCK,
  },
  stdio: "ignore",
});
await waitFor(() => fetch(`${APP}/inbox`).then((r) => r.ok).catch(() => false), 60_000);

await step("sem sessão: páginas abrem como o dono (sem redirecionar ao login)", async () => {
  for (const p of ["/inbox", "/notes", "/graph", "/chat", "/timeline", "/settings"]) {
    const r = await fetch(`${APP}${p}`, { redirect: "manual" });
    assert.equal(r.status, 200, `${p} → ${r.status}`);
  }
  const html = await (await fetch(`${APP}/inbox`)).text();
  assert.match(html, /Acesso interno/);
  assert.equal((await fetch(`${APP}/inbox`)).headers.get("x-robots-tag"), "noindex, nofollow");
});

await step("/login redireciona para o app", async () => {
  const r = await fetch(`${APP}/login`, { redirect: "manual" });
  assert.ok([307, 308].includes(r.status));
  assert.match(r.headers.get("location"), /\/inbox$/);
});

let workspaceId;
await step("o workspace é o do dono (criado se não existia)", async () => {
  await fetch(`${APP}/inbox`);
  const { data } = await admin.from("workspace_members").select("workspace_id").eq("user_id", ownerId);
  assert.equal(data.length, 1);
  workspaceId = data[0].workspace_id;
});

await step("captura pela web processa com o AI Gateway e SEM OpenAI", async () => {
  const form = new FormData();
  form.set("text", "Saindo da palestra do Aaron Ross: a maioria das respostas em outbound vem depois do quarto toque.");
  const r = await fetch(`${APP}/api/capture/web`, { method: "POST", body: form });
  const body = await r.json();
  assert.equal(r.status, 200, JSON.stringify(body));
  const { sourceId } = body;
  await waitFor(async () => (await admin.from("sources").select("status").eq("id", sourceId).single()).data.status === "done");
  const { data: notes } = await admin.from("notes").select("type, title, embedding").eq("workspace_id", workspaceId);
  assert.ok(notes.filter((n) => n.type === "insight").length === 2, "dois insights");
  assert.ok(notes.every((n) => n.embedding === null), "sem OpenAI não há embeddings (e nada quebra)");
  const call = anthropicCalls.find((c) => !c.stream);
  assert.ok(call.model.startsWith("anthropic/"), `modelo do gateway: ${call.model}`);
});

await step("worker consome a fila de embeddings sem erro quando não há OpenAI", async () => {
  const r = await fetch(`${APP}/api/workers/drain`, { method: "POST", headers: { Authorization: "Bearer cron" } });
  assert.equal(r.status, 200);
  const { count } = await admin.from("notes").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).is("embedding", null);
  assert.ok(count > 0, "continuam sem embedding");
});

await step("busca por palavra-chave funciona sem embeddings", async () => {
  const r = await fetch(`${APP}/api/notes/titles?q=cad`);
  const titles = (await r.json()).map((n) => n.title);
  assert.ok(titles.some((t) => t.startsWith("Cadência")), titles.join(", "));
  const { data } = await admin.rpc("hybrid_search", { p_workspace: workspaceId, query_text: "cadência outbound", match_count: 5 });
  assert.ok(data.length > 0);
});

await step("chat pelo gateway: streaming + tool, sem recursos beta/effort", async () => {
  const r = await fetch(`${APP}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "O que aprendi sobre cadência?" }) });
  const events = (await r.text()).trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(events.some((e) => e.type === "tool" && e.name === "search_knowledge"));
  assert.ok(!events.some((e) => e.type === "error"), JSON.stringify(events.filter((e) => e.type === "error")));
  assert.match(events.filter((e) => e.type === "text").map((e) => e.text).join(""), /Na sua base/);
  const chat = anthropicCalls.filter((c) => c.stream);
  assert.ok(chat.every((c) => c.model.startsWith("anthropic/")), "modelos com prefixo do gateway");
});

await step("exportação e grafo abrem sem sessão", async () => {
  assert.equal((await fetch(`${APP}/api/export`)).status, 200);
  const snap = await (await fetch(`${APP}/api/graph`)).json();
  assert.ok(snap.nodes.length >= 4);
});

try {
  process.kill(-app.pid, "SIGKILL");
} catch {}
mock.closeAllConnections();
mock.close();
await admin.auth.admin.deleteUser(ownerId).catch(() => {});
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passos OK`);
process.exit(failed ? 1 : 0);
