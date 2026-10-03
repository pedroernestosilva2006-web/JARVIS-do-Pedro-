# Roadmap e próximos passos

## Para colocar no ar (checklist)
1. Criar projeto no Supabase (região São Paulo) → `supabase link --project-ref <ref>` → `supabase db push`.
2. Vault (SQL editor):
   `select vault.create_secret('https://<app>.vercel.app', 'jarvis_app_url');`
   `select vault.create_secret('<CRON_SECRET>', 'jarvis_cron_secret');`
3. Auth → URL Configuration: Site URL = `https://<app>.vercel.app`; Redirect = `https://<app>.vercel.app/auth/callback`.
4. Vercel: importar o repositório com **Root Directory = `apps/web`** e configurar as variáveis de `.env.example`.
5. Telegram: criar o bot no @BotFather e registrar o webhook:
   `curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" -d url=https://<app>.vercel.app/api/capture/telegram -d secret_token=$TELEGRAM_WEBHOOK_SECRET`
6. Entrar no app → Configurações → gerar código → `/conectar CODIGO` no bot.
7. Configurações → gerar token MCP → `claude mcp add --transport http jarvis https://<app>/api/mcp --header "Authorization: Bearer …"`.
8. Rodar `pnpm eval:ingest` com a chave real e calibrar os limiares olhando ~50 links reais.

## Fase 4 (restante)
- [ ] Brief diário/semanal no Telegram ("o que aprendi esta semana") via pg_cron → `/api/workers/brief`.
- [ ] Exportação Markdown/git (backup diário, formato compatível com Obsidian).
- [ ] Chunks para fontes longas (livro inteiro, transcrição de 1 h) → `chunks` + `match_chunks` já existem no schema.
- [ ] Memória episódica: resumo de cada conversa em `conversations.summary`.
- [ ] Editor rico (TipTap/BlockNote) com autocomplete de `[[`.

## Fase 5
- [ ] WhatsApp (Evolution API em número secundário → Cloud API oficial), e-mail (encaminhar newsletters).
- [ ] PWA share target ("compartilhar para Jarvis").
- [ ] Modo "preparar reunião": tudo sobre uma pessoa/empresa antes de uma call.
- [ ] Grafo 3D (react-force-graph) e voz bidirecional.

## Fase 6 (SaaS)
- [ ] Convites (`workspace_members.role`), billing (Stripe) e limites por plano a partir de `ai_usage`.
- [ ] LGPD: exportação completa, exclusão em cascata (já no schema), DPA. Vercel Pro (Hobby é só uso pessoal).
- [ ] Taxonomia por workspace (`note_types`).
