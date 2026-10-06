-- =============================================================================
-- Filas (pgmq) + agendamento (pg_cron + pg_net)
--
-- Fluxo: INSERT em sources/notes → trigger enfileira → pg_cron chama, a cada
-- minuto, o worker HTTP da app (/api/workers/drain) que consome as filas.
-- Padrão inspirado nos "automatic embeddings" do Supabase, mas com os workers
-- em Next.js (mesmo código TS do resto do pipeline — ver ADR-004).
-- =============================================================================

create extension if not exists pgmq;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select pgmq.create('captures');    -- fonte nova → pipeline de ingestão
select pgmq.create('embeddings');  -- nota sem embedding → gerar embedding + sugerir links

-- -----------------------------------------------------------------------------
-- Wrappers (apenas service_role): a app não precisa expor o schema pgmq
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_job(p_queue text, p_payload jsonb, p_delay int default 0)
returns bigint
language sql security definer
set search_path = ''
as $$ select pgmq.send(p_queue, p_payload, p_delay); $$;

create or replace function public.read_jobs(p_queue text, p_vt int default 120, p_qty int default 5)
returns table (msg_id bigint, read_ct int, message jsonb)
language sql security definer
set search_path = ''
as $$ select r.msg_id, r.read_ct, r.message from pgmq.read(p_queue, p_vt, p_qty) r; $$;

create or replace function public.ack_job(p_queue text, p_msg_id bigint)
returns boolean
language sql security definer
set search_path = ''
as $$ select pgmq.delete(p_queue, p_msg_id); $$;

create or replace function public.archive_job(p_queue text, p_msg_id bigint)
returns boolean
language sql security definer
set search_path = ''
as $$ select pgmq.archive(p_queue, p_msg_id); $$;

revoke execute on function public.enqueue_job(text, jsonb, int) from public, anon, authenticated;
revoke execute on function public.read_jobs(text, int, int) from public, anon, authenticated;
revoke execute on function public.ack_job(text, bigint) from public, anon, authenticated;
revoke execute on function public.archive_job(text, bigint) from public, anon, authenticated;
grant execute on function public.enqueue_job(text, jsonb, int) to service_role;
grant execute on function public.read_jobs(text, int, int) to service_role;
grant execute on function public.ack_job(text, bigint) to service_role;
grant execute on function public.archive_job(text, bigint) to service_role;

-- -----------------------------------------------------------------------------
-- Triggers de enfileiramento
-- -----------------------------------------------------------------------------
create or replace function private.enqueue_capture()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pgmq.send('captures', jsonb_build_object('source_id', new.id, 'workspace_id', new.workspace_id));
  return null;
end $$;
create trigger sources_enqueue after insert on public.sources
  for each row when (new.status = 'pending') execute function private.enqueue_capture();

create or replace function private.enqueue_embedding()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pgmq.send('embeddings', jsonb_build_object('note_id', new.id, 'workspace_id', new.workspace_id));
  return null;
end $$;
create trigger notes_enqueue_embedding_insert after insert on public.notes
  for each row execute function private.enqueue_embedding();
create trigger notes_enqueue_embedding_update after update of title, summary, content_md on public.notes
  for each row when (new.embedding is null) execute function private.enqueue_embedding();

-- -----------------------------------------------------------------------------
-- Cron → worker HTTP. URL e segredo ficam no Vault (nunca no código):
--   select vault.create_secret('https://<app>.vercel.app', 'jarvis_app_url');
--   select vault.create_secret('<CRON_SECRET>', 'jarvis_cron_secret');
-- Sem os segredos, a função não faz nada (útil em dev/local).
-- -----------------------------------------------------------------------------
create or replace function private.invoke_worker(p_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'jarvis_app_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'jarvis_cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || p_path,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end $$;

-- Drena filas a cada minuto (o webhook também dispara um drain imediato)
select cron.schedule('jarvis-drain', '* * * * *', $$select private.invoke_worker('/api/workers/drain')$$);
-- Lint semanal (domingo 21h UTC ≈ 18h BRT): duplicatas, órfãs, MOCs, sementes velhas
select cron.schedule('jarvis-lint', '0 21 * * 0', $$select private.invoke_worker('/api/workers/lint')$$);
