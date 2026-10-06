import "server-only";
import { JARVIS_TOOLS, runTool, toolJsonSchema, type ToolContext } from "@/lib/jarvis/tools";

/**
 * Servidor MCP mínimo (JSON-RPC 2.0 sobre Streamable HTTP, modo stateless com respostas JSON).
 * Expõe as mesmas tools do Jarvis para Claude Code, Claude Desktop e o MCP connector da API.
 */

export const MCP_PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_VERSIONS = new Set(["2025-06-18", "2025-03-26", "2024-11-05"]);

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string } };

export async function handleMcpMessage(ctx: ToolContext, msg: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = msg.id ?? null;
  // Notificações (sem id) não têm resposta
  if (msg.id === undefined) return null;
  switch (msg.method) {
    case "initialize": {
      const requested = String(msg.params?.protocolVersion ?? MCP_PROTOCOL_VERSION);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: SUPPORTED_VERSIONS.has(requested) ? requested : MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "jarvis-segundo-cerebro", version: "0.1.0" },
          instructions:
            "Segundo cérebro do Pedro. Use search_knowledge antes de responder sobre o que ele sabe; cite notas como [[Título]]. Ferramentas de escrita alteram a base.",
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: JARVIS_TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: toolJsonSchema(t),
            annotations: { readOnlyHint: !("write" in t && t.write) },
          })),
        },
      };
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const r = await runTool(ctx, name, msg.params?.arguments ?? {});
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: r.content }], isError: r.isError } };
    }
    default:
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `Método não suportado: ${msg.method}` } };
  }
}
