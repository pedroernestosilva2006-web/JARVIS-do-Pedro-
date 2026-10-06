-- =============================================================================
-- Fase 4: memória episódica (resumo das conversas com embedding) e brief no Telegram.
-- =============================================================================

alter table public.conversations
  add column if not exists embedding extensions.vector(1536),
  add column if not exists summarized_at timestamptz;
create index if not exists conversations_embedding_idx
  on public.conversations using hnsw (embedding extensions.vector_cosine_ops);

-- Conversas passadas relevantes para um assunto (memória episódica)
create or replace function public.match_conversations(
  p_workspace uuid,
  query_embedding extensions.vector(1536),
  match_count int default 3
)
returns table (id uuid, title text, summary text, updated_at timestamptz, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select c.id, c.title, c.summary, c.updated_at, 1 - (c.embedding <=> query_embedding)
  from conversations c
  where c.workspace_id = p_workspace and c.embedding is not null and c.summary is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
revoke execute on function public.match_conversations(uuid, extensions.vector, integer) from public, anon;
grant execute on function public.match_conversations(uuid, extensions.vector, integer) to authenticated, service_role;

-- Brief diário (7h BRT = 10h UTC) e semanal (domingo 19h BRT = 22h UTC) no Telegram
select cron.schedule('jarvis-brief-dia', '0 10 * * *', $$select private.invoke_worker('/api/workers/brief?periodo=dia')$$);
select cron.schedule('jarvis-brief-semana', '0 22 * * 0', $$select private.invoke_worker('/api/workers/brief?periodo=semana')$$);
