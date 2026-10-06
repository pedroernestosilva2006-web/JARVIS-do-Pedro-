"use client";

import { useState, useTransition } from "react";
import { createApiTokenAction, createPairingCodeAction } from "@/app/(app)/actions";

export function TelegramPairing({ botUsername }: { botUsername?: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2 text-sm">
      <button
        disabled={pending}
        onClick={() => start(async () => setCode(await createPairingCodeAction()))}
        className="btn-primary px-3 py-1.5 disabled:opacity-50"
      >
        Gerar código de pareamento
      </button>
      {code && (
        <p>
          Envie ao bot{botUsername ? ` @${botUsername}` : ""}: <code className="rounded bg-panel-2 px-2 py-1 font-mono">/conectar {code}</code>
          {botUsername && (
            <>
              {" "}
              ou{" "}
              <a className="text-accent underline" href={`https://t.me/${botUsername}?start=${code}`} target="_blank" rel="noopener noreferrer">
                abra o link
              </a>
            </>
          )}
          <span className="block text-xs text-muted">Válido por 15 minutos.</span>
        </p>
      )}
    </div>
  );
}

export function McpTokenCreator({ appUrl }: { appUrl: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [name, setName] = useState("Claude Code");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2 text-sm">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="field flex-1 "
        />
        <button
          disabled={pending}
          onClick={() => start(async () => setToken(await createApiTokenAction(name)))}
          className="btn-primary px-3 py-1.5 disabled:opacity-50"
        >
          Gerar token
        </button>
      </div>
      {token && (
        <div className="space-y-1 rounded-md border border-yellow-800 bg-yellow-950/30 p-3">
          <p className="text-xs text-yellow-300">Copie agora — o token não será mostrado de novo.</p>
          <code className="block break-all font-mono text-xs">{token}</code>
          <p className="pt-2 text-xs text-muted">Claude Code:</p>
          <code className="block break-all font-mono text-xs">
            claude mcp add --transport http jarvis {appUrl}/api/mcp --header &quot;Authorization: Bearer {token}&quot;
          </code>
        </div>
      )}
    </div>
  );
}
