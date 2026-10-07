import { Checklist } from "@/components/onboarding/Checklist";
import { ChangePassword } from "@/components/settings/ChangePassword";
import { McpTokenCreator, TelegramPairing } from "@/components/settings/SecretsPanel";
import { StatusBoard } from "@/components/settings/StatusBoard";
import { Button, Card, PageHeader, timeAgo } from "@/components/ui";
import { daysAgoIso } from "@/lib/dates";
import { env } from "@/lib/env";
import { integrationStatus } from "@/lib/integrations";
import { getOnboardingStatus } from "@/lib/onboarding";
import { requireWorkspace } from "@/lib/workspace";
import { disconnectChannelAction, revokeApiTokenAction, saveProfileAction } from "../actions";

export const metadata = { title: "Ajustes — JARVIS" };

export default async function SettingsPage() {
  const { supabase, workspaceId, internal } = await requireWorkspace();
  const since = daysAgoIso(30);
  const [{ data: ws }, { data: identities }, { data: tokens }, { data: usage }, onboarding] = await Promise.all([
    supabase.from("workspaces").select("name, profile_md").eq("id", workspaceId).single(),
    supabase.from("channel_identities").select("id, channel, display_name, created_at").eq("workspace_id", workspaceId),
    supabase.from("api_tokens").select("id, name, last_used_at, created_at").eq("workspace_id", workspaceId),
    supabase.from("ai_usage").select("operation, model, input_tokens, output_tokens, units").eq("workspace_id", workspaceId).gte("created_at", since),
    getOnboardingStatus(supabase, workspaceId),
  ]);

  const byOp = new Map<string, { calls: number; input: number; output: number; units: number }>();
  for (const u of usage ?? []) {
    const k = `${u.operation} · ${u.model}`;
    const cur = byOp.get(k) ?? { calls: 0, input: 0, output: 0, units: 0 };
    byOp.set(k, { calls: cur.calls + 1, input: cur.input + u.input_tokens, output: cur.output + u.output_tokens, units: cur.units + Number(u.units) });
  }
  const integrations = integrationStatus({ telegramPaired: (identities ?? []).length > 0 });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-8">
        <PageHeader title="Ajustes" subtitle="Status das integrações, perfil do Jarvis, Telegram, acesso via MCP, backup e uso de IA." />

        <Card title="Conexões" id="conexoes">
          <StatusBoard items={integrations} />
        </Card>

        <Card>
          <Checklist status={onboarding} />
        </Card>

        <Card title="Perfil (contexto fixo do Jarvis)">
          <form action={saveProfileAction} className="space-y-3">
            <label className="block">
              <span className="label">Nome do cérebro</span>
              <input name="name" defaultValue={ws?.name ?? ""} className="field mt-1" />
            </label>
            <label className="block">
              <span className="label">Quem você é, objetivos, estilo de resposta, metas do ano</span>
              <textarea name="profile_md" defaultValue={ws?.profile_md ?? ""} rows={7} placeholder="Ex.: Sou fundador de uma empresa de IA para vendas. Prefiro respostas diretas…" className="field mt-1 font-mono text-sm" />
            </label>
            <Button variant="primary">Salvar perfil</Button>
          </form>
        </Card>

        {internal ? (
          <Card title="Acesso">
            <p className="text-sm text-muted">
              O login está desligado (uso interno): o app entra direto como o dono, e quem tiver o link acessa tudo. Para exigir e-mail e senha, defina <code className="rounded bg-surface-2 px-1.5 py-0.5">JARVIS_REQUIRE_LOGIN=1</code> nas variáveis de ambiente.
            </p>
          </Card>
        ) : (
          <Card title="Senha de acesso">
            <ChangePassword />
          </Card>
        )}

        <Card title="Telegram" id="telegram">
          <ul className="mb-3 space-y-2 text-sm">
            {(identities ?? []).map((i) => (
              <li key={i.id} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-ok" aria-hidden="true" />
                <span className="capitalize">{i.channel}</span>
                <span className="text-muted">{i.display_name}</span>
                <span className="text-xs text-muted">{timeAgo(i.created_at)}</span>
                <form action={disconnectChannelAction.bind(null, i.id)} className="ml-auto">
                  <Button variant="ghost">Desconectar</Button>
                </form>
              </li>
            ))}
            {!identities?.length && <li className="text-muted">Nenhuma conta pareada.</li>}
          </ul>
          <TelegramPairing botUsername={process.env.TELEGRAM_BOT_USERNAME} />
        </Card>

        <Card title="Servidor MCP (Claude Code / Claude Desktop)">
          <p className="mb-3 text-sm text-muted">
            Endpoint: <code className="rounded bg-surface-2 px-1.5 py-0.5">{env.appUrl()}/api/mcp</code>
          </p>
          <ul className="mb-3 space-y-2 text-sm">
            {(tokens ?? []).map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <span>{t.name}</span>
                <span className="text-xs text-muted">{t.last_used_at ? `usado ${timeAgo(t.last_used_at)}` : "nunca usado"}</span>
                <form action={revokeApiTokenAction.bind(null, t.id)} className="ml-auto">
                  <Button variant="danger">Revogar</Button>
                </form>
              </li>
            ))}
          </ul>
          <McpTokenCreator appUrl={env.appUrl()} />
        </Card>

        <Card title="Backup (Markdown / Obsidian)">
          <p className="mb-3 text-sm text-muted">Baixe todas as notas como um vault do Obsidian: um arquivo .md por nota, com frontmatter e conexões.</p>
          <a href="/api/export" className="btn-primary inline-flex">
            Baixar backup (.zip)
          </a>
        </Card>

        <Card title="Uso de IA (30 dias)">
          {!byOp.size && <p className="text-sm text-muted">Sem uso registrado.</p>}
          <table className="w-full text-left text-sm">
            <tbody>
              {[...byOp].map(([k, v]) => (
                <tr key={k} className="border-b border-border last:border-0">
                  <td className="py-1.5">{k}</td>
                  <td className="py-1.5 text-right text-muted">{v.calls}×</td>
                  <td className="py-1.5 text-right text-muted">{(v.input / 1000).toFixed(1)}k entrada</td>
                  <td className="py-1.5 text-right text-muted">{(v.output / 1000).toFixed(1)}k saída</td>
                  <td className="py-1.5 text-right text-muted">{v.units ? `${v.units.toFixed(1)} min` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
