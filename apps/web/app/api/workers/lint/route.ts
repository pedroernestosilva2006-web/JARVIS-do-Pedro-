import { env } from "@/lib/env";
import { isAuthorizedCron } from "@/lib/security";
import { runLint } from "@/lib/workers/lint";

export const maxDuration = 300;

/** Lint semanal (pg_cron de domingo): duplicatas, órfãs, clusters sem MOC, sementes velhas. */
export async function POST(req: Request) {
  if (!isAuthorizedCron(req, env.cronSecret())) return new Response("unauthorized", { status: 401 });
  return Response.json(await runLint());
}

export const GET = POST;
