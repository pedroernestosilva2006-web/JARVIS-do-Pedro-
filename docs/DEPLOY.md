# Deploy (estado em 06/10/2026)

## Supabase ✅ (plano Free)
- Projeto **jarvis** · ref `smyzqrjvpwiiztrvazne` · região `sa-east-1` (São Paulo)
- URL: `https://smyzqrjvpwiiztrvazne.supabase.co`
- Publishable key: `sb_publishable_9fIsv_dMC-lZM8DDN7gXBA_mq8TkpBj` (pública por natureza; protegida por RLS)
- Migrations aplicadas via MCP: schema, RLS, storage, busca/grafo, filas + cron, lint (exceto `merge_notes`),
  grants, Fase 4 e índices de FK. Advisors: só o aviso esperado em `bootstrap_workspace`.
- ⚠️ Plano Free pausa o projeto após 1 semana sem uso. O cron chama o app a cada minuto, mas isso
  não conta como "uso" do dashboard. Se pausar, reative no painel.

### Pendências no Supabase (você faz no painel)
1. **`merge_notes`**: o MCP exige confirmação para comandos destrutivos, e ela não chegou até o agente.
   Rode no SQL Editor a função `merge_notes` de `supabase/migrations/20261003000004_lint.sql` e depois:
   ```sql
   revoke execute on function public.merge_notes(uuid, uuid, uuid) from public, anon;
   grant execute on function public.merge_notes(uuid, uuid, uuid) to authenticated, service_role;
   ```
2. **Secret key**: Project Settings → API Keys → copie a `sb_secret_…` para a Vercel (`SUPABASE_SECRET_KEY`).
3. **Login por e-mail e senha**: em Authentication → Sign In / Providers → Email, deixe "Confirm email" ligado
   (recomendado) e defina o mínimo de senha em 8. O SMTP padrão do Supabase envia poucos e-mails por hora;
   para uso real, configure um SMTP próprio (Resend, SES…) em Authentication → Emails.
4. **Auth → URL Configuration**: Site URL `https://<app>.vercel.app` e Redirect URL `https://<app>.vercel.app/auth/callback`.
5. **Vault** (depois que souber a URL da Vercel), no SQL Editor:
   ```sql
   select vault.create_secret('https://<app>.vercel.app', 'jarvis_app_url');
   select vault.create_secret('<o mesmo CRON_SECRET da Vercel>', 'jarvis_cron_secret');
   ```
   Sem esses segredos o cron não chama nada (é seguro deixar para depois).

## Vercel ⏳
O conector da Vercel não tem permissão para criar projetos no time **COMERCIAL CLOSER** (403).
Crie pelo painel: **Add New → Project → importar `pedroernestosilva2006-web/JARVIS-do-Pedro-`**, com
**Root Directory = `apps/web`** (framework Next.js, instalação com pnpm detectada pelo lockfile).
Variáveis (Production): veja `.env.example`. Com os valores do Supabase acima:
```
NEXT_PUBLIC_SUPABASE_URL=https://smyzqrjvpwiiztrvazne.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_9fIsv_dMC-lZM8DDN7gXBA_mq8TkpBj
SUPABASE_SECRET_KEY=<do painel>
NEXT_PUBLIC_APP_URL=https://<app>.vercel.app
ANTHROPIC_API_KEY=… · OPENAI_API_KEY=…
TELEGRAM_BOT_TOKEN=… · TELEGRAM_BOT_USERNAME=… · TELEGRAM_WEBHOOK_SECRET=<gere: openssl rand -hex 32>
CRON_SECRET=<gere: openssl rand -hex 32>
```
Observação: o plano Hobby da Vercel é só para uso pessoal e não comercial. Para vender o JARVIS, migre para o Pro.

## Depois do primeiro deploy
1. Registrar o webhook do Telegram:
   `curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" -d url=https://<app>.vercel.app/api/capture/telegram -d secret_token=$TELEGRAM_WEBHOOK_SECRET`
2. Entrar no app → Configurações → gerar código → `/conectar CODIGO` no bot.
3. Rodar `pnpm eval:ingest` com as chaves reais.
