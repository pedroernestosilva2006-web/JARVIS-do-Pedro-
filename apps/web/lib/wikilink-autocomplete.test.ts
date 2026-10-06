import { describe, expect, it } from "vitest";
import { completeWikilink, openWikilinkQuery } from "./wikilink-autocomplete";

describe("autocomplete de wikilinks", () => {
  it("detecta [[ aberto antes do cursor", () => {
    expect(openWikilinkQuery("ver [[Rece", 10)).toEqual({ query: "Rece", start: 6 });
    expect(openWikilinkQuery("ver [[", 6)).toEqual({ query: "", start: 6 });
    expect(openWikilinkQuery("ver [[A]] e", 11)).toBeNull();
    expect(openWikilinkQuery("ver [[A|b", 9)).toBeNull();
    expect(openWikilinkQuery("[[a\nb", 5)).toBeNull();
  });
  it("completa e fecha o link", () => {
    expect(completeWikilink("ver [[Rece e mais", 10, "Receita Previsível")).toEqual({
      text: "ver [[Receita Previsível]] e mais",
      caret: 26,
    });
  });
  it("não duplica ]] já existentes", () => {
    expect(completeWikilink("[[Re]]", 4, "Receita").text).toBe("[[Receita]]");
  });
});
