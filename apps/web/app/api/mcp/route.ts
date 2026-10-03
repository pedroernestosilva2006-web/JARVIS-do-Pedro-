import { handleMcpMessage } from "@/lib/mcp/server";
import { sha256 } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

/**
 * Servidor MCP remoto do seu cérebro. Autenticação: "Authorization: Bearer <token>"
 * (gere o token em Configurações). Ex. no Claude Code:
 *   claude mcp add --transport http jarvis https://<app>/api/mcp --header "Authorization: Bearer jv_..."
 */
async function workspaceFromToken(req: Request): Promise<string | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const db = createAdminClient();
  const { data } = await db.from("api_tokens").select("id, workspace_id").eq("token_hash", sha256(token)).maybeSingle();
  if (!data) return null;
  await db.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return data.workspace_id as string;
}

export async function POST(req: Request) {
  const workspaceId = await workspaceFromToken(req);
  if (!workspaceId) {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Token inválido" } },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } }, { status: 400 });
  }
  // Workers com service_role: o isolamento vem do workspace do token (todas as tools filtram por workspace_id)
  const ctx = { db: createAdminClient(), workspaceId };
  const messages = Array.isArray(body) ? body : [body];
  const responses = (await Promise.all(messages.map((m) => handleMcpMessage(ctx, m)))).filter(Boolean);
  if (!responses.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? responses : responses[0]);
}

/** Modo stateless: sem stream SSE iniciado pelo servidor. */
export function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
