# PRD — JARVIS, o segundo cérebro do Pedro

## Visão
Um segundo cérebro alimentado por IA. O Pedro manda o que aprende (áudio depois de uma palestra, foto de
página de livro, link, ideia solta) e o sistema transforma cada entrada em **notas atômicas conectadas**,
visíveis num **grafo estilo Obsidian**, e conversa com a base para gerar **ação** (posts, scripts de vendas,
pautas, preparação de reuniões). Nasce pessoal e vira produto multiusuário sem reescrita.

## Persona principal
**Pedro Ernesto**: empreendedor, especialista em IA aplicada a vendas B2B. Vai a muitos eventos, lê
livros de vendas e gestão, tem muitas ideias de produto e conteúdo. Problema: o que aprende se perde em áudios,
fotos e anotações espalhadas, e nunca vira ação.

**Persona futura (SaaS)**: profissionais do conhecimento (vendedores, consultores, fundadores) que querem um
PKM que se organiza sozinho, sem manter pastas e tags na mão.

## Princípios
1. **Captura sem atrito.** Mandar uma mensagem no Telegram é o fluxo principal. Nada de formulários.
2. **A IA organiza e destila; o Pedro captura e expressa** (fluxo CODE de Tiago Forte).
3. **Notas atômicas, títulos-afirmação, links valem mais que pastas** (Zettelkasten + Evergreen notes).
4. **A estrutura se conquista** ("structure must be earned", Nick Milo). Poucos tipos; MOCs surgem de clusters.
5. **Grafo confiável > grafo grande.** Links incertos nascem como sugestão e passam por revisão humana.
6. **Proveniência sempre.** Toda nota da IA aponta para o trecho literal da fonte.

## Escopo por fase (estado atual)
| Fase | Entregas | Estado |
|---|---|---|
| 0. Fundação | PRD, taxonomia, CLAUDE.md, schema + RLS, auth, deploy | ✅ código pronto (deploy pendente) |
| 1. Captura + notas | Bot Telegram (texto/áudio/foto/link/PDF), pipeline, notas atômicas, entidades, Inbox, editor com wikilinks/backlinks | ✅ |
| 2. Busca + Jarvis | Embeddings automáticos, busca híbrida RRF, chat com tools e citações, perfil cacheado, `/p` no Telegram | ✅ |
| 3. Grafo | Grafo global Sigma (cores, tamanho, filtros, comunidades), foco local, timeline, sugestões destacadas | ✅ |
| 4. Inteligência contínua | Link-suggester com relações tipadas, lint semanal, MOCs propostos, servidor MCP, brief diário/semanal, exportação Markdown (Obsidian), fontes longas com RAG, memória episódica, autocomplete `[[` | ✅ (backup automático em git ⏳) |
| 5. Multicanal + "JARVIS" | WhatsApp, e-mail, share target PWA, voz bidirecional, grafo 3D, modo "preparar reunião" | ⏳ |
| 6. Produto (SaaS) | Onboarding, convites, billing, limites por plano, LGPD, Vercel Pro | ⏳ (base pronta: workspaces, RLS, `ai_usage`) |

## Requisitos funcionais (MVP)
- **RF1** Capturar texto, áudio (até 20 MB no Telegram, 25 MB na transcrição), foto, link e PDF.
- **RF2** Contexto de sessão: `/evento <nome>` e `/livro <título>` ligam as próximas 6 h de capturas.
- **RF3** Extrair entidades, insights atômicos, citações, ideias e tarefas, com trecho de evidência.
- **RF4** Entity resolution: reusar (≥ 0,9), perguntar (0,75–0,9) ou criar.
- **RF5** Links determinísticos (aprendido_em, palestrante_em, autor_de, menciona) e semânticos (top-5, 0,80/0,70).
- **RF6** Inbox: sementes, conexões sugeridas (aceitar/rejeitar), decisões de merge e MOCs.
- **RF7** Editor markdown com `[[wikilinks]]` (sincroniza links; alvo inexistente vira stub), backlinks, relacionadas.
- **RF8** Grafo: cor por tipo/comunidade, tamanho ∝ √grau, fade de rótulos, hover, filtros, "ver crescer", posições salvas.
- **RF9** Chat com tools (busca híbrida + 1 salto no grafo), citações `[[Título]]`, confirmação para escrita.
- **RF10** Mesmas tools via servidor MCP remoto com token por workspace.
- **RF11** Lint semanal: duplicatas, órfãs, clusters sem MOC, lembrete de sementes antigas.
- **RF12** Brief diário/semanal no Telegram com aprendizados, conexões, pendências e uma sugestão "Express".
- **RF13** Exportação completa para Markdown compatível com Obsidian (frontmatter + conexões `relação:: [[Nota]]`).
- **RF14** Fontes longas: chunks para RAG e extração em partes; memória episódica das conversas.

## Requisitos não funcionais
- Isolamento total entre workspaces (RLS + testes automatizados).
- Webhooks idempotentes; filas com retry (pgmq, até 3 tentativas).
- Custo pessoal alvo: US$ 20–50/mês. Uso de IA registrado por workspace.
- UI responsiva (celular é o principal dispositivo de captura).

## Métricas de sucesso (30 dias de uso)
- ≥ 5 capturas/semana; ≥ 70% das sementes revisadas em 7 dias.
- ≥ 60% dos links sugeridos aceitos (calibração dos limiares).
- ≥ 1 "Express" por semana (post, script, pauta) gerado a partir do Jarvis.
