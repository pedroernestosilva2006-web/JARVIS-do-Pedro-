/**
 * Eval do pipeline de extração contra o golden set (evals/golden.json).
 * Gasta tokens reais: ~10 chamadas ao modelo de extração (centavos com Haiku).
 *
 *   ANTHROPIC_API_KEY=... pnpm eval:ingest
 *
 * Rode após mudar prompts (lib/ai/prompts/*) ou o modelo de extração, e compare o placar.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { extractKnowledge } from "@/lib/ai/extract";
import { EXTRACT_PROMPT_VERSION } from "@/lib/ai/prompts/extract";
import { env } from "@/lib/env";
import { grade, type GoldenCase } from "./grade";

process.env.JARVIS_DISABLE_USAGE = "1";

async function main() {
  const dir = import.meta.dirname;
  const cases = JSON.parse(readFileSync(path.join(dir, "golden.json"), "utf8")) as GoldenCase[];
  const only = process.argv[2];
  let passed = 0;
  let total = 0;
  const results = [];
  for (const c of cases.filter((x) => !only || x.id === only)) {
    const out = await extractKnowledge("eval", {
      text: c.text,
      kind: c.kind,
      channel: "telegram",
      capturedAt: "2026-09-24T15:00:00Z",
      sessionContext: c.session,
    });
    const checks = grade(c, out);
    const ok = checks.filter((x) => x.pass).length;
    passed += ok;
    total += checks.length;
    console.log(`\n${ok === checks.length ? "✅" : "⚠️ "} ${c.id}  (${ok}/${checks.length})`);
    for (const ch of checks.filter((x) => !x.pass)) console.log(`   ✗ ${ch.name}: ${ch.detail ?? ""}`);
    results.push({ id: c.id, checks, output: out });
  }
  const score = total ? (100 * passed) / total : 0;
  console.log(`\nPlacar: ${passed}/${total} (${score.toFixed(1)}%) · modelo ${env.extractModel()} · prompt ${EXTRACT_PROMPT_VERSION}`);
  mkdirSync(path.join(dir, "results"), { recursive: true });
  const file = path.join(dir, "results", `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ model: env.extractModel(), prompt: EXTRACT_PROMPT_VERSION, score, results }, null, 2));
  console.log(`Detalhes: ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
