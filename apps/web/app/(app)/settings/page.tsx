import { PageHeader } from "@/components/brand/motifs";
import { AiTest } from "@/components/settings/AiTest";
import { ChangePassword } from "@/components/settings/ChangePassword";
import { McpTokenCreator, TelegramPairing } from "@/components/settings/SecretsPanel";
import { Button, Card, timeAgo } from "@/components/ui";
import { daysAgoIso } from "@/lib/dates";
import { aiProvider } from "@/lib/ai/llm";
import { embeddingsConfigured } from "@/lib/ai/provider";
import { env } from "@/lib/env";
import { requireWorkspace } from "@/lib/workspace";
import { disconnectChannelAction, revokeApiTokenAction, saveProfileAction } from "../actions";

export const metadata = { title: "Configurações — JARVIS" };

export default async function SettingsPage() {
  const { supabase, workspaceId, internal } = await requireWorkspace();
  const since = daysAgoIso(30);
  const [{ data: ws }, { data: identities }, { data: tokens }, { data: usage }] = await Promise.all([
    supabase.from("workspaces").select("name, profile_md").eq("id", workspaceId).single(),
    supabase.from("channel_identities").select("id, channel, display_name, created_at").eq("workspace_id", workspaceId),
    supabase.from("api_tokens").select("id, name, last_used_at, created_at").eq("workspace_id", workspaceId),
    supabase.from("ai_usage").select("operation, model, input_tokens, output_tokens, units").eq("workspace_id", workspaceId).gte("created_at", since),
  ]);

  const byOp = new Map<string, { calls: number; input: number; output: number; units: number }>();
  for (const u of usage ?? []) {
    const k = `${u.operation} · ${u.model}`;
    const cur = byOp.get(k) ?? { calls: 0, input: 0, output: 0, units: 0 };
    byOp.set(k, { calls: cur.calls + 1, input: cur.input + u.input_tokens, output: cur.output + u.output_tokens, units: cur.units + Number(u.units) });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 md:px-10 md:py-10">
      <PageHeader
        index="06 — Ajustes"
        section="Conta · Canais · Dados"
        title="Configurações"
        subtitle="Perfil do Jarvis, senha, Telegram, acesso via MCP, backup e uso de IA."
      />

      <Card title="Conexões">
        <ul className="mb-4 divide-y divide-border text-sm">
          {[
            ["Claude (API Anthropic / AI Gateway)", aiProvider().kind !== "none", aiProvider().kind === "none" ? "defina ANTHROPIC_API_KEY na Vercel" : `via ${aiProvider().kind === "anthropic" ? "API direta" : "AI Gateway"}`],
            ["Busca por significado (OpenAI, opcional)", embeddingsConfigured(process.env), "sem ela a busca usa só palavras-chave"],
            ["Telegram", !!process.env.TELEGRAM_BOT_TOKEN, "defina TELEGRAM_BOT_TOKEN para capturar pelo celular"],
            ["Banco (chave de serviço)", !!(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY), "defina SUPABASE_SECRET_KEY"],
          ].map(([name, ok, hint]) => (
            <li key={String(name)} className="flex items-center gap-3 py-2">
              <span className={`h-1.5 w-1.5 shrink-0 ${ok ? "bg-foreground" : "bg-[var(--signal)]"}`} />
              <span className="flex-1">{String(name)}</span>
              <span className="text-xs text-muted">{ok ? "conectado" : String(hint)}</span>
            </li>
          ))}
        </ul>
        <AiTest />
      </Card>

      <Card title="Perfil (contexto fixo do Jarvis)">
        <form action={saveProfileAction} className="space-y-2">
          <input
            name="name"
            defaultValue={ws?.name ?? ""}
            className="field w-full text-sm "
          />
          <textarea
            name="profile_md"
            defaultValue={ws?.profile_md ?? ""}
            rows={8}
            placeholder="Quem você é, objetivos, estilo de resposta preferido, metas do ano…"
            className="field w-full font-mono text-sm "
          />
          <Button variant="primary">Salvar perfil</Button>
        </form>
      </Card>

      {internal ? (
        <Card title="Acesso">
          <p className="text-sm text-muted">
            O login está desligado (uso interno): o app entra direto como o dono. Para exigir e-mail e senha, defina
            <code className="mx-1 rounded bg-panel-2 px-1">JARVIS_REQUIRE_LOGIN=1</code> nas variáveis de ambiente.
          </p>
        </Card>
      ) : (
        <Card title="Senha de acesso">
          <ChangePassword />
        </Card>
      )}

      <Card title="Telegram">
        <ul className="mb-3 space-y-1 text-sm">
          {(identities ?? []).map((i) => (
            <li key={i.id} className="flex items-center gap-2">
              <span>✅ {i.channel}</span>
              <span className="text-muted">{i.display_name}</span>
              <span className="text-xs text-muted">{timeAgo(i.created_at)}</span>
              <form action={disconnectChannelAction.bind(null, i.id)} className="ml-auto">
                <Button variant="ghost">desconectar</Button>
              </form>
            </li>
          ))}
        </ul>
        <TelegramPairing botUsername={process.env.TELEGRAM_BOT_USERNAME} />
      </Card>

      <Card title="Servidor MCP (Claude Code / Claude Desktop)">
        <p className="mb-3 text-sm text-muted">
          Endpoint: <code className="rounded bg-panel-2 px-1">{env.appUrl()}/api/mcp</code>
        </p>
        <ul className="mb-3 space-y-1 text-sm">
          {(tokens ?? []).map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              🔑 {t.name}
              <span className="text-xs text-muted">{t.last_used_at ? `usado ${timeAgo(t.last_used_at)}` : "nunca usado"}</span>
              <form action={revokeApiTokenAction.bind(null, t.id)} className="ml-auto">
                <Button variant="danger">revogar</Button>
              </form>
            </li>
          ))}
        </ul>
        <McpTokenCreator appUrl={env.appUrl()} />
      </Card>

      <Card title="Backup (Markdown / Obsidian)">
        <p className="mb-3 text-sm text-muted">
          Baixe todas as notas como um vault do Obsidian: um arquivo .md por nota, com frontmatter e conexões.
        </p>
        <a href="/api/export" className="inline-block btn-primary px-3 py-1.5">
          Baixar backup (.zip)
        </a>
      </Card>

      <Card title="Uso de IA (30 dias)">
        {!byOp.size && <p className="text-sm text-muted">Sem uso registrado.</p>}
        <table className="w-full text-left text-sm">
          <tbody>
            {[...byOp].map(([k, v]) => (
              <tr key={k} className="border-b border-border">
                <td className="py-1">{k}</td>
                <td className="py-1 text-right text-muted">{v.calls}×</td>
                <td className="py-1 text-right text-muted">{(v.input / 1000).toFixed(1)}k in</td>
                <td className="py-1 text-right text-muted">{(v.output / 1000).toFixed(1)}k out</td>
                <td className="py-1 text-right text-muted">{v.units ? `${v.units.toFixed(1)} min` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
