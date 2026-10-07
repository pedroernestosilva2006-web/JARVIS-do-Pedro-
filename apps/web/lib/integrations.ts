import "server-only";
import { aiProvider } from "@/lib/ai/llm";

export type Light = "ok" | "warn" | "fail";
export interface Integration {
  id: string;
  name: string;
  light: Light;
  summary: string;
  /** Variáveis de ambiente que faltam (só os NOMES — nunca os valores). */
  missing: string[];
  detail?: string;
}

const has = (name: string) => !!process.env[name];

/** Semáforo das integrações: diz exatamente qual variável falta, sem mostrar valores. */
export function integrationStatus(opts: { telegramPaired: boolean }): Integration[] {
  const ai = aiProvider();
  const supabaseMissing = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"].filter((n) => !has(n) && !(n.endsWith("PUBLISHABLE_KEY") && has("NEXT_PUBLIC_SUPABASE_ANON_KEY")));
  if (!has("SUPABASE_SECRET_KEY") && !has("SUPABASE_SERVICE_ROLE_KEY")) supabaseMissing.push("SUPABASE_SECRET_KEY");
  const tgMissing = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"].filter((n) => !has(n));

  return [
    {
      id: "claude",
      name: "Claude (IA)",
      light: ai.kind === "none" ? "fail" : "ok",
      summary: ai.kind === "none" ? "Sem IA: o Jarvis não cria notas nem conversa." : ai.kind === "anthropic" ? "Conectado pela API da Anthropic." : "Conectado pelo Vercel AI Gateway.",
      missing: ai.kind === "none" ? ["ANTHROPIC_API_KEY (ou AI_GATEWAY_API_KEY)"] : [],
    },
    {
      id: "openai",
      name: "OpenAI (opcional)",
      light: has("OPENAI_API_KEY") ? "ok" : "warn",
      summary: has("OPENAI_API_KEY") ? "Busca por significado e transcrição de áudio ativas." : "Sem ela a busca usa só palavras-chave e áudios não são transcritos.",
      missing: has("OPENAI_API_KEY") ? [] : ["OPENAI_API_KEY"],
    },
    {
      id: "telegram",
      name: "Telegram",
      light: tgMissing.length ? "warn" : opts.telegramPaired ? "ok" : "warn",
      summary: tgMissing.length ? "Opcional: capture pelo celular mandando mensagens ao bot." : opts.telegramPaired ? "Bot configurado e conta pareada." : "Bot configurado, mas nenhuma conta pareada ainda.",
      missing: tgMissing,
      detail: !tgMissing.length && !opts.telegramPaired ? "Gere um código de pareamento abaixo e envie /conectar CÓDIGO ao bot." : undefined,
    },
    {
      id: "supabase",
      name: "Supabase (banco e arquivos)",
      light: supabaseMissing.length ? "fail" : "ok",
      summary: supabaseMissing.length ? "Sem estas variáveis o app não consegue ler nem gravar." : "Banco, autenticação e armazenamento configurados.",
      missing: supabaseMissing,
    },
    {
      id: "cron",
      name: "Processamento em segundo plano (Cron)",
      light: has("CRON_SECRET") ? "ok" : "fail",
      summary: has("CRON_SECRET") ? "Os workers (fila, resumos, revisão) aceitam chamadas autenticadas." : "Sem ela os workers recusam as chamadas e as capturas não são processadas em segundo plano.",
      missing: has("CRON_SECRET") ? [] : ["CRON_SECRET"],
      detail: has("CRON_SECRET") ? "Lembre de gravar o mesmo valor no Vault do Supabase (jarvis_cron_secret)." : undefined,
    },
  ];
}
