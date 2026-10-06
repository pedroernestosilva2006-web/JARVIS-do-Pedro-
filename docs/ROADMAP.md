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

## Fase 4 ✅
- [x] Brief diário (7h BRT) e semanal (domingo 19h BRT) no Telegram via pg_cron → `/api/workers/brief`; `/brief [semana]` sob demanda.
- [x] Exportação para Markdown: vault do Obsidian (.zip) em Configurações → `/api/export`.
- [x] Fontes longas: chunks com embedding (RAG em `search_knowledge`) e extração em partes de 24 mil caracteres.
- [x] Memória episódica: resumo + embedding de cada conversa (`conversations.summary`), consultado pela tool `recall`.
- [x] Autocomplete de `[[` no editor.
- [ ] Backup automático em git (hoje é download manual do .zip). Fica para quando houver repositório de destino.
- [ ] Editor rico (TipTap/BlockNote). O textarea com autocomplete atende por enquanto.

## Fase 5
- [ ] WhatsApp (Evolution API em número secundário → Cloud API oficial), e-mail (encaminhar newsletters).
- [ ] PWA share target ("compartilhar para Jarvis").
- [ ] Modo "preparar reunião": tudo sobre uma pessoa/empresa antes de uma call.
- [ ] Grafo 3D (react-force-graph) e voz bidirecional.

## Fase 6 (SaaS)
- [ ] Convites (`workspace_members.role`), billing (Stripe) e limites por plano a partir de `ai_usage`.
- [ ] LGPD: exportação completa, exclusão em cascata (já no schema), DPA. Vercel Pro (Hobby é só uso pessoal).
- [ ] Taxonomia por workspace (`note_types`).
