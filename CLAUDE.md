# JARVIS — segundo cérebro pessoal do Pedro (futuro SaaS)

## Produto
Captura (Telegram hoje; WhatsApp/e-mail depois; web/PWA) → notas atômicas conectadas → grafo estilo
Obsidian → conversa com a base (Jarvis, também via MCP). UI e notas em PT-BR.
Antes de mudanças estruturais leia docs/PRD.md, docs/ARCHITECTURE.md e docs/TAXONOMY.md.

## Estrutura
- `apps/web` — Next.js 16 (App Router, `proxy.ts` no lugar de middleware). Leia `apps/web/AGENTS.md`:
  esta versão do Next tem breaking changes; a doc local fica em `node_modules/next/dist/docs/`.
- `packages/core` — lógica pura e testável: taxonomia, schemas Zod da extração, plano de ingestão,
  entity resolution, wikilinks, limiares de link. Sem I/O.
- `supabase/migrations` — schema, RLS, busca híbrida, grafo, filas, lint. `supabase/tests` — testes SQL.

## Comandos
- `pnpm dev` · `pnpm test` (core + web) · `pnpm lint` · `pnpm typecheck` · `pnpm build`
- `supabase start` · `supabase db reset` (migrations + seed) · `supabase migration new <nome>`
- `psql "$DB_URL" -f supabase/tests/rls_and_functions.sql` — isolamento/RLS/funções
- `pnpm --filter web test:e2e` — e2e contra Supabase local com mocks de Telegram/Anthropic/OpenAI
- `pnpm eval:ingest` — golden set de extração (gasta tokens reais; precisa ANTHROPIC_API_KEY)

## Regras invioláveis
- TODA tabela de domínio tem `workspace_id NOT NULL` + RLS (`private.user_workspace_ids()`).
- `service_role` (lib/supabase/admin.ts) só no servidor e SEMPRE com `.eq("workspace_id", …)`.
- `sources` são imutáveis (trigger). Derivados vão em `normalized_text`/`metadata`.
- Notas da IA nascem `stage='semente'`, `created_by='ai'`. Links da IA com confiança < 0.8 nascem `suggested`.
- FTS sempre `'portuguese'`. Embeddings `text-embedding-3-small` 1536d (casa com `vector(1536)`).
- Prompts em `apps/web/lib/ai/prompts/*.ts`, com versão. Mudou prompt → rode `pnpm eval:ingest`.
- Provedores atrás de interfaces: `lib/ai/llm.ts`, `embed.ts`, `transcribe.ts`. Modelos por env, nunca fixos.
- Todo uso de IA passa por `recordUsage` (tabela `ai_usage`) — base de billing por workspace.
- Tools do Jarvis definidas uma vez em `lib/jarvis/tools.ts` (chat web, Telegram e MCP usam as mesmas).
- Histórico do chat é append-only (não edite mensagens antigas: quebra cache e thinking preservado).
- Funções SQL novas: `set search_path`, recebem `p_workspace`, e entram no `revoke/grant` de `…_grants.sql`.
- Após cada migration: `supabase db reset`, testes SQL e advisors de segurança (MCP do Supabase).

## Convenções
- Server actions em `app/(app)/actions.ts`; páginas usam `requireWorkspace()` (RLS + workspace).
- Componentes client só quando necessário (grafo, editor, chat, captura).
- Markdown renderizado por `lib/markdown.ts` (escapa HTML; wikilinks → `/notes/resolve?title=`).
- Mensagens ao usuário em PT-BR. Código e identificadores em inglês, comentários em PT-BR.

## Erros já cometidos (atualize sempre)
- Comparar `vector` dentro de função com `search_path=''` falha (operador não resolvido): use `embedded_at`.
- `auth.uid()` em testes SQL: defina `request.jwt.claims` (JSON com `sub`), não `request.jwt.sub`.
- Fila pgmq real usa tabelas `pgmq.q_<fila>`.
- MCP do Supabase: `apply_migration` com `drop`/`delete` pede confirmação e expira em 60 s; evite `drop` em migrations.
- Cores com alfa em arestas WebGL (Sigma) variam por GPU: use cores opacas pré-misturadas.
- Arquivos `"use server"` só podem exportar funções async.
- `after()` deve ser chamado no corpo do handler; para esperar um stream, use uma promise resolvida no fim dele.
- Filtrar PostgREST por texto muito longo (`.eq("raw_text", …)`) estoura a URL: filtre por id/data.
- `.neq()` em campo JSON exclui linhas com NULL: use `.or("campo.is.null,campo.neq.x")`.
