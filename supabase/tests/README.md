# Testes SQL

`rls_and_functions.sql` verifica isolamento entre workspaces (RLS), busca híbrida em português,
travessia do grafo, `graph_snapshot`, timeline, filas e imutabilidade de `sources`.

Com o Supabase CLI:

```bash
supabase db reset          # aplica migrations + seed.sql
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" -f supabase/tests/rls_and_functions.sql
```

O teste roda dentro de uma transação e faz `rollback` no final.
