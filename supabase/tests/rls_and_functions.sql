-- Testes de isolamento entre workspaces e das funções SQL.
-- Rodar contra um banco com as migrations + seed aplicados (ver supabase/tests/README.md).
\set ON_ERROR_STOP on
begin;

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');
insert into public.workspaces (id, name) values ('00000000-0000-0000-0000-000000000002', 'Outro cliente');
insert into public.workspace_members (workspace_id, user_id) values
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('00000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222');
insert into public.notes (workspace_id, type, title, slug) values
  ('00000000-0000-0000-0000-000000000002', 'insight', 'Segredo do outro cliente sobre outbound', 'segredo');

-- ---- Usuário 1 só vê o próprio workspace ---------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

do $$
declare v int;
begin
  select count(*) into v from public.notes where workspace_id = '00000000-0000-0000-0000-000000000002';
  assert v = 0, 'vazamento: usuário 1 vê notas do workspace 2';
  select count(*) into v from public.notes;
  assert v = 15, format('esperava 15 notas do seed, veio %s', v);
  select count(*) into v from public.hybrid_search('00000000-0000-0000-0000-000000000002', 'outbound');
  assert v = 0, 'vazamento: hybrid_search devolveu dados de outro workspace';
  select count(*) into v from public.workspaces;
  assert v = 1, 'usuário 1 deveria ver só 1 workspace';
end $$;

-- não consegue inserir em workspace alheio
do $$
begin
  begin
    insert into public.notes (workspace_id, type, title, slug)
    values ('00000000-0000-0000-0000-000000000002', 'insight', 'invasão', 'invasao');
    assert false, 'RLS deveria bloquear insert em outro workspace';
  exception when insufficient_privilege then null;
  end;
end $$;

-- filas não são acessíveis a usuários
do $$
begin
  begin
    perform public.read_jobs('captures');
    assert false, 'read_jobs deveria ser só service_role';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---- Funções de busca e grafo -----------------------------------------------
do $$
declare v int; t text; j jsonb;
begin
  select title into t from public.hybrid_search('00000000-0000-0000-0000-000000000001', 'objeção de preço') limit 1;
  assert t = 'Objeção de preço esconde objeção de valor', format('FTS em português falhou: %s', t);

  select count(*) into v from public.get_neighbors('00000000-0000-0000-0000-000000000001',
    (select id from public.notes where slug = 'rd-summit-2026' and workspace_id = '00000000-0000-0000-0000-000000000001'), 1);
  assert v = 4, format('vizinhos de 1 salto do RD Summit: esperava 4 (ele + 3), veio %s', v);

  j := public.graph_snapshot('00000000-0000-0000-0000-000000000001');
  assert jsonb_array_length(j->'nodes') = 15, 'graph_snapshot: nós';
  assert jsonb_array_length(j->'edges') = 19, format('graph_snapshot: arestas (18 aceitas + 1 sugerida), veio %s', jsonb_array_length(j->'edges'));
  j := public.graph_snapshot('00000000-0000-0000-0000-000000000001', false);
  assert jsonb_array_length(j->'edges') = 18, 'graph_snapshot sem sugestões';

  select count(*) into v from public.timeline('00000000-0000-0000-0000-000000000001', '2026-09-01', '2026-09-30', array['evento']);
  assert v = 1, 'timeline deveria achar o RD Summit pela data em properties';
end $$;

reset role;

-- ---- Triggers ---------------------------------------------------------------
do $$
declare v int; sid uuid;
begin
  select count(*) into v from pgmq.q_embeddings;
  assert v >= 16, format('notas novas deveriam enfileirar embeddings, veio %s', v);

  insert into public.sources (workspace_id, channel, kind, raw_text, idempotency_key)
  values ('00000000-0000-0000-0000-000000000001', 'telegram', 'text', 'teste', 'tg:1')
  returning id into sid;
  select count(*) into v from pgmq.q_captures where message->>'source_id' = sid::text;
  assert v = 1, 'source nova deveria enfileirar captura';

  begin
    update public.sources set raw_text = 'adulterado' where id = sid;
    assert false, 'sources deveriam ser imutáveis';
  exception when raise_exception then null;
  end;
  update public.sources set status = 'done' where id = sid; -- permitido

  begin
    insert into public.sources (workspace_id, channel, kind, raw_text, idempotency_key)
    values ('00000000-0000-0000-0000-000000000001', 'telegram', 'text', 'dup', 'tg:1');
    assert false, 'idempotency_key deveria impedir duplicata';
  exception when unique_violation then null;
  end;

  update public.notes set embedding = array_fill(0.1, array[1536])::extensions.vector, embedded_at = now()
    where slug = 'outbound';
  update public.notes set content_md = 'novo conteúdo' where slug = 'outbound';
  select count(*) into v from public.notes where slug = 'outbound' and embedding is null;
  assert v = 1, 'editar conteúdo deveria invalidar o embedding';
end $$;

-- ---- Lint e merge ----------------------------------------------------------
do $$
declare v int; keep uuid; dup uuid;
begin
  insert into public.notes (workspace_id, type, title, slug)
  values ('00000000-0000-0000-0000-000000000001', 'pessoa', 'Aaron Ross (autor)', 'aaron-ross-autor')
  returning id into dup;
  select id into keep from public.notes where slug = 'aaron-ross' and workspace_id = '00000000-0000-0000-0000-000000000001';
  insert into public.links (workspace_id, from_note, to_note, relation, origin)
  select workspace_id, dup, id, 'autor_de', 'ai_entity' from public.notes where slug = 'spin-selling';

  select count(*) into v from public.lint_duplicate_entities('00000000-0000-0000-0000-000000000001')
   where (a_id = keep and b_id = dup) or (a_id = dup and b_id = keep);
  assert v = 1, 'lint deveria apontar Aaron Ross duplicado';

  insert into public.notes (workspace_id, type, title, slug, created_at)
  values ('00000000-0000-0000-0000-000000000001', 'insight', 'Insight solto', 'insight-solto', now() - interval '2 days');
  select count(*) into v from public.lint_orphans('00000000-0000-0000-0000-000000000001');
  assert v = 1, format('esperava 1 órfã (Insight solto), veio %s', v);

  perform public.merge_notes('00000000-0000-0000-0000-000000000001', keep, dup);
  select count(*) into v from public.notes where id = dup;
  assert v = 0, 'merge deveria apagar a duplicata';
  select count(*) into v from public.links l join public.notes n on n.id = l.to_note
   where l.from_note = keep and n.slug = 'spin-selling';
  assert v = 1, 'merge deveria mover os links';
  select count(*) into v from public.notes where id = keep and 'Aaron Ross (autor)' = any (aliases);
  assert v = 1, 'merge deveria guardar o título antigo como alias';
end $$;

rollback;
\echo 'TODOS OS TESTES SQL PASSARAM'
