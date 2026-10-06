# Taxonomia

Fonte única no código: `packages/core/src/taxonomy.ts`. Três dimensões ortogonais em vez de uma árvore de pastas.

## A. Tipo de nó (`notes.type`): o que a coisa é

| Camada | Tipos | Exemplo |
|---|---|---|
| Contexto/tempo | `evento`, `diario` | "RD Summit 2026", "2026-10-02" |
| Entidades | `pessoa`, `empresa`, `livro`, `conceito`, `ferramenta`, `lugar` | "Aaron Ross", "Receita Previsível" |
| Conhecimento | `insight`, `citacao`, `pergunta` | "Cadência de 8 toques supera 3 toques em outbound B2B" |
| Ação | `ideia`, `projeto`, `tarefa` | "SDR de IA para clínicas" |
| Navegação | `moc` | "MOC: Prospecção Outbound" |

As fontes brutas (áudio, foto, link, PDF, texto) **não são notas**: ficam em `sources` (imutáveis) e
ligam-se às notas por `note_sources` (proveniência com trecho literal).

Propriedades típicas (`notes.properties`):
- `evento`: `data` (YYYY-MM-DD), `local`, `organizador`
- `livro`: `autor`, `isbn`, `status_leitura` (lendo/lido/quero ler), `nota`
- `projeto`: `status` (ativo/pausado/concluído)
- `tarefa`: `feito` (bool)

## B. Eixo PARA (`para_bucket`): acionabilidade
`projeto` · `area` · `recurso` · `arquivo`. Áreas sugeridas: Vendas & IA, Negócios/Empreendedorismo,
Liderança & Gestão, Marketing & Conteúdo, Saúde & Performance, Finanças, Relacionamentos.

## C. Maturidade (`stage`)
`semente` (capturada, não revisada) → `broto` (revisada ou ligada) → `perene` (reescrita com suas palavras e
usada em algo). **Toda nota da IA nasce semente.**

## Relações tipadas (`links.relation`)

| Relação | Direção | Origem típica |
|---|---|---|
| `aprendido_em` | insight/citação/ideia → evento/livro | extração (contexto) |
| `palestrante_em` | pessoa → evento | extração (role contém "palestr…") |
| `conheci_em` | pessoa → evento | extração (outras pessoas no evento; confiança 0,75 → sugerida) |
| `autor_de` | pessoa → livro | extração (contexto de livro / role "autor") |
| `menciona` | nota → entidade | extração (`related_entities`) e `[[wikilinks]]` |
| `apoia` / `contradiz` / `exemplo_de` / `inspira` | nota → nota | juiz de links (camada 3) |
| `parte_de` | nota → MOC | MOC proposto pelo lint / manual |
| `relacionado` | nota ↔ nota | similaridade semântica / tarefas do contexto |

`links.origin`: `wikilink` | `ai_entity` | `ai_semantic` | `manual`.
`links.status`: `suggested` (confiança < 0,8 ou limiar semântico entre 0,70 e 0,80) | `accepted` | `rejected`.

## Regras de atomização (vão no prompt de extração)
1. **Uma ideia por nota.** Cinco ideias na captura geram cinco insights.
2. **Título é uma afirmação completa**, como uma API ("Objeção de preço esconde objeção de valor"), não um tema ("Objeções").
3. **PT-BR, nas palavras do Pedro** quando a captura for dele; limpar vícios de fala sem mudar o sentido.
4. **Nunca inventar**: `evidence_excerpt` é trecho literal da fonte (o eval verifica).
5. **Sempre "como aplicar"** (Express): uma frase prática para vendas/IA/negócio, ou `null`.
6. Entidades com nome canônico completo; nada genérico demais ("vendas", "pessoas").

### Exemplos (vendas/IA)
| Captura (trecho) | Insight atômico (título) | Relações |
|---|---|---|
| "a maioria responde depois do quarto toque" (áudio no RD Summit) | Cadência de 8 toques supera 3 toques em outbound B2B | `aprendido_em` RD Summit · `menciona` Aaron Ross |
| "quando o cliente fala de preço, faltou implicação" (SPIN Selling) | Objeção de preço esconde objeção de valor | `aprendido_em` SPIN Selling · `apoia` "Perguntas de implicação…" |
| "separar SDR de closer dá métrica por etapa" (Receita Previsível) | Especializar SDR, closer e CS aumenta a previsibilidade | `aprendido_em` Receita Previsível · `parte_de` MOC Prospecção |
| "sem CRM limpo a IA personaliza errado" (painel de IA) | IA de prospecção amplifica a qualidade (ou a sujeira) do CRM | `contradiz` "IA dobra a taxa de resposta" |
| "lead respondido em 1 h tem 7x mais chance" (artigo HBR) | Responder o lead em até 1 hora multiplica a qualificação | `inspira` projeto "SDR de IA para clínicas" |

## Evolução ("structure must be earned")
- Comece com estes tipos. O lint propõe MOC quando um cluster (Louvain) passa de 7 notas sem MOC.
- Tipos novos só quando um padrão se repetir em dados reais. No SaaS, a taxonomia vira configurável por workspace
  (tabela `note_types` com cor, ícone e schema de propriedades).
