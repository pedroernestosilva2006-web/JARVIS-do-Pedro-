-- =============================================================================
-- Arquivos: qualquer tipo, guardados no Storage (bucket privado 'captures') e catalogados aqui.
-- Um arquivo pode estar ligado a uma nota (note_id) e/ou à fonte que o gerou (source_id);
-- sem nenhum dos dois ele fica solto na biblioteca de arquivos.
-- =============================================================================

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  note_id uuid references public.notes on delete set null,
  source_id uuid references public.sources on delete set null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default now()
);
create index attachments_workspace_created_idx on public.attachments (workspace_id, created_at desc);
create index attachments_note_idx on public.attachments (note_id) where note_id is not null;
create index attachments_source_idx on public.attachments (source_id) where source_id is not null;

alter table public.attachments enable row level security;
create policy "membros acessam attachments do workspace" on public.attachments
  for all to authenticated
  using (workspace_id in (select private.user_workspace_ids()))
  with check (workspace_id in (select private.user_workspace_ids()));

grant select, insert, update, delete on public.attachments to authenticated, service_role;
revoke all on public.attachments from anon;

-- Bucket: até 50 MB por arquivo (limite global do plano Free do Supabase), qualquer tipo
update storage.buckets set file_size_limit = 52428800, allowed_mime_types = null where id = 'captures';
