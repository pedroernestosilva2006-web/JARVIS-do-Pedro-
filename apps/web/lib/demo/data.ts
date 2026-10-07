import type { NoteType, Relation, Stage } from "@jarvis/core";

/**
 * Dados de exemplo (~40 notas) para o cérebro não nascer vazio: um evento, um livro, pessoas,
 * conceitos, insights, ideias, projetos e tarefas, todos conectados. Marcados com
 * `properties.demo = true` para poderem ser apagados de uma vez.
 */
export interface DemoNote {
  title: string;
  type: NoteType;
  stage: Stage;
  by: "user" | "ai";
  daysAgo: number;
  summary?: string;
  content: string;
  tags?: string[];
  properties?: Record<string, unknown>;
}
export interface DemoLink {
  from: string;
  to: string;
  relation: Relation;
  /** Sugestão da IA (aparece em "Revisar") */
  suggested?: { confidence: number; rationale: string };
}

const D = (title: string, type: NoteType, stage: Stage, by: "user" | "ai", daysAgo: number, content: string, extra: Partial<DemoNote> = {}): DemoNote => ({
  title,
  type,
  stage,
  by,
  daysAgo,
  content,
  ...extra,
});

export const DEMO_NOTES: DemoNote[] = [
  D("RD Summit 2026", "evento", "perene", "user", 45, "Maior evento de marketing e vendas do ano. Palestras sobre [[IA em vendas]], [[Cadência de outbound]] e [[Pipeline previsível]].", {
    summary: "Evento de marketing e vendas em São Paulo, setembro de 2026.",
    tags: ["vendas", "ia"],
    properties: { local: "São Paulo" },
  }),
  D("Receita Previsível", "livro", "perene", "user", 110, "Livro de [[Aaron Ross]] sobre como construir uma máquina de [[Pipeline previsível]] separando prospecção, qualificação e fechamento.", {
    summary: "Como montar uma máquina de vendas com papéis especializados.",
    tags: ["vendas", "gestao"],
  }),
  D("Aaron Ross", "pessoa", "perene", "user", 110, "Autor de [[Receita Previsível]]. Criou o modelo de equipes de SDR na Salesforce.", { tags: ["vendas"] }),
  D("Juliana Prado", "pessoa", "broto", "user", 44, "Palestrante no [[RD Summit 2026]]. Fala sobre dados e [[IA em vendas]]. Quero retomar o contato.", { tags: ["ia"] }),
  D("Camila Duarte", "pessoa", "broto", "user", 70, "Líder de SDRs na [[Acme Logística]]. Aplica a [[Cadência de outbound]] com [[Claude]] para personalizar mensagens.", { tags: ["outbound"] }),
  D("Rafael Mendes", "pessoa", "broto", "user", 30, "Fundador de cliente em potencial. Interessado em [[Qualificação BANT]] automatizada.", { tags: ["prospeccao"] }),
  D("RD Station", "empresa", "broto", "user", 45, "Organizadora do [[RD Summit 2026]]. Referência em automação de marketing.", { tags: ["vendas"] }),
  D("Acme Logística", "empresa", "broto", "user", 70, "Cliente piloto do projeto [[Copiloto de SDR]]. Time de 12 vendedores.", { tags: ["prospeccao"] }),
  D("Cadência de outbound", "conceito", "perene", "user", 100, "Sequência planejada de toques (e-mail, ligação, LinkedIn) ao longo de dias. Ver [[Oito toques superam três toques]].", { tags: ["outbound", "vendas"] }),
  D("Qualificação BANT", "conceito", "broto", "user", 90, "Budget, Authority, Need, Timing: quatro perguntas para decidir se vale avançar com um lead. Relacionado a [[Ideal Customer Profile (ICP)]].", { tags: ["prospeccao"] }),
  D("Ideal Customer Profile (ICP)", "conceito", "broto", "user", 95, "Descrição do cliente que mais compra, retém e indica. Base da [[Qualificação BANT]] e da lista de prospecção.", { tags: ["prospeccao", "vendas"] }),
  D("Pipeline previsível", "conceito", "perene", "user", 105, "Funil com etapas claras, taxas medidas e volume suficiente para o resultado deixar de ser surpresa.", { tags: ["vendas", "gestao"] }),
  D("IA em vendas", "conceito", "broto", "user", 60, "Uso de modelos de linguagem para pesquisar contas, personalizar abordagens e resumir reuniões. Veja [[Claude]].", { tags: ["ia", "vendas"] }),
  D("Claude", "ferramenta", "broto", "user", 55, "Assistente de IA usado no projeto [[Copiloto de SDR]] e neste segundo cérebro.", { tags: ["ia"] }),
  D("CRM", "ferramenta", "semente", "ai", 40, "Sistema onde o funil vive. Sem dados limpos aqui, a previsibilidade do [[Pipeline previsível]] some.", { tags: ["vendas", "gestao"] }),

  D("Oito toques superam três toques", "insight", "broto", "user", 44, "A maioria das respostas em outbound vem depois do quarto toque; parar no terceiro joga fora o esforço. Fonte: palestra no [[RD Summit 2026]].", {
    summary: "Persistir na cadência dobra a taxa de resposta.",
    tags: ["outbound"],
  }),
  D("Personalização escala com IA", "insight", "semente", "ai", 43, "Dá para personalizar a primeira linha de cada e-mail com dados públicos da conta usando [[Claude]], sem perder velocidade.", { tags: ["ia", "outbound"] }),
  D("Separar SDR e closer cria métricas claras", "insight", "broto", "user", 100, "Quando prospecção e fechamento são papéis diferentes, cada etapa tem meta e taxa próprias. Ideia central de [[Receita Previsível]].", { tags: ["gestao", "vendas"] }),
  D("Lead sem orçamento consome o time", "insight", "semente", "ai", 88, "Aplicar [[Qualificação BANT]] cedo evita semanas gastas com quem não pode comprar.", { tags: ["prospeccao"] }),
  D("ICP errado faz a cadência falhar", "insight", "semente", "ai", 80, "Uma [[Cadência de outbound]] perfeita para o público errado só gera descadastros. Revisar o [[Ideal Customer Profile (ICP)]] primeiro.", { tags: ["outbound", "prospeccao"] }),
  D("Dados sujos matam a previsibilidade", "insight", "semente", "ai", 38, "Previsão de receita só vale se o [[CRM]] reflete a realidade. Auditoria semanal do pipeline resolve metade do problema.", { tags: ["gestao"] }),
  D("Resumo de reunião vira tarefa automática", "insight", "semente", "ai", 36, "Transcrever a call e gerar próximos passos com IA elimina o esquecimento pós-reunião. Ver [[Copiloto de SDR]].", { tags: ["ia"] }),
  D("Follow-up em até cinco minutos", "insight", "broto", "user", 66, "Responder um lead novo em minutos aumenta muito a chance de conversa. Combine com [[Cadência de outbound]].", { tags: ["outbound", "vendas"] }),
  D("Quem pergunta mais, vende mais", "insight", "broto", "user", 52, "Descoberta bem feita (SPIN, BANT) pesa mais que a apresentação. Aplicável em [[Qualificação BANT]].", { tags: ["vendas"] }),
  D("Gestão por dados vence feeling", "insight", "broto", "user", 47, "Juliana mostrou no [[RD Summit 2026]] que times que medem etapas do funil crescem mais rápido. Ver [[Pipeline previsível]].", { tags: ["gestao", "ia"] }),
  D("IA não substitui relacionamento", "insight", "semente", "ai", 41, "Automatizar a pesquisa libera tempo para conversas humanas; a confiança continua sendo construída por pessoas.", { tags: ["ia", "vendas"] }),
  D("Cadência por canal", "insight", "semente", "ai", 33, "Misturar e-mail, telefone e LinkedIn dentro da mesma [[Cadência de outbound]] aumenta a cobertura da conta.", { tags: ["outbound"] }),
  D("Prospecção é jogo de volume e qualidade", "insight", "broto", "user", 25, "Mais contatos só ajudam se o [[Ideal Customer Profile (ICP)]] estiver afiado.", { tags: ["prospeccao"] }),
  D("Playbook curto é usado; longo é ignorado", "insight", "broto", "user", 20, "Uma página com os passos essenciais do [[Pipeline previsível]] vale mais que um manual de 40 páginas.", { tags: ["gestao"] }),

  D("Newsletter semanal de vendas com IA", "ideia", "semente", "user", 12, "Resumir toda semana o que aprendi sobre [[IA em vendas]] e [[Cadência de outbound]].", { tags: ["ia", "vendas"] }),
  D("Template de primeira linha personalizada", "ideia", "semente", "user", 10, "Prompt reutilizável para o [[Claude]] gerar a abertura do e-mail a partir do site da conta.", { tags: ["ia", "outbound"] }),
  D("Workshop de ICP para clientes", "ideia", "semente", "user", 6, "Oficina de duas horas para refinar o [[Ideal Customer Profile (ICP)]] com o time comercial.", { tags: ["prospeccao"] }),

  D("Copiloto de SDR", "projeto", "broto", "user", 35, "Assistente que prepara cada toque da [[Cadência de outbound]] para o time da [[Acme Logística]] usando [[Claude]].", { tags: ["ia", "outbound"] }),
  D("Curso: Vendas previsíveis com IA", "projeto", "semente", "user", 15, "Curso curto combinando [[Receita Previsível]], [[Qualificação BANT]] e [[IA em vendas]].", { tags: ["vendas", "ia"] }),

  D("Enviar proposta para Rafael Mendes", "tarefa", "semente", "user", 5, "Seguir a [[Qualificação BANT]] antes: confirmar orçamento e decisor com [[Rafael Mendes]].", { tags: ["prospeccao"] }),
  D("Mapear ICP da Acme Logística", "tarefa", "semente", "user", 8, "Levantar os 10 melhores clientes e padrões em comum para o [[Copiloto de SDR]].", { tags: ["prospeccao"] }),
  D("Retomar contato com Juliana Prado", "tarefa", "semente", "user", 3, "Agradecer a palestra e perguntar sobre dados de funil. Ver [[Juliana Prado]].", { tags: ["vendas"] }),

  D("Como medir a qualidade de uma cadência?", "pergunta", "semente", "user", 14, "Taxa de resposta, reuniões marcadas ou receita gerada? Ver [[Cadência de outbound]].", { tags: ["outbound"] }),
  D("Quais tarefas de SDR a IA ainda faz mal?", "pergunta", "semente", "user", 9, "Mapear limites do [[Claude]] no dia a dia do [[Copiloto de SDR]].", { tags: ["ia"] }),

  D("“Se você não consegue prever, você não consegue crescer.”", "citacao", "broto", "user", 108, "Frase de [[Receita Previsível]] que resume a defesa de um [[Pipeline previsível]].", { tags: ["gestao"] }),

  D("Mapa: Vendas e IA", "moc", "perene", "user", 30, "Porta de entrada para tudo sobre vendas: [[Pipeline previsível]], [[Cadência de outbound]], [[Qualificação BANT]], [[IA em vendas]], [[Copiloto de SDR]] e [[RD Summit 2026]].", { tags: ["vendas", "ia"] }),
];

export const DEMO_LINKS: DemoLink[] = [
  // Livro, autor e evento
  { from: "Aaron Ross", to: "Receita Previsível", relation: "autor_de" },
  { from: "Juliana Prado", to: "RD Summit 2026", relation: "palestrante_em" },
  { from: "RD Station", to: "RD Summit 2026", relation: "relacionado" },
  { from: "Camila Duarte", to: "Acme Logística", relation: "relacionado" },
  { from: "Rafael Mendes", to: "RD Summit 2026", relation: "conheci_em" },
  { from: "Receita Previsível", to: "Pipeline previsível", relation: "menciona" },
  { from: "Receita Previsível", to: "Separar SDR e closer cria métricas claras", relation: "inspira" },
  { from: "“Se você não consegue prever, você não consegue crescer.”", to: "Receita Previsível", relation: "parte_de" },
  // Insights aprendidos no evento
  { from: "Oito toques superam três toques", to: "RD Summit 2026", relation: "aprendido_em" },
  { from: "Personalização escala com IA", to: "RD Summit 2026", relation: "aprendido_em" },
  { from: "Gestão por dados vence feeling", to: "RD Summit 2026", relation: "aprendido_em" },
  { from: "IA não substitui relacionamento", to: "RD Summit 2026", relation: "aprendido_em" },
  { from: "Resumo de reunião vira tarefa automática", to: "RD Summit 2026", relation: "aprendido_em" },
  { from: "Dados sujos matam a previsibilidade", to: "RD Summit 2026", relation: "aprendido_em" },
  // Conceitos
  { from: "Oito toques superam três toques", to: "Cadência de outbound", relation: "exemplo_de" },
  { from: "Cadência por canal", to: "Cadência de outbound", relation: "parte_de" },
  { from: "Follow-up em até cinco minutos", to: "Cadência de outbound", relation: "apoia" },
  { from: "ICP errado faz a cadência falhar", to: "Cadência de outbound", relation: "menciona" },
  { from: "ICP errado faz a cadência falhar", to: "Ideal Customer Profile (ICP)", relation: "menciona" },
  { from: "Lead sem orçamento consome o time", to: "Qualificação BANT", relation: "exemplo_de" },
  { from: "Quem pergunta mais, vende mais", to: "Qualificação BANT", relation: "apoia" },
  { from: "Qualificação BANT", to: "Ideal Customer Profile (ICP)", relation: "relacionado" },
  { from: "Prospecção é jogo de volume e qualidade", to: "Ideal Customer Profile (ICP)", relation: "apoia" },
  { from: "Playbook curto é usado; longo é ignorado", to: "Pipeline previsível", relation: "apoia" },
  { from: "Gestão por dados vence feeling", to: "Pipeline previsível", relation: "apoia" },
  { from: "Dados sujos matam a previsibilidade", to: "CRM", relation: "menciona" },
  { from: "CRM", to: "Pipeline previsível", relation: "apoia" },
  { from: "Separar SDR e closer cria métricas claras", to: "Pipeline previsível", relation: "apoia" },
  { from: "IA em vendas", to: "RD Summit 2026", relation: "aprendido_em" },
  { from: "Personalização escala com IA", to: "IA em vendas", relation: "exemplo_de" },
  { from: "IA não substitui relacionamento", to: "IA em vendas", relation: "relacionado" },
  { from: "Claude", to: "IA em vendas", relation: "exemplo_de" },
  // Projetos, ideias e tarefas
  { from: "Copiloto de SDR", to: "Acme Logística", relation: "relacionado" },
  { from: "Copiloto de SDR", to: "Claude", relation: "menciona" },
  { from: "Copiloto de SDR", to: "Cadência de outbound", relation: "apoia" },
  { from: "Resumo de reunião vira tarefa automática", to: "Copiloto de SDR", relation: "inspira" },
  { from: "Template de primeira linha personalizada", to: "Copiloto de SDR", relation: "parte_de" },
  { from: "Template de primeira linha personalizada", to: "Personalização escala com IA", relation: "exemplo_de" },
  { from: "Newsletter semanal de vendas com IA", to: "IA em vendas", relation: "relacionado" },
  { from: "Workshop de ICP para clientes", to: "Ideal Customer Profile (ICP)", relation: "apoia" },
  { from: "Curso: Vendas previsíveis com IA", to: "Receita Previsível", relation: "inspira" },
  { from: "Curso: Vendas previsíveis com IA", to: "IA em vendas", relation: "menciona" },
  { from: "Enviar proposta para Rafael Mendes", to: "Rafael Mendes", relation: "menciona" },
  { from: "Enviar proposta para Rafael Mendes", to: "Qualificação BANT", relation: "menciona" },
  { from: "Mapear ICP da Acme Logística", to: "Copiloto de SDR", relation: "parte_de" },
  { from: "Mapear ICP da Acme Logística", to: "Ideal Customer Profile (ICP)", relation: "menciona" },
  { from: "Retomar contato com Juliana Prado", to: "Juliana Prado", relation: "menciona" },
  { from: "Como medir a qualidade de uma cadência?", to: "Cadência de outbound", relation: "relacionado" },
  { from: "Quais tarefas de SDR a IA ainda faz mal?", to: "Copiloto de SDR", relation: "relacionado" },
  { from: "Camila Duarte", to: "Cadência de outbound", relation: "menciona" },
  { from: "Camila Duarte", to: "Claude", relation: "menciona" },
  // MOC
  ...["Pipeline previsível", "Cadência de outbound", "Qualificação BANT", "IA em vendas", "Copiloto de SDR", "RD Summit 2026"].map((t): DemoLink => ({ from: t, to: "Mapa: Vendas e IA", relation: "parte_de" })),
  // Sugestões da IA (aparecem em "Revisar")
  { from: "Prospecção é jogo de volume e qualidade", to: "Workshop de ICP para clientes", relation: "inspira", suggested: { confidence: 0.72, rationale: "Ambas tratam de afinar o ICP antes de aumentar o volume." } },
  { from: "Follow-up em até cinco minutos", to: "Resumo de reunião vira tarefa automática", relation: "relacionado", suggested: { confidence: 0.64, rationale: "Os dois falam de reduzir o tempo entre o contato e a próxima ação." } },
  { from: "Lead sem orçamento consome o time", to: "Dados sujos matam a previsibilidade", relation: "relacionado", suggested: { confidence: 0.58, rationale: "Qualificar mal gera dados ruins no funil." } },
  { from: "IA não substitui relacionamento", to: "Camila Duarte", relation: "menciona", suggested: { confidence: 0.69, rationale: "Camila combina IA com abordagem humana no time de SDR." } },
  { from: "Como medir a qualidade de uma cadência?", to: "Gestão por dados vence feeling", relation: "relacionado", suggested: { confidence: 0.75, rationale: "A pergunta pede exatamente o tipo de métrica que o insight defende." } },
];
