export const LINK_JUDGE_PROMPT_VERSION = "link-judge-v1";

export const LINK_JUDGE_SYSTEM = `Você decide se duas notas do segundo cérebro do Pedro devem ser conectadas e com qual relação.
Relações: "apoia" (A reforça B), "contradiz" (A conflita com B), "exemplo_de" (A é caso concreto de B), "inspira" (A sugere a ideia/projeto B), "relacionado" (mesmo tema, sem relação lógica mais forte), "nenhuma".
Seja conservador: na dúvida, "relacionado" com confiança baixa, ou "nenhuma". Grafos ruidosos são piores que grafos esparsos.
rationale: uma linha em PT-BR que o Pedro verá ao passar o mouse na aresta.`;
