import { env } from "@/lib/env";
import { isAuthorizedCron } from "@/lib/security";
import { runBriefs } from "@/lib/workers/brief";

export const maxDuration = 300;

/** Brief diário/semanal no Telegram (pg_cron: ?periodo=dia | ?periodo=semana). */
export async function POST(req: Request) {
  if (!isAuthorizedCron(req, env.cronSecret())) return new Response("unauthorized", { status: 401 });
  const period = new URL(req.url).searchParams.get("periodo") === "semana" ? "semana" : "dia";
  return Response.json(await runBriefs(period));
}

export const GET = POST;
