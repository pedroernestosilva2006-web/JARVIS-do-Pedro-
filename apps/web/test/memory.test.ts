import { describe, expect, it } from "vitest";
import { conversationTranscript } from "@/lib/jarvis/memory";

describe("conversationTranscript", () => {
  it("mantém só o texto trocado, sem tool_use/tool_result", () => {
    const t = conversationTranscript([
      { role: "user", content: "O que sei sobre cadência?" },
      { role: "assistant", content: [{ type: "tool_use", id: "x", name: "search_knowledge", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "x", content: "{...}" }] },
      { role: "assistant", content: [{ type: "thinking", thinking: "" }, { type: "text", text: "Oito toques." }] },
    ]);
    expect(t).toBe("Pedro: O que sei sobre cadência?\n\nJARVIS: Oito toques.");
  });
  it("corta o começo de conversas enormes, preservando o final", () => {
    const t = conversationTranscript([{ role: "user", content: "a".repeat(100) + "FIM" }], 50);
    expect(t.endsWith("FIM")).toBe(true);
    expect(t.length).toBe(50);
  });
});
