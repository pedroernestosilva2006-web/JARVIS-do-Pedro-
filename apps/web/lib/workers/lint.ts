import "server-only";
import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import { MOC_CLUSTER_MIN_SIZE, STALE_SEED_DAYS } from "@jarvis/core";
import { notifyChannel } from "@/lib/capture/notify";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GraphSnapshot } from "@/lib/types";

/**
 * Lint semanal do grafo: propõe merges de duplicatas, aponta órfãs, sugere MOCs para
 * clusters grandes e lembra das sementes antigas no Telegram. Nada é alterado sem revisão.
 */
export async function runLint() {
  const db = createAdminClient();
  const { data: workspaces } = await db.from("workspaces").select("id");
  const report: Record<string, { duplicates: number; orphans: number; mocProposals: number; staleSeeds: number }> = {};

  for (const { id: ws } of workspaces ?? []) {
    const { data: open } = await db
      .from("review_items")
      .select("kind, note_id, payload")
      .eq("workspace_id", ws)
      .eq("status", "open");
    const already = new Set((open ?? []).map((r) => `${r.kind}:${r.note_id}`));
    const items: { workspace_id: string; kind: string; note_id: string; payload: Record<string, unknown> }[] = [];
    const add = (kind: string, noteId: string, payload: Record<string, unknown>) => {
      if (already.has(`${kind}:${noteId}`)) return;
      already.add(`${kind}:${noteId}`);
      items.push({ workspace_id: ws, kind, note_id: noteId, payload });
    };

    const { data: dups } = await db.rpc("lint_duplicate_entities", { p_workspace: ws });
    for (const d of (dups ?? []) as { a_id: string; a_title: string; b_id: string; b_title: string; similarity: number }[]) {
      add("duplicate", d.b_id, { keep_id: d.a_id, keep_title: d.a_title, merge_title: d.b_title, similarity: d.similarity });
    }

    const { data: orphans } = await db.rpc("lint_orphans", { p_workspace: ws });
    for (const o of ((orphans ?? []) as { id: string; title: string }[]).slice(0, 20)) add("orphan", o.id, { title: o.title });

    // Clusters (Louvain) sem MOC
    const { data: snapshot } = await db.rpc("graph_snapshot", { p_workspace: ws, p_include_suggested: false });
    const snap = snapshot as GraphSnapshot | null;
    let mocProposals = 0;
    if (snap && snap.nodes.length >= MOC_CLUSTER_MIN_SIZE) {
      const g = new Graph({ type: "undirected", multi: false });
      for (const n of snap.nodes) g.addNode(n.id, { type: n.type, title: n.title });
      for (const e of snap.edges) if (!g.hasEdge(e.source, e.target) && e.source !== e.target) g.addEdge(e.source, e.target);
      const communities = louvain(g);
      const groups = new Map<number, string[]>();
      for (const [node, c] of Object.entries(communities)) groups.set(c, [...(groups.get(c) ?? []), node]);
      for (const members of groups.values()) {
        if (members.length < MOC_CLUSTER_MIN_SIZE) continue;
        if (members.some((m) => g.getNodeAttribute(m, "type") === "moc")) continue;
        const hub = members.reduce((a, b) => (g.degree(a) >= g.degree(b) ? a : b));
        add("moc_proposal", hub, {
          hub_title: g.getNodeAttribute(hub, "title"),
          size: members.length,
          sample_titles: members.slice(0, 12).map((m) => g.getNodeAttribute(m, "title")),
          note_ids: members,
        });
        mocProposals++;
      }
    }

    if (items.length) await db.from("review_items").insert(items);

    // Lembrete de sementes antigas
    const cutoff = new Date(Date.now() - STALE_SEED_DAYS * 86400_000).toISOString();
    const { data: stale, count } = await db
      .from("notes")
      .select("title", { count: "exact" })
      .eq("workspace_id", ws)
      .eq("stage", "semente")
      .lt("created_at", cutoff)
      .limit(3);
    if (count) {
      const { data: identities } = await db
        .from("channel_identities")
        .select("channel, external_chat_id")
        .eq("workspace_id", ws);
      const text = `🧠 Você tem ${count} semente(s) com mais de ${STALE_SEED_DAYS} dias sem revisão, como:\n${(stale ?? [])
        .map((s) => `• ${s.title}`)
        .join("\n")}\n\nRevise em ${env.appUrl()}/inbox`;
      for (const id of identities ?? []) {
        await notifyChannel(id.channel, { chat_id: id.external_chat_id }, text).catch((e) => console.error(e));
      }
    }

    report[ws] = {
      duplicates: (dups ?? []).length,
      orphans: (orphans ?? []).length,
      mocProposals,
      staleSeeds: count ?? 0,
    };
  }
  return report;
}
