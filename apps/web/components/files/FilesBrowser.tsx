"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PaneEmpty, SplitView } from "@/components/shell/SplitView";
import { ListToolbar } from "@/components/shell/ListToolbar";
import { EmptyState, timeAgo } from "@/components/ui";
import { analyzableKind, fileTypeLabel, formatBytes } from "@/lib/files/rules";
import { emit, on } from "@/lib/ui-events";
import { FileDetail, type FileItem } from "./FileDetail";

const KINDS = [
  { id: "pdf", label: "PDFs" },
  { id: "image", label: "Imagens" },
  { id: "audio", label: "Áudios" },
  { id: "text", label: "Textos" },
  { id: "other", label: "Outros" },
];
const kindOf = (f: FileItem) => analyzableKind(f.file_name, f.mime_type) ?? "other";

/** Arquivos: biblioteca à esquerda (busca + chips por tipo) e detalhe à direita. */
export function FilesBrowser({ files, sel }: { files: FileItem[]; sel: string | null }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [selected, setSelected] = useState<string | null>(sel);

  useEffect(() => on("jarvis:changed", () => router.refresh()), [router]);

  const visible = useMemo(
    () => files.filter((f) => (!kind || kindOf(f) === kind) && (!q.trim() || f.file_name.toLowerCase().includes(q.trim().toLowerCase()))),
    [files, kind, q],
  );
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of files) m.set(kindOf(f), (m.get(kindOf(f)) ?? 0) + 1);
    return m;
  }, [files]);
  const current = files.find((f) => f.id === selected) ?? null;

  const select = (id: string | null) => {
    setSelected(id);
    window.history.replaceState(null, "", id ? `/files?sel=${id}` : "/files");
  };

  return (
    <SplitView
      hasSelection={!!current}
      list={
        <>
          <ListToolbar
            title="Arquivos"
            count={visible.length}
            query={q}
            onQuery={setQ}
            placeholder="Buscar pelo nome…"
            chips={[{ id: "all", label: "Todos", active: !kind, onClick: () => setKind("") }, ...KINDS.filter((k) => counts.get(k.id)).map((k) => ({ id: k.id, label: k.label, count: counts.get(k.id), active: kind === k.id, onClick: () => setKind(kind === k.id ? "" : k.id) }))]}
            actions={
              <button className="btn-primary !py-1.5" onClick={() => emit("jarvis:palette", { mode: "files" })}>
                Enviar
              </button>
            }
          />
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {visible.length === 0 && (
              <EmptyState title={files.length ? "Nenhum arquivo encontrado" : "Nenhum arquivo ainda"}>
                {files.length ? "Tente outro nome ou limpe o filtro." : "Arraste PDFs, imagens, áudios ou textos para qualquer lugar da tela — ou use Enviar."}
              </EmptyState>
            )}
            {visible.map((f) => (
              <li key={f.id}>
                <button onClick={() => select(f.id)} aria-current={selected === f.id} className={`row-hover flex w-full items-center gap-3 border-b border-border px-3 py-3 text-left ${selected === f.id ? "bg-accent-soft" : ""}`}>
                  <span className="chip chip-static w-16 shrink-0 justify-center !px-1 text-xs">{fileTypeLabel(f.file_name, f.mime_type)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{f.file_name}</span>
                    <span className="block truncate text-xs text-muted">
                      {formatBytes(f.size_bytes)} · {timeAgo(f.created_at)}
                      {f.note ? ` · ${f.note.title}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      }
      empty={<PaneEmpty title="Selecione um arquivo">Veja a pré-visualização, a nota ligada e baixe ou apague.</PaneEmpty>}
      detail={current && <FileDetail key={current.id} file={current} onClose={() => select(null)} onDeleted={() => { select(null); router.refresh(); }} />}
    />
  );
}
