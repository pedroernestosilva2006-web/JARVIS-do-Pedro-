/** Leitura centralizada de variáveis de ambiente, com erro claro quando faltam. */

function required(name: string, ...fallbacks: string[]): string {
  for (const key of [name, ...fallbacks]) {
    const v = process.env[key];
    if (v) return v;
  }
  throw new Error(`Variável de ambiente ausente: ${name}`);
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: () =>
    required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseSecretKey: () => required("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
  anthropicApiKey: () => process.env.ANTHROPIC_API_KEY,
  openaiApiKey: () => required("OPENAI_API_KEY"),
  telegramBotToken: () => required("TELEGRAM_BOT_TOKEN"),
  telegramWebhookSecret: () => required("TELEGRAM_WEBHOOK_SECRET"),
  /** Troque por um Local Bot API Server para remover o limite de 20 MB de download. */
  telegramApiBase: () => process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org",
  cronSecret: () => required("CRON_SECRET"),
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  /** Modelos configuráveis — preços e modelos mudam; nunca fixe no código. */
  extractModel: () => process.env.JARVIS_EXTRACT_MODEL ?? "claude-haiku-4-5",
  chatModel: () => process.env.JARVIS_CHAT_MODEL ?? "claude-sonnet-5-5",
  embedModel: () => process.env.JARVIS_EMBED_MODEL ?? "text-embedding-3-small",
  /** gpt-4o-mini-transcribe sai do ar em 26/02/2027 — troque por gpt-transcribe quando disponível. */
  transcribeModel: () => process.env.JARVIS_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe",
};
