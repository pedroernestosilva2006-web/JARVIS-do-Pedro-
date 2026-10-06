-- =============================================================================
-- Privilégios explícitos (defesa em profundidade, não dependemos de default privileges):
-- anon não acessa nada do domínio; authenticated passa pelo RLS; service_role é dos workers.
-- =============================================================================
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Funções de dados: só usuários logados (RLS) e workers
do $$
declare f text;
begin
  foreach f in array array[
    'public.hybrid_search(uuid, text, extensions.vector, integer, text[], double precision, double precision, integer)',
    'public.match_notes(uuid, extensions.vector, integer, uuid[], text[])',
    'public.find_entity_candidates(uuid, text, text, extensions.vector, integer)',
    'public.get_neighbors(uuid, uuid, integer, boolean)',
    'public.graph_snapshot(uuid, boolean, text[], timestamptz)',
    'public.save_graph_positions(uuid, jsonb)',
    'public.timeline(uuid, timestamptz, timestamptz, text[])',
    'public.match_memories(uuid, extensions.vector, integer)',
    'public.match_chunks(uuid, extensions.vector, integer)',
    'public.related_notes(uuid, uuid, integer)',
    'public.lint_duplicate_entities(uuid, double precision)',
    'public.lint_orphans(uuid, interval)',
    'public.merge_notes(uuid, uuid, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
