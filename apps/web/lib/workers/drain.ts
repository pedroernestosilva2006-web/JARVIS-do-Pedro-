import "server-only";
import { env } from "@/lib/env";
import { notifyChannel } from "@/lib/capture/notify";
import { processEmbeddings } from "@/lib/ingest/embeddings";
import { processSource, summarizeResult } from "@/lib/ingest/pipeline";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_ATTEMPTS = 3;

interface Job<T> {
  msg_id: number;
  read_ct: number;
  message: T;
}

/** Consome as filas pgmq. Chamado pelo pg_cron (a cada minuto) e logo após cada webhook. */
export async function drainQueues(opts: { captures?: number; embeddings?: number } = {}) {
  const db = createAdminClient();
  const report = { captures: 0, failed: 0, embedded: 0, suggested: 0 };

  // --- captures -------------------------------------------------------------------
  const { data: captureJobs, error } = await db.rpc("read_jobs", {
    p_queue: "captures",
    p_vt: 300,
    p_qty: opts.captures ?? 3,
  });
  if (error) throw new Error(`read_jobs(captures): ${error.message}`);
  for (const job of (captureJobs ?? []) as Job<{ source_id: string; workspace_id: string }>[]) {
    const { source_id, workspace_id } = job.message;
    try {
      const result = await processSource(db, workspace_id, source_id);
      await db.rpc("ack_job", { p_queue: "captures", p_msg_id: job.msg_id });
      report.captures++;
      const { data: src } = await db
        .from("sources")
        .select("channel, metadata")
        .eq("id", source_id)
        .eq("workspace_id", workspace_id)
        .single();
      if (src && !result.skipped) await notifyChannel(src.channel, src.metadata, summarizeResult(result, env.appUrl()));
    } catch (err) {
      report.failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error("process-capture falhou", source_id, message);
      await db.from("sources").update({ status: "error", error: message }).eq("id", source_id).eq("workspace_id", workspace_id);
      if (job.read_ct >= MAX_ATTEMPTS) {
        await db.rpc("archive_job", { p_queue: "captures", p_msg_id: job.msg_id });
        const { data: src } = await db
          .from("sources")
          .select("channel, metadata")
          .eq("id", source_id)
          .eq("workspace_id", workspace_id)
          .single();
        if (src) await notifyChannel(src.channel, src.metadata, `Não consegui processar sua captura: ${message}`).catch(() => {});
      }
      // senão: a mensagem volta a ficar visível após o visibility timeout (retry)
    }
  }

  // --- embeddings (em lote) --------------------------------------------------------
  const { data: embedJobs, error: embErr } = await db.rpc("read_jobs", {
    p_queue: "embeddings",
    p_vt: 120,
    p_qty: opts.embeddings ?? 25,
  });
  if (embErr) throw new Error(`read_jobs(embeddings): ${embErr.message}`);
  const jobs = (embedJobs ?? []) as Job<{ note_id: string; workspace_id: string }>[];
  if (jobs.length) {
    try {
      const r = await processEmbeddings(
        db,
        jobs.map((j) => ({ noteId: j.message.note_id, workspaceId: j.message.workspace_id })),
      );
      report.embedded = r.embedded;
      report.suggested = r.suggested;
      for (const j of jobs) await db.rpc("ack_job", { p_queue: "embeddings", p_msg_id: j.msg_id });
    } catch (err) {
      console.error("embeddings falhou", err);
      for (const j of jobs.filter((j) => j.read_ct >= MAX_ATTEMPTS)) {
        await db.rpc("archive_job", { p_queue: "embeddings", p_msg_id: j.msg_id });
      }
    }
  }
  return report;
}
