-- =============================================================================
-- Busca híbrida (FTS + pgvector, fundidos por Reciprocal Rank Fusion),
-- vizinhança no grafo, snapshot do grafo e timeline.
-- Todas as funções são SECURITY INVOKER: chamadas por usuários passam por RLS;
-- chamadas com service_role (workers) devem sempre passar p_workspace.
-- =============================================================================

create or replace function public.hybrid_search(
  p_workspace uuid,
  query_text text,
  query_embedding extensions.vector(1536) default null,
  match_count int default 10,
  p_types text[] default null,
  full_text_weight float default 1,
  semantic_weight float default 1,
  rrf_k int default 50
)
returns table (id uuid, type text, title text, slug text, summary text, stage text, created_at timestamptz, score float)
language sql stable
set search_path = public, extensions
as $$
with full_text as (
  select n.id,
         row_number() over (order by ts_rank_cd(n.fts, websearch_to_tsquery('portuguese', query_text)) desc) as rank_ix
  from notes n
  where n.workspace_id = p_workspace
    and (p_types is null or n.type = any (p_types))
    and n.fts @@ websearch_to_tsquery('portuguese', query_text)
  order by rank_ix
  limit least(match_count, 30) * 2
),
semantic as (
  select n.id,
         row_number() over (order by n.embedding <=> query_embedding) as rank_ix
  from notes n
  where query_embedding is not null
    and n.workspace_id = p_workspace
    and (p_types is null or n.type = any (p_types))
    and n.embedding is not null
  order by rank_ix
  limit least(match_count, 30) * 2
)
select n.id, n.type, n.title, n.slug, n.summary, n.stage, n.created_at,
       coalesce(1.0 / (rrf_k + ft.rank_ix), 0.0) * full_text_weight
     + coalesce(1.0 / (rrf_k + s.rank_ix), 0.0) * semantic_weight as score
from full_text ft
full outer join semantic s on ft.id = s.id
join notes n on n.id = coalesce(ft.id, s.id)
order by score desc
limit least(match_count, 30);
$$;

-- Vizinhos semânticos de um embedding (link-suggester, entity resolution, "notas relacionadas")
create or replace function public.match_notes(
  p_workspace uuid,
  query_embedding extensions.vector(1536),
  match_count int default 5,
  p_exclude uuid[] default '{}',
  p_types text[] default null
)
returns table (id uuid, type text, title text, summary text, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select n.id, n.type, n.title, n.summary, 1 - (n.embedding <=> query_embedding) as similarity
  from notes n
  where n.workspace_id = p_workspace
    and n.embedding is not null
    and not (n.id = any (p_exclude))
    and (p_types is null or n.type = any (p_types))
  order by n.embedding <=> query_embedding
  limit match_count;
$$;

-- Candidatos para entity resolution: alias exato, trigram no título e (opcional) embedding
create or replace function public.find_entity_candidates(
  p_workspace uuid,
  p_name text,
  p_type text,
  p_embedding extensions.vector(1536) default null,
  match_count int default 5
)
returns table (id uuid, title text, type text, aliases text[], trigram_similarity float, embedding_similarity float)
language sql stable
set search_path = public, extensions
as $$
  select n.id, n.title, n.type, n.aliases,
         similarity(lower(n.title), lower(p_name))::float as trigram_similarity,
         case when p_embedding is not null and n.embedding is not null
              then 1 - (n.embedding <=> p_embedding) end as embedding_similarity
  from notes n
  where n.workspace_id = p_workspace
    and n.type = p_type
    and (
      lower(n.title) % lower(p_name)
      or lower(p_name) = any (select lower(a) from unnest(n.aliases) a)
      or (p_embedding is not null and n.embedding is not null and (n.embedding <=> p_embedding) < 0.25)
    )
  order by greatest(
    similarity(lower(n.title), lower(p_name)),
    case when p_embedding is not null and n.embedding is not null then 1 - (n.embedding <=> p_embedding) else 0 end
  ) desc
  limit match_count;
$$;

-- Subgrafo local (travessia de 1..3 saltos, bidirecional)
create or replace function public.get_neighbors(
  p_workspace uuid,
  p_note uuid,
  p_depth int default 1,
  p_include_suggested boolean default false
)
returns table (id uuid, type text, title text, summary text, depth int)
language sql stable
set search_path = public
as $$
  with recursive walk(id, depth) as (
    select p_note, 0
    union
    select case when l.from_note = w.id then l.to_note else l.from_note end, w.depth + 1
    from walk w
    join links l on (l.from_note = w.id or l.to_note = w.id)
    where w.depth < least(greatest(p_depth, 1), 3)
      and l.workspace_id = p_workspace
      and (l.status = 'accepted' or (p_include_suggested and l.status = 'suggested'))
  )
  select n.id, n.type, n.title, n.summary, min(w.depth)::int as depth
  from walk w join notes n on n.id = w.id
  where n.workspace_id = p_workspace
  group by n.id, n.type, n.title, n.summary
  order by depth, n.title;
$$;

-- Snapshot leve para o grafo: só id/tipo/grau/x/y e arestas (conteúdo carregado sob demanda)
create or replace function public.graph_snapshot(
  p_workspace uuid,
  p_include_suggested boolean default true,
  p_types text[] default null,
  p_since timestamptz default null
)
returns jsonb
language sql stable
set search_path = public
as $$
  with ns as (
    select n.id, n.title, n.type, n.stage, n.para_bucket, n.graph_x, n.graph_y, n.created_at
    from notes n
    where n.workspace_id = p_workspace
      and (p_types is null or n.type = any (p_types))
      and (p_since is null or n.created_at >= p_since)
  ),
  es as (
    select l.id, l.from_note, l.to_note, l.relation, l.status, l.origin, l.rationale
    from links l
    where l.workspace_id = p_workspace
      and l.status <> 'rejected'
      and (p_include_suggested or l.status = 'accepted')
      and l.from_note in (select id from ns)
      and l.to_note in (select id from ns)
  ),
  deg as (
    select id, count(*)::int as degree from (
      select from_note as id from es where status = 'accepted'
      union all
      select to_note from es where status = 'accepted'
    ) d group by id
  )
  select jsonb_build_object(
    'nodes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ns.id, 'title', ns.title, 'type', ns.type, 'stage', ns.stage,
        'para', ns.para_bucket, 'degree', coalesce(deg.degree, 0),
        'x', ns.graph_x, 'y', ns.graph_y, 'created_at', ns.created_at))
      from ns left join deg on deg.id = ns.id), '[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', es.id, 'source', es.from_note, 'target', es.to_note,
        'relation', es.relation, 'status', es.status, 'origin', es.origin, 'rationale', es.rationale))
      from es), '[]'::jsonb)
  );
$$;

-- Salva posições do layout em lote: [{id, x, y}, ...]
create or replace function public.save_graph_positions(p_workspace uuid, p_positions jsonb)
returns void
language sql
set search_path = public
as $$
  update notes n
     set graph_x = (p->>'x')::real, graph_y = (p->>'y')::real
    from jsonb_array_elements(p_positions) p
   where n.id = (p->>'id')::uuid and n.workspace_id = p_workspace;
$$;

-- Timeline (visão "Calendar"): eventos/diário e o que foi capturado por período
create or replace function public.timeline(
  p_workspace uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_types text[] default null
)
returns table (id uuid, type text, title text, summary text, happened_at timestamptz, note_count int)
language sql stable
set search_path = public
as $$
  select n.id, n.type, n.title, n.summary,
         coalesce(
           case when (n.properties->>'data') ~ '^\d{4}-\d{2}-\d{2}' then (n.properties->>'data')::timestamptz end,
           n.created_at) as happened_at,
         (select count(*)::int from links l
           where l.to_note = n.id and l.relation = 'aprendido_em' and l.status = 'accepted') as note_count
  from notes n
  where n.workspace_id = p_workspace
    and (p_types is null or n.type = any (p_types))
    and coalesce(
          case when (n.properties->>'data') ~ '^\d{4}-\d{2}-\d{2}' then (n.properties->>'data')::timestamptz end,
          n.created_at) between p_from and p_to
  order by happened_at desc;
$$;

create or replace function public.match_memories(
  p_workspace uuid,
  query_embedding extensions.vector(1536),
  match_count int default 5
)
returns table (id uuid, content text, kind text, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select m.id, m.content, m.kind, 1 - (m.embedding <=> query_embedding)
  from memories m
  where m.workspace_id = p_workspace and m.embedding is not null
  order by m.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.match_chunks(
  p_workspace uuid,
  query_embedding extensions.vector(1536),
  match_count int default 8
)
returns table (id bigint, source_id uuid, note_id uuid, content text, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select c.id, c.source_id, c.note_id, c.content, 1 - (c.embedding <=> query_embedding)
  from chunks c
  where c.workspace_id = p_workspace and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- "Notas relacionadas" de uma nota (painel lateral, estilo Smart Connections)
create or replace function public.related_notes(p_workspace uuid, p_note uuid, match_count int default 6)
returns table (id uuid, type text, title text, summary text, similarity float, linked boolean)
language sql stable
set search_path = public, extensions
as $$
  select n.id, n.type, n.title, n.summary, 1 - (n.embedding <=> src.embedding) as similarity,
         exists (select 1 from links l
                 where (l.from_note = p_note and l.to_note = n.id) or (l.to_note = p_note and l.from_note = n.id)) as linked
  from notes src
  join notes n on n.workspace_id = src.workspace_id and n.id <> src.id and n.embedding is not null
  where src.id = p_note and src.workspace_id = p_workspace and src.embedding is not null
  order by n.embedding <=> src.embedding
  limit match_count;
$$;
