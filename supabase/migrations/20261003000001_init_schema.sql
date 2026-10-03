-- =============================================================================
-- JARVIS — schema inicial
-- Regras: toda tabela de domínio tem workspace_id NOT NULL + RLS.
-- Fontes (sources) são imutáveis. FTS sempre em 'portuguese'. Embeddings 1536d.
-- =============================================================================

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Multi-tenant
-- -----------------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Perfil fixo do dono (vai cacheado no system prompt do Jarvis)
  profile_md text not null default '',
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index on public.workspace_members (user_id);

-- Workspaces do usuário atual. SECURITY DEFINER evita recursão de RLS em workspace_members.
create or replace function private.user_workspace_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select workspace_id from public.workspace_members where user_id = (select auth.uid());
$$;
grant execute on function private.user_workspace_ids() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Camada 1: fontes brutas (imutáveis, padrão Karpathy)
-- -----------------------------------------------------------------------------
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  channel text not null check (channel in ('telegram', 'whatsapp', 'web', 'email', 'api')),
  kind text not null check (kind in ('audio', 'text', 'image', 'link', 'pdf')),
  idempotency_key text,
  raw_text text,                    -- texto original enviado (mensagem/legenda) — imutável
  normalized_text text,             -- derivado: transcrição / OCR / artigo extraído / PDF
  storage_path text,                -- arquivo no Supabase Storage (bucket 'captures'), gravado uma vez
  url text,
  metadata jsonb not null default '{}',
  context_note_id uuid,             -- contexto de sessão (/evento, /livro) no momento da captura
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'error')),
  error text,
  attempts int not null default 0,
  captured_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (workspace_id, channel, idempotency_key)
);
create index on public.sources (workspace_id, captured_at desc);
create index on public.sources (status) where status in ('pending', 'error');

-- Imutabilidade: o que o usuário enviou nunca muda. Só campos derivados/de controle
-- (normalized_text, metadata, status, erro, tentativas) e storage_path (uma única vez).
create or replace function private.sources_guard_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.workspace_id is distinct from old.workspace_id
     or new.channel is distinct from old.channel
     or new.kind is distinct from old.kind
     or (old.storage_path is not null and new.storage_path is distinct from old.storage_path)
     or new.url is distinct from old.url
     or new.captured_at is distinct from old.captured_at
     or (old.raw_text is not null and new.raw_text is distinct from old.raw_text) then
    raise exception 'sources são imutáveis (apenas campos derivados e de controle podem mudar)';
  end if;
  return new;
end $$;
create trigger sources_immutable before update on public.sources
  for each row execute function private.sources_guard_immutable();

-- -----------------------------------------------------------------------------
-- Camada 2: notas (entidades, insights, MOCs… o tipo define o papel)
-- -----------------------------------------------------------------------------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  type text not null check (type in (
    'evento', 'diario', 'pessoa', 'empresa', 'livro', 'conceito', 'ferramenta', 'lugar',
    'insight', 'citacao', 'pergunta', 'ideia', 'projeto', 'tarefa', 'moc')),
  title text not null,
  slug text not null,
  content_md text not null default '',
  summary text,
  properties jsonb not null default '{}',
  para_bucket text not null default 'recurso' check (para_bucket in ('projeto', 'area', 'recurso', 'arquivo')),
  stage text not null default 'semente' check (stage in ('semente', 'broto', 'perene')),
  aliases text[] not null default '{}',
  embedding extensions.vector(1536),
  embedded_at timestamptz,
  fts tsvector generated always as (
    setweight(to_tsvector('portuguese', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('portuguese', coalesce(content_md, '')), 'C')
  ) stored,
  -- Posição salva do layout do grafo (abre instantâneo)
  graph_x real,
  graph_y real,
  created_by text not null default 'user' check (created_by in ('user', 'ai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);
create index notes_embedding_idx on public.notes using hnsw (embedding extensions.vector_cosine_ops);
create index notes_fts_idx on public.notes using gin (fts);
create index notes_title_trgm_idx on public.notes using gin (title extensions.gin_trgm_ops);
create index on public.notes (workspace_id, type);
create index on public.notes (workspace_id, created_at desc);
create index on public.notes (workspace_id, stage) where stage = 'semente';

create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger notes_touch before update on public.notes
  for each row execute function private.touch_updated_at();

-- Conteúdo mudou → embedding fica obsoleto (o worker recalcula).
-- O worker sempre grava embedded_at junto com o embedding; é esse o sinal de "veio do worker".
create or replace function private.notes_invalidate_embedding()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.title, new.summary, new.content_md) is distinct from (old.title, old.summary, old.content_md)
     and new.embedded_at is not distinct from old.embedded_at then
    new.embedding = null;
    new.embedded_at = null;
  end if;
  return new;
end $$;
create trigger notes_invalidate_embedding before update on public.notes
  for each row execute function private.notes_invalidate_embedding();

-- Proveniência: qual fonte gerou qual nota
create table public.note_sources (
  workspace_id uuid not null references public.workspaces on delete cascade,
  note_id uuid not null references public.notes on delete cascade,
  source_id uuid not null references public.sources on delete cascade,
  excerpt text,
  primary key (note_id, source_id)
);
create index on public.note_sources (source_id);

-- Arestas do grafo (bidirecional na leitura)
create table public.links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  from_note uuid not null references public.notes on delete cascade,
  to_note uuid not null references public.notes on delete cascade,
  relation text not null default 'relacionado' check (relation in (
    'relacionado', 'menciona', 'aprendido_em', 'autor_de', 'palestrante_em', 'conheci_em',
    'apoia', 'contradiz', 'exemplo_de', 'parte_de', 'inspira')),
  origin text not null check (origin in ('wikilink', 'ai_entity', 'ai_semantic', 'manual')),
  confidence real check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'accepted' check (status in ('suggested', 'accepted', 'rejected')),
  rationale text,
  created_at timestamptz not null default now(),
  check (from_note <> to_note),
  unique (from_note, to_note, relation)
);
create index on public.links (workspace_id, to_note);
create index on public.links (workspace_id, from_note);
create index on public.links (workspace_id, status) where status = 'suggested';

-- Chunks para RAG de fontes longas (livros, transcrições de 1h)
create table public.chunks (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces on delete cascade,
  source_id uuid references public.sources on delete cascade,
  note_id uuid references public.notes on delete cascade,
  ordinal int not null default 0,
  content text not null,
  embedding extensions.vector(1536),
  fts tsvector generated always as (to_tsvector('portuguese', content)) stored
);
create index on public.chunks using hnsw (embedding extensions.vector_cosine_ops);
create index on public.chunks using gin (fts);
create index on public.chunks (workspace_id, source_id);

-- Tags
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  name text not null,
  color text,
  unique (workspace_id, name)
);
create table public.note_tags (
  workspace_id uuid not null references public.workspaces on delete cascade,
  note_id uuid not null references public.notes on delete cascade,
  tag_id uuid not null references public.tags on delete cascade,
  primary key (note_id, tag_id)
);
create index on public.note_tags (tag_id);

-- -----------------------------------------------------------------------------
-- Memória do Jarvis
-- -----------------------------------------------------------------------------
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  content text not null,
  kind text not null default 'preference' check (kind in ('preference', 'goal', 'fact', 'person')),
  embedding extensions.vector(1536),
  created_at timestamptz not null default now()
);
create index on public.memories using hnsw (embedding extensions.vector_cosine_ops);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  channel text not null default 'web',
  title text,
  summary text,                     -- memória episódica
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.conversations (workspace_id, updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  conversation_id uuid not null references public.conversations on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null,           -- blocos no formato da Messages API
  created_at timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at);

-- -----------------------------------------------------------------------------
-- Canais: identidade de canal → workspace, códigos de pareamento, contexto de sessão
-- -----------------------------------------------------------------------------
create table public.channel_identities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  channel text not null,
  external_user_id text not null,
  external_chat_id text,
  display_name text,
  created_at timestamptz not null default now(),
  unique (channel, external_user_id)
);

create table public.channel_link_codes (
  code text primary key,
  workspace_id uuid not null references public.workspaces on delete cascade,
  expires_at timestamptz not null default now() + interval '15 minutes',
  created_at timestamptz not null default now()
);

create table public.capture_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  channel text not null,
  external_user_id text not null,
  context_note_id uuid not null references public.notes on delete cascade,
  expires_at timestamptz not null default now() + interval '6 hours',
  created_at timestamptz not null default now()
);
create index on public.capture_sessions (channel, external_user_id, expires_at desc);

-- -----------------------------------------------------------------------------
-- Fila de revisão (entity resolution "pergunta", propostas do lint, merges)
-- -----------------------------------------------------------------------------
create table public.review_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  kind text not null check (kind in ('entity_match', 'duplicate', 'orphan', 'moc_proposal', 'contradiction', 'stale_seed')),
  payload jsonb not null default '{}',
  note_id uuid references public.notes on delete cascade,
  status text not null default 'open' check (status in ('open', 'accepted', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index on public.review_items (workspace_id, status, created_at desc);

-- -----------------------------------------------------------------------------
-- Observabilidade de custo de IA (billing/limites por plano no futuro)
-- -----------------------------------------------------------------------------
create table public.ai_usage (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces on delete cascade,
  provider text not null,
  model text not null,
  operation text not null,          -- extract | chat | embed | transcribe | vision | link_judge
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  units numeric not null default 0, -- ex.: minutos de áudio
  created_at timestamptz not null default now()
);
create index on public.ai_usage (workspace_id, created_at desc);

-- Tokens de API por workspace (servidor MCP remoto). Guardamos só o hash SHA-256.
create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  name text not null default 'MCP',
  token_hash text not null unique,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

create policy "membros veem seus workspaces" on public.workspaces
  for select to authenticated using (id in (select private.user_workspace_ids()));
create policy "owners editam workspace" on public.workspaces
  for update to authenticated using (
    exists (select 1 from public.workspace_members m
            where m.workspace_id = workspaces.id and m.user_id = (select auth.uid()) and m.role = 'owner'));

create policy "membros veem membros do workspace" on public.workspace_members
  for select to authenticated using (workspace_id in (select private.user_workspace_ids()));

-- Mesma policy para todas as tabelas de domínio com workspace_id
do $$
declare t text;
begin
  foreach t in array array[
    'sources', 'notes', 'note_sources', 'links', 'chunks', 'tags', 'note_tags',
    'memories', 'conversations', 'messages', 'channel_identities', 'channel_link_codes',
    'capture_sessions', 'review_items', 'ai_usage', 'api_tokens'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "membros acessam %1$s do workspace" on public.%1$I for all to authenticated
         using (workspace_id in (select private.user_workspace_ids()))
         with check (workspace_id in (select private.user_workspace_ids()))', t);
  end loop;
end $$;

-- ai_usage é escrito só pelo servidor; usuários apenas leem
drop policy "membros acessam ai_usage do workspace" on public.ai_usage;
create policy "membros leem ai_usage do workspace" on public.ai_usage
  for select to authenticated using (workspace_id in (select private.user_workspace_ids()));

-- =============================================================================
-- Bootstrap: cria (ou retorna) o workspace pessoal do usuário logado
-- =============================================================================
create or replace function public.bootstrap_workspace(p_name text default 'Meu cérebro')
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ws uuid;
begin
  if v_uid is null then
    raise exception 'não autenticado';
  end if;
  select workspace_id into v_ws from public.workspace_members
    where user_id = v_uid order by created_at limit 1;
  if v_ws is null then
    insert into public.workspaces (name) values (p_name) returning id into v_ws;
    insert into public.workspace_members (workspace_id, user_id, role) values (v_ws, v_uid, 'owner');
  end if;
  return v_ws;
end $$;
revoke execute on function public.bootstrap_workspace(text) from public, anon;
grant execute on function public.bootstrap_workspace(text) to authenticated;

-- Storage: bucket privado para áudios/fotos/PDFs; caminho = <workspace_id>/<arquivo>
insert into storage.buckets (id, name, public)
values ('captures', 'captures', false)
on conflict (id) do nothing;

create policy "membros leem arquivos do workspace" on storage.objects
  for select to authenticated using (
    bucket_id = 'captures'
    and (storage.foldername(name))[1] in (select w::text from private.user_workspace_ids() w));
