---
name: ingestion-pipeline
description: Contrato e gotchas do pipeline de ingestão (canal → sources → pgmq → notas/links). Use ao mexer em captura, extração, entity resolution ou linking.
---
# Pipeline de ingestão

Arquivos: `apps/web/lib/capture/*` (adaptadores), `lib/ingest/{normalize,pipeline,embeddings,notes-repo}.ts`,
`lib/workers/drain.ts`, `packages/core/src/{capture,extraction,ingest-plan,entity-resolution,linking}.ts`.

## Contrato
- Adaptador de canal produz `NormalizedCapture` (`packages/core/src/capture.ts`) com `idempotencyKey` estável.
- `saveCapture` grava `sources` (pending). O trigger enfileira `captures`. Nunca chame o pipeline direto do webhook:
  use `after(() => drainQueues(...))`.
- `processSource`: normaliza → `normalized_text` → `extractKnowledge` (structured outputs) → `persistExtraction`.
- `buildIngestPlan` é puro: toda regra de "quem liga com quem" fica lá e é testada em `packages/core/test`.
- Notas criadas pela IA: `created_by='ai'`, `stage='semente'`. Proveniência em `note_sources.excerpt`.
- Embeddings e links semânticos acontecem na fila `embeddings` (trigger em `notes`).

## Adicionar um canal (ex.: WhatsApp)
1. `lib/capture/whatsapp.ts`: payload → `NormalizedCapture` (+ teste em `apps/web/test`).
2. Rota `app/api/capture/whatsapp/route.ts`: validar assinatura, mapear `channel_identities`, `saveCapture`, `after(drain)`.
3. `lib/capture/notify.ts`: responder no canal.

## Gotchas
- Telegram: voz é OGG/Opus (aceito pela transcrição); a Bot API só baixa até 20 MB (`TELEGRAM_API_BASE` permite Local Bot API Server).
- Transcrição: limite de 25 MB; modelos `gpt-4o-*-transcribe` saem do ar em 26/02/2027 (env `JARVIS_TRANSCRIBE_MODEL`).
- Retry: mensagem volta à fila após o visibility timeout; na 3ª falha é arquivada e o usuário é avisado.
- Mudou prompt/schema de extração? Incremente `EXTRACT_PROMPT_VERSION` e rode `pnpm eval:ingest`.
- O e2e (`pnpm --filter web test:e2e`) cobre o fluxo todo com mocks; rode depois de mudanças no pipeline.
