---
name: supabase-migrations
description: Como criar e validar migrations do JARVIS (schema, RLS, funções, grants e testes SQL). Use ao mexer em supabase/.
---
# Migrations do JARVIS

1. `supabase migration new <nome_em_snake_case>`. Nunca edite migrations já aplicadas em produção: crie outra.
2. Tabela nova de domínio:
   - `workspace_id uuid not null references public.workspaces on delete cascade`
   - adicione o nome ao loop de RLS (ou crie a policy com `private.user_workspace_ids()`)
   - `grant select, insert, update, delete … to authenticated, service_role` (anon nada)
3. Função nova: `language sql|plpgsql`, `set search_path = public[, extensions]`, parâmetro `p_workspace uuid`,
   `revoke … from public, anon` + `grant … to authenticated, service_role`. Use SECURITY DEFINER só com motivo.
4. Dentro de funções com `search_path = ''`, qualifique tudo (`public.notes`, `extensions.vector`) e evite
   comparar `vector` com `=`.
5. Validar:
   ```bash
   supabase db reset
   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls_and_functions.sql
   supabase db lint --level warning
   ```
6. Adicione asserts em `supabase/tests/rls_and_functions.sql` (use `request.jwt.claims` para simular usuário).
7. Em produção: rode os advisors de segurança/performance pelo MCP do Supabase depois do `db push`.

Gotchas: filas pgmq reais são `pgmq.q_<fila>`; pg_cron chama os workers com URL/segredo do Vault
(`jarvis_app_url`, `jarvis_cron_secret`).
