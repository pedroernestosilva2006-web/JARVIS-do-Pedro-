import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { handleMcpMessage } from "@/lib/mcp/server";
import { anthropicTools } from "@/lib/jarvis/tools";

const ctx = { db: {} as SupabaseClient, workspaceId: "00000000-0000-0000-0000-000000000001" };

describe("servidor MCP", () => {
  it("initialize negocia versão e anuncia tools", async () => {
    const r = (await handleMcpMessage(ctx, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26" },
    })) as { result: { protocolVersion: string; capabilities: { tools: object } } };
    expect(r.result.protocolVersion).toBe("2025-03-26");
    expect(r.result.capabilities.tools).toBeDefined();
  });
  it("notificações não têm resposta", async () => {
    expect(await handleMcpMessage(ctx, { jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
  });
  it("tools/list expõe as 11 tools com JSON Schema e dica de somente-leitura", async () => {
    const r = (await handleMcpMessage(ctx, { jsonrpc: "2.0", id: 2, method: "tools/list" })) as {
      result: { tools: { name: string; inputSchema: { type: string }; annotations: { readOnlyHint: boolean } }[] };
    };
    const names = r.result.tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["search_knowledge", "get_note", "create_note", "remember", "synthesize"]));
    expect(r.result.tools).toHaveLength(11);
    expect(r.result.tools.every((t) => t.inputSchema.type === "object")).toBe(true);
    expect(r.result.tools.find((t) => t.name === "search_knowledge")!.annotations.readOnlyHint).toBe(true);
    expect(r.result.tools.find((t) => t.name === "create_note")!.annotations.readOnlyHint).toBe(false);
  });
  it("tools/call valida a entrada antes de executar", async () => {
    const r = (await handleMcpMessage(ctx, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "search_knowledge", arguments: { query: 123 } },
    })) as { result: { isError: boolean; content: { text: string }[] } };
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0]!.text).toContain("Entrada inválida");
  });
  it("método desconhecido devolve -32601", async () => {
    const r = (await handleMcpMessage(ctx, { jsonrpc: "2.0", id: 4, method: "resources/list" })) as { error: { code: number } };
    expect(r.error.code).toBe(-32601);
  });
  it("schemas das tools para a Messages API não carregam $schema", () => {
    for (const t of anthropicTools()) {
      expect(t.input_schema.type).toBe("object");
      expect(t.input_schema).not.toHaveProperty("$schema");
    }
  });
});
