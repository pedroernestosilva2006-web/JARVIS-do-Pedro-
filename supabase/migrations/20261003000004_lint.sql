-- =============================================================================
-- Lint do grafo (operação "lint" do LLM Wiki de Karpathy), usado pelo job semanal.
-- =============================================================================

-- Entidades do mesmo tipo com nomes muito parecidos ("Aaron Ross" × "Aaron Ross (autor)")
create or replace function public.lint_duplicate_entities(p_workspace uuid, p_min_similarity float default 0.6)
returns table (a_id uuid, a_title text, b_id uuid, b_title text, type text, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select a.id, a.title, b.id, b.title, a.type, similarity(lower(a.title), lower(b.title))::float
  from notes a
  join notes b on b.workspace_id = a.workspace_id and b.type = a.type and a.id < b.id
  where a.workspace_id = p_workspace
    and a.type in ('pessoa', 'empresa', 'livro', 'conceito', 'ferramenta', 'lugar', 'evento')
    and lower(a.title) % lower(b.title)
    and similarity(lower(a.title), lower(b.title)) >= p_min_similarity
  order by 6 desc
  limit 50;
$$;

-- Notas sem nenhuma ligação aceita (órfãs), mais velhas que p_min_age
create or replace function public.lint_orphans(p_workspace uuid, p_min_age interval default '1 day')
returns table (id uuid, title text, type text, created_at timestamptz)
language sql stable
set search_path = public
as $$
  select n.id, n.title, n.type, n.created_at
  from notes n
  where n.workspace_id = p_workspace
    and n.created_at < now() - p_min_age
    and n.type not in ('tarefa', 'diario')
    and not exists (
      select 1 from links l
      where l.status = 'accepted' and (l.from_note = n.id or l.to_note = n.id))
  order by n.created_at desc
  limit 50;
$$;

-- Funde a nota B na nota A: move links e proveniência, guarda o título de B como alias e apaga B
create or replace function public.merge_notes(p_workspace uuid, p_keep uuid, p_merge uuid)
returns void
language plpgsql
set search_path = public
as $$
declare v_title text;
begin
  if p_keep = p_merge then return; end if;
  select title into v_title from notes where id = p_merge and workspace_id = p_workspace;
  if v_title is null then raise exception 'nota a fundir não encontrada'; end if;
  perform 1 from notes where id = p_keep and workspace_id = p_workspace;
  if not found then raise exception 'nota destino não encontrada'; end if;

  -- links: reaponta, ignorando os que virariam duplicados ou laços
  update links set from_note = p_keep
   where from_note = p_merge and workspace_id = p_workspace and to_note <> p_keep
     and not exists (select 1 from links x where x.from_note = p_keep and x.to_note = links.to_note and x.relation = links.relation);
  update links set to_note = p_keep
   where to_note = p_merge and workspace_id = p_workspace and from_note <> p_keep
     and not exists (select 1 from links x where x.to_note = p_keep and x.from_note = links.from_note and x.relation = links.relation);

  insert into note_sources (workspace_id, note_id, source_id, excerpt)
  select workspace_id, p_keep, source_id, excerpt from note_sources where note_id = p_merge
  on conflict do nothing;

  update notes set aliases = (select array(select distinct unnest(aliases || array[v_title]
                     || (select aliases from notes where id = p_merge))))
   where id = p_keep;

  delete from notes where id = p_merge and workspace_id = p_workspace; -- cascata limpa o resto
end $$;
