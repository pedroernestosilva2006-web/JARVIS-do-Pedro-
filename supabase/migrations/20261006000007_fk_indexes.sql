-- Índices para chaves estrangeiras (advisor 0001): deixam rápidos os deletes em cascata
-- (exclusão de workspace/nota, exigência de LGPD) e os filtros por workspace.
create index if not exists api_tokens_workspace_id_idx on public.api_tokens (workspace_id);
create index if not exists capture_sessions_context_note_id_idx on public.capture_sessions (context_note_id);
create index if not exists capture_sessions_workspace_id_idx on public.capture_sessions (workspace_id);
create index if not exists channel_identities_workspace_id_idx on public.channel_identities (workspace_id);
create index if not exists channel_link_codes_workspace_id_idx on public.channel_link_codes (workspace_id);
create index if not exists chunks_note_id_idx on public.chunks (note_id);
create index if not exists chunks_source_id_idx on public.chunks (source_id);
create index if not exists links_to_note_idx on public.links (to_note);
create index if not exists memories_workspace_id_idx on public.memories (workspace_id);
create index if not exists messages_workspace_id_idx on public.messages (workspace_id);
create index if not exists note_sources_workspace_id_idx on public.note_sources (workspace_id);
create index if not exists note_tags_workspace_id_idx on public.note_tags (workspace_id);
create index if not exists review_items_note_id_idx on public.review_items (note_id);
