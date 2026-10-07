"use client";

import { useTransition } from "react";
import { IconBack, IconDownload, IconTarget, IconTrash } from "@/components/icons";
import { deleteAttachmentAction } from "@/app/(app)/actions";
import { useFocusNode } from "@/components/shell/useFocusNode";
import { analyzableKind, fileTypeLabel, formatBytes } from "@/lib/files/rules";
import { notifyChanged, toast } from "@/lib/ui-events";

export interface FileItem {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
  note: { id: string; title: string } | null;
}

/** Leitura de um arquivo: pré-visualização (imagem/áudio), dados, nota ligada, baixar e apagar. */
export function FileDetail({ file, onClose, onDeleted }: { file: FileItem; onClose: () => void; onDeleted: () => void }) {
  const focusNode = useFocusNode();
  const [pending, start] = useTransition();
  const kind = analyzableKind(file.file_name, file.mime_type);
  const src = `/api/files/${file.id}/download?inline=1`;

  return (
    <article className="flex h-full min-h-0 flex-col" aria-label={`Arquivo: ${file.file_name}`}>
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button onClick={onClose} className="btn-ghost !p-2 md:hidden" aria-label="Voltar à lista">
          <IconBack />
        </button>
        <span className="chip chip-static">{fileTypeLabel(file.file_name, file.mime_type)}</span>
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{file.file_name}</h2>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`Pré-visualização de ${file.file_name}`} className="max-h-[50vh] w-full rounded-lg border border-border bg-background object-contain" />
        )}
        {kind === "audio" && <audio controls src={src} className="w-full" aria-label={`Ouvir ${file.file_name}`} />}
        {kind !== "image" && kind !== "audio" && (
          <div className="rounded-lg border border-dashed border-border-strong p-6 text-center text-sm text-muted">
            Sem pré-visualização aqui.{" "}
            <a href={src} target="_blank" rel="noopener noreferrer" className="text-accent-text underline underline-offset-2">
              Abrir em nova aba
            </a>
          </div>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted">Tamanho</dt>
          <dd>{formatBytes(file.size_bytes)}</dd>
          <dt className="text-muted">Enviado em</dt>
          <dd>{new Date(file.created_at).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })}</dd>
          <dt className="text-muted">Tipo</dt>
          <dd>{file.mime_type ?? "desconhecido"}</dd>
          <dt className="text-muted">Nota ligada</dt>
          <dd>
            {file.note ? (
              <button className="chip" onClick={() => focusNode(file.note!.id)}>
                <IconTarget width={16} height={16} /> {file.note.title}
              </button>
            ) : (
              <span className="text-muted">Nenhuma — arquivo solto na biblioteca</span>
            )}
          </dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/files/${file.id}/download`} className="btn-primary">
            <IconDownload width={18} height={18} /> Baixar
          </a>
          <button
            disabled={pending}
            className="btn-outline !text-danger"
            onClick={() => {
              if (!confirm(`Apagar “${file.file_name}” definitivamente?`)) return;
              start(async () => {
                await deleteAttachmentAction(file.id);
                toast("Arquivo apagado.");
                notifyChanged();
                onDeleted();
              });
            }}
          >
            <IconTrash width={18} height={18} /> Apagar
          </button>
        </div>
      </div>
    </article>
  );
}
