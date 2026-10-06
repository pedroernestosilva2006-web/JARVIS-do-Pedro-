import { env } from "@/lib/env";
import { isAuthorizedCron } from "@/lib/security";
import { drainQueues } from "@/lib/workers/drain";

export const maxDuration = 300;

/** Chamado pelo pg_cron a cada minuto (Authorization: Bearer CRON_SECRET). */
export async function POST(req: Request) {
  if (!isAuthorizedCron(req, env.cronSecret())) return new Response("unauthorized", { status: 401 });
  const report = await drainQueues();
  return Response.json(report);
}

export const GET = POST;
