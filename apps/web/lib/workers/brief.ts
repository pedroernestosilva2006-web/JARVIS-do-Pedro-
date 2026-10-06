import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TYPE_LABELS, isNoteType } from "@jarvis/core";
import { anthropic, recordUsage, textOf } from "@/lib/ai/llm";
import { BRIEF_SYSTEM } from "@/lib/ai/prompts/brief";
import { notifyChannel } from "@/lib/capture/notify";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export type BriefPeriod = "dia" | "semana";

type Titled = { title: string } | null;

/**
 * Monta o brief de um workspace ("o que aprendi hoje/esta semana").
 * Retorna null quando não houve nada novo no período (não incomoda o Pedro à toa).
 */
export async function buildBrief(db: SupabaseClient, workspaceId: string, period: BriefPeriod): Promise<string | null> {
  const since = new Date(Date.now() - (period === "dia" ? 1 : 7) * 86400_000).toISOString();
  const [{ data: notes }, { data: links }, seeds, suggested, { data: tasks }, { data: projects }] = await Promise.all([
    db
      .from("notes")
      .select("type, title, summary")
      .eq("workspace_id", workspaceId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(60),
    db
      .from("links")
      .select("relation, rationale, status, from:notes!links_from_note_fkey(title), to:notes!links_to_note_fkey(title)")
      .eq("workspace_id", workspaceId)
      .gte("created_at", since)
      .in("relation", ["apoia", "contradiz", "exemplo_de", "inspira", "relacionado"])
      .neq("status", "rejected")
      .limit(15),
    db.from("notes").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("stage", "semente"),
    db.from("links").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "suggested"),
    db
      .from("notes")
      .select("title")
      .eq("workspace_id", workspaceId)
      .eq("type", "tarefa")
      .or("properties->>feito.is.null,properties->>feito.neq.true")
      .order("created_at", { ascending: false })
      .limit(5),
    db.from("notes").select("title").eq("workspace_id", workspaceId).eq("type", "projeto").neq("para_bucket", "arquivo").limit(10),
  ]);

  // Tarefas sozinhas não justificam um brief
  const fresh = (notes ?? []).filter((n) => n.type !== "tarefa");
  if (!fresh.length) return null;

  const label = (t: string) => (isNoteType(t) ? TYPE_LABELS[t] : t);
  const material = [
    `Período: ${period === "dia" ? "últimas 24 horas" : "últimos 7 dias"}.`,
    `Notas novas (${fresh.length}):`,
    ...fresh.map((n) => `- [${label(n.type)}] ${n.title}${n.summary ? ` — ${n.summary}` : ""}`),
    "",
    "Conexões criadas no período:",
    ...((links ?? []).map((l) => {
      const from = l.from as unknown as Titled;
      const to = l.to as unknown as Titled;
      return from && to ? `- "${from.title}" ${l.relation}${l.status === "suggested" ? " (sugerida)" : ""} "${to.title}"${l.rationale ? `: ${l.rationale}` : ""}` : "";
    }).filter(Boolean) || ["(nenhuma)"]),
    "",
    `Pendências: ${seeds.count ?? 0} sementes para revisar, ${suggested.count ?? 0} conexões sugeridas.`,
    `Tarefas abertas: ${(tasks ?? []).map((t) => t.title).join("; ") || "(nenhuma)"}`,
    `Projetos ativos: ${(projects ?? []).map((p) => p.title).join("; ") || "(nenhum)"}`,
  ].join("\n");

  const model = env.extractModel();
  const res = await anthropic().messages.create({
    model,
    max_tokens: 2000,
    system: [{ type: "text", text: BRIEF_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: material }],
  });
  await recordUsage(workspaceId, "brief", model, res.usage);
  const text = textOf(res);
  return text ? `${text}\n\n${env.appUrl()}/inbox` : null;
}

/** Envia o brief para todos os workspaces com canal conectado (chamado pelo pg_cron). */
export async function runBriefs(period: BriefPeriod) {
  const db = createAdminClient();
  const { data: identities } = await db.from("channel_identities").select("workspace_id, channel, external_chat_id");
  const byWorkspace = new Map<string, { channel: string; external_chat_id: string | null }[]>();
  for (const i of identities ?? []) byWorkspace.set(i.workspace_id, [...(byWorkspace.get(i.workspace_id) ?? []), i]);

  const report: Record<string, "enviado" | "nada novo" | string> = {};
  for (const [ws, channels] of byWorkspace) {
    try {
      const brief = await buildBrief(db, ws, period);
      if (!brief) {
        report[ws] = "nada novo";
        continue;
      }
      for (const c of channels) await notifyChannel(c.channel, { chat_id: c.external_chat_id }, brief);
      report[ws] = "enviado";
    } catch (err) {
      report[ws] = `erro: ${err instanceof Error ? err.message : err}`;
    }
  }
  return report;
}
