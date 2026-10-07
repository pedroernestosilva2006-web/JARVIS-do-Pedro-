# JARVIS — segundo cérebro pessoal do Pedro (futuro SaaS)

## Produto
Captura (Telegram hoje; WhatsApp/e-mail depois; web/PWA) → notas atômicas conectadas → grafo estilo
Obsidian → conversa com a base (Jarvis, também via MCP). UI e notas em PT-BR.
Antes de mudanças estruturais leia docs/PRD.md, docs/ARCHITECTURE.md e docs/TAXONOMY.md.

## Estrutura
- `apps/web` — Next.js 16 (App Router, `proxy.ts` no lugar de middleware). Leia `apps/web/AGENTS.md`:
  esta versão do Next tem breaking changes; a doc local fica em `node_modules/next/dist/docs/`.
  Direção de produto: **o grafo é o produto; o resto é camada por cima.** Home = Cérebro (`/graph`, tela cheia);
  rail de ícones (celular: abas inferiores); barra de comando Ctrl/Cmd+K (capturar · buscar · pular · perguntar);
  gaveta "Revisar (N)" no lugar da Inbox; dock do Jarvis (tecla J); listas (Notas/Timeline/Arquivos) = lista + leitura.
- `packages/core` — lógica pura e testável: taxonomia, schemas Zod da extração, plano de ingestão,
  entity resolution, wikilinks, limiares de link. Sem I/O.
- `supabase/migrations` — schema, RLS, busca híbrida, grafo, filas, lint. `supabase/tests` — testes SQL.

## Comandos
- `pnpm dev` · `pnpm test` (core + web) · `pnpm lint` · `pnpm typecheck` · `pnpm build`
- `supabase start` · `supabase db reset` (migrations + seed) · `supabase migration new <nome>`
- `psql "$DB_URL" -f supabase/tests/rls_and_functions.sql` — isolamento/RLS/funções
- `pnpm --filter web test:e2e` — dois e2e contra Supabase local com mocks (com login; e modo interno + AI Gateway sem OpenAI)
- `pnpm eval:ingest` — golden set de extração (gasta tokens reais; precisa ANTHROPIC_API_KEY)

## Regras invioláveis
- TODA tabela de domínio tem `workspace_id NOT NULL` + RLS (`private.user_workspace_ids()`).
- `service_role` (lib/supabase/admin.ts) só no servidor e SEMPRE com `.eq("workspace_id", …)`.
- `sources` são imutáveis (trigger). Derivados vão em `normalized_text`/`metadata`.
- Notas da IA nascem `stage='semente'`, `created_by='ai'`. Links da IA com confiança < 0.8 nascem `suggested`.
- FTS sempre `'portuguese'`. Embeddings `text-embedding-3-small` 1536d (casa com `vector(1536)`).
- Prompts em `apps/web/lib/ai/prompts/*.ts`, com versão. Mudou prompt → rode `pnpm eval:ingest`.
- IA: `lib/ai/provider.ts` escolhe Anthropic direta ou Vercel AI Gateway; embeddings são opcionais (`embeddingsConfigured`). Fallback server-side/effort só na API direta.
- Provedores atrás de interfaces: `lib/ai/llm.ts`, `embed.ts`, `transcribe.ts`. Modelos por env, nunca fixos.
- Todo uso de IA passa por `recordUsage` (tabela `ai_usage`) — base de billing por workspace.
- Tools do Jarvis definidas uma vez em `lib/jarvis/tools.ts` (chat web, Telegram e MCP usam as mesmas).
- Histórico do chat é append-only (não edite mensagens antigas: quebra cache e thinking preservado).
- Funções SQL novas: `set search_path`, recebem `p_workspace`, e entram no `revoke/grant` de `…_grants.sql`.
- Após cada migration: `supabase db reset`, testes SQL e advisors de segurança (MCP do Supabase).

## Arquivos
- Upload SEMPRE direto ao Storage por URL assinada (`/api/files/sign` → `uploadToSignedUrl` → `/api/files/commit`); a Vercel limita o corpo a ~4,5 MB. Catálogo na tabela `attachments` (`workspace_id` + RLS); caminho `${workspace}/files/${uuid}-${nome-seguro}`.
- Regras puras em `lib/files/rules.ts` (limite 50 MB, nome seguro, o que o Jarvis consegue analisar).
- Painel da nota: `components/note/NotePanel.tsx` ← `/api/notes/[id]` (usado no Cérebro como painel lateral direito e nas listas como coluna de leitura). Eventos (`lib/ui-events.ts`): `jarvis:changed|palette|dock|review|focus|local|toast`.
- Grafo: `components/graph/GraphView.tsx` (Sigma + Graphology; layout d3-force em `lib/graph/layout.ts` com as 4 forças do Obsidian) e painel `GraphSettingsPanel` (Filtros · Grupos · Exibição · Forças, guardado em localStorage). Consultas de grupo/filtro e grafo local são puras em `packages/core/src/graph.ts`.
- Dados de exemplo (~40 notas, `properties.demo`): `lib/demo/data.ts` + `loadDemoDataAction`/`clearDemoDataAction`.
- Status de integrações (semáforo em Ajustes): `lib/integrations.ts` — só nomes de variáveis, nunca valores.

## Acesso
- Uso interno: **sem login por padrão** (`lib/access.ts` → `getAppContext()`; `JARVIS_REQUIRE_LOGIN=1` volta a exigir). No modo interno o app usa o cliente de serviço, então TODA consulta precisa filtrar `workspace_id`.
- Toda rota/página obtém usuário e workspace por `getAppContext()`/`requireWorkspace()`; nunca chame `auth.getUser()` direto.

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
- ForceAtlas2 sem `strongGravityMode` espalha componentes desconectados; e a câmera precisa de `animatedReset` após o layout.
- Visual: tokens em `globals.css` (Obsidian escuro `#1e1e1e` + UM acento roxo `#8b6cef`; texto sobre o acento é ESCURO — branco não passa AA), classes `.surface`, `.btn-primary/-outline/-ghost`, `.field`, `.chip`, `.kbd`, `.skeleton`. Sentence case, sem caixa alta. O roxo é reservado à interface (seleção, foco, sugestões da IA): não use roxo nas cores de tipo (`TYPE_COLORS`).
- CSS não-camadado vence utilitários do Tailwind (`outline-none` perdia para `:focus-visible` global): regras globais vão em `@layer base`.
- Sigma/WebGL só pode ser importado no navegador: `import("sigma")` e `import("sigma/rendering")` dentro de efeito (import estático quebra o SSR com `WebGL2RenderingContext is not defined`).
- `redirect()` em página com `loading.tsx` já saiu com 200 (shell em streaming): redirecionamentos de endereços antigos ficam em `next.config.ts` (`redirects()`), onde são 307 de verdade.
- `resolveOwner()` (modo interno) precisa compartilhar a busca em andamento: layout + página + APIs na primeira abertura criavam um workspace cada.
- Servidor de e2e órfão (`next start` na porta 3100/3101) faz o próximo e2e falar com o app errado: `fuser -k 3100/tcp 3101/tcp` antes.
- Overlays fixos dentro de elementos com `backdrop-filter`/`transform` ficam presos ao elemento: use `createPortal(document.body)`.
- `try/catch` ao redor de `cookies()`/APIs dinâmicas engole o sinal do Next e a página é pré-renderizada no build (quebra sem env e congela dados): chame `await connection()` antes do try. Valide com um build limpo sem env (`env -i … next build`).
- Arquivos `"use server"` só podem exportar funções async.
- `after()` deve ser chamado no corpo do handler; para esperar um stream, use uma promise resolvida no fim dele.
- Filtrar PostgREST por texto muito longo (`.eq("raw_text", …)`) estoura a URL: filtre por id/data.
- `.neq()` em campo JSON exclui linhas com NULL: use `.or("campo.is.null,campo.neq.x")`.
