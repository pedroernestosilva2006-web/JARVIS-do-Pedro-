# Arquitetura

```mermaid
flowchart LR
  subgraph Canais
    TG[Telegram Bot] -->|webhook + secret| WH[/api/capture/telegram/]
    WEB[Web/PWA] --> WC[/api/capture/web/]
  end
  WH --> SRC[(sources)]
  WC --> SRC
  SRC -- trigger --> QC[[pgmq: captures]]
  CRON[pg_cron 1/min] -- pg_net + Vault --> DR[/api/workers/drain/]
  WH -. after() .-> DR
  QC --> DR
  DR --> PIPE[Pipeline de ingestão]
  PIPE -->|normalizar| AI1[Transcrição · Vision · PDF · Readability]
  PIPE -->|extrair| HAIKU[Claude Haiku 4.5<br/>structured outputs]
  PIPE -->|plano + entity resolution| CORE[@jarvis/core]
  PIPE --> NOTES[(notes · links · note_sources)]
  NOTES -- trigger --> QE[[pgmq: embeddings]]
  QE --> DR
  DR --> EMB[Embeddings 1536d] --> LS[Link-suggester<br/>top-k + juiz Haiku]
  LS --> NOTES
  PIPE -->|resumo| TG
  subgraph App Next.js
    UI[Inbox · Notas · Grafo Sigma · Timeline · Chat]
    CHAT[/api/chat/] --> AG[Jarvis: Claude Sonnet 5.5 + tools]
    MCP[/api/mcp/] --> TOOLS[lib/jarvis/tools.ts]
    AG --> TOOLS
  end
  TOOLS --> SEARCH[hybrid_search RRF · get_neighbors · timeline]
  SEARCH --> NOTES
  CC[Claude Code / Desktop] -->|MCP HTTP + token| MCP
  LINT[pg_cron semanal] --> LW[/api/workers/lint/] --> REV[(review_items)]
  BRIEF[pg_cron diário/semanal] --> BW[/api/workers/brief/] --> TG
  UI --> EXP[/api/export/ → vault Obsidian .zip/]
```

## Camadas (padrão LLM Wiki de Karpathy)
1. **Fontes brutas imutáveis**: tabela `sources` (trigger bloqueia alterações no que o usuário enviou).
2. **Wiki mantido pelo LLM**: `notes` + `links` + `note_sources` (proveniência com trecho literal).
3. **Schema**: `docs/TAXONOMY.md` + prompts versionados em `apps/web/lib/ai/prompts`.

Operações: **ingest** (pipeline), **query** (Jarvis/MCP), **lint** (job semanal).

## Fluxo de uma captura
1. Webhook valida o `secret_token`, mapeia `telegram_user_id → workspace` (`channel_identities`) e grava
   `sources` com `idempotency_key = tg:<chat>:<message_id>`. O trigger enfileira em `captures`.
2. O worker (via `after()` no webhook e via pg_cron a cada minuto) lê a fila (`read_jobs`, visibility timeout de 300 s).
3. **Normalização**: áudio → transcrição (OpenAI, interface `transcribe.ts`); imagem → Claude vision; PDF →
   suporte nativo a PDF; link → extração de texto legível. O resultado vai em `sources.normalized_text`.
4. **Extração**: Haiku 4.5 com structured outputs no schema `ExtractedKnowledge` (`packages/core`).
5. **Plano** (`buildIngestPlan`, função pura): notas planejadas + links tipados com chaves locais.
6. **Entity resolution**: `find_entity_candidates` (alias + trigram + embedding) → `resolveEntity` decide
   reusar/perguntar/criar. "Perguntar" cria a nota e abre um `review_items(entity_match)`.
7. Persistência com `note_sources.excerpt` e links `ai_entity` (confiança 0,9 → aceitos).
8. Resposta no canal: "Registrei em "RD Summit 2026": 2 insights, 1 pessoa…".
9. Trigger em `notes` enfileira `embeddings`; o worker gera embeddings em lote e roda o link-suggester
   (`match_notes` top-5 → limiares 0,80/0,70 → juiz Haiku decide a relação e escreve o `rationale`).

## Fase 4: fontes longas, memória e saída
- **Fontes longas** (> 8 mil caracteres): o texto normalizado vira `chunks` de ~2 mil caracteres com embedding
  (RAG, retornado como `source_passages` por `search_knowledge`), e a extração roda em partes de 24 mil
  caracteres. A entity resolution junta as entidades repetidas entre as partes.
- **Memória em três níveis**: perfil fixo (system prompt cacheado), `memories` (fatos duráveis, tool `remember`)
  e **episódica**: depois de cada resposta do chat, `after()` resume a conversa (Haiku) e grava resumo e
  embedding em `conversations`. A tool `recall` consulta memórias e conversas passadas (`match_conversations`).
- **Brief**: `buildBrief` junta as notas do período, as conexões criadas e as pendências, e o Haiku escreve o texto para o
  Telegram. Não envia nada se não houve notas novas.
- **Exportação**: `buildVaultZip` gera `<Tipo>/<Título>.md` com frontmatter YAML e conexões em campos inline
  (Dataview). Títulos repetidos ganham sufixo e o título original vira alias.

## Decisões (ADRs)

### ADR-001: Supabase + Next.js na Vercel em vez de local-first
**Contexto**: capturar via bots exige servidor sempre online; o futuro SaaS exige multiusuário.
**Decisão**: Postgres (Supabase) resolve relacional, vetorial (pgvector), full-text, filas (pgmq), cron, storage e
auth num só lugar, e o RLS dá isolamento nativo. Local-first (Markdown) fica como **formato de exportação** (Fase 4).
**Consequência**: dados na nuvem, custo fixo baixo (Supabase Pro US$ 25).

### ADR-002: Sigma.js + Graphology para o grafo
**Contexto**: o grafo precisa aguentar anos de uso (≥ 10 mil notas) com visual Obsidian.
**Decisão**: Sigma v3 (WebGL) + Graphology (ForceAtlas2 em web worker, Louvain). Usamos o Sigma direto
(sem wrapper React) para controlar reducers e eventos num único efeito.
**Alternativas**: react-force-graph (MVP rápido, modo 3D para a Fase 5), Cytoscape (análises no grafo local).
**Consequência**: arestas tracejadas não são nativas no Sigma, então sugestões da IA aparecem em roxo
(e podem ser escondidas). Cores opacas por compatibilidade entre GPUs.

### ADR-003: Telegram primeiro
Gratuito, oficial, sem risco de banimento e com suporte a voz/foto/documento. WhatsApp vem na Fase 5
(Evolution API só para uso pessoal; Cloud API oficial para clientes). Canais entram como adaptadores
(`NormalizedCapture`), sem tocar no pipeline.

### ADR-004: Workers em Next.js (rotas `/api/workers/*`) em vez de Edge Functions
**Contexto**: o plano original previa Edge Functions (Deno) para os workers.
**Decisão**: o pipeline roda nas rotas do Next.js, acionadas por `after()` logo após o webhook e por
**pg_cron + pg_net** a cada minuto (URL e segredo no **Vault**). O padrão de filas é o mesmo dos
"automatic embeddings" do Supabase (trigger → pgmq → worker em lote).
**Por quê**: um só código TypeScript (o pipeline reusa `@jarvis/core`, os mesmos tipos e testes), deploy
único na Vercel e e2e local simples. **Trade-off**: depende do `maxDuration` da Vercel (300 s); capturas
muito longas (áudio de 1 h) podem exigir mover o worker para Edge Function ou fila dedicada no futuro.

### ADR-005: Entidades são notas
Pessoa, livro e evento são notas com `type` + `properties`. Tudo aparece no grafo naturalmente. Se surgirem
consultas pesadas, criamos views depois.

### ADR-006: Structured outputs para extração e tool use manual no chat
A extração usa `messages.parse` + `zodOutputFormat` (schema garantido). O chat usa um loop agêntico manual com
streaming, histórico append-only persistido em `messages` e prompt caching em dois blocos (regras + perfil).
O fallback server-side fica ligado para os modelos que o suportam.

### ADR-007: Servidor MCP mínimo e stateless
JSON-RPC 2.0 sobre Streamable HTTP com respostas JSON (sem SSE), com `initialize`, `tools/list` e `tools/call`. Token
por workspace (só o hash SHA-256 fica no banco). As tools são as mesmas do chat.

## Segurança
- RLS em todas as tabelas de domínio via `private.user_workspace_ids()` (SECURITY DEFINER, evita recursão).
- `anon` sem privilégios no schema `public`; funções de dados só para `authenticated`/`service_role`.
- Filas (`enqueue_job`, `read_jobs`…) só `service_role`.
- Webhook do Telegram: `X-Telegram-Bot-Api-Secret-Token` com comparação em tempo constante.
- Workers: `Authorization: Bearer CRON_SECRET`. MCP: token por workspace.
- Markdown renderizado com escape total de HTML (testes contra XSS).
- Storage privado (`captures/<workspace_id>/…`).

## Escala
- pgvector + HNSW atende bem até ~1 milhão de vetores; depois, avaliar compute maior/banco dedicado.
- `graph_snapshot` devolve só id/tipo/grau/x/y; conteúdo sob demanda. Posições salvas evitam recalcular o layout.
- Para > 20 mil nós: testar com dados sintéticos (ver "Erros já cometidos" no CLAUDE.md) e considerar
  paginação por comunidade.
