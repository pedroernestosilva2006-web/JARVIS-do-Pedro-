"use client";

/**
 * Layout padrão das listas (Notas, Timeline, Arquivos): lista à esquerda + leitura à direita.
 * No celular mostra uma coluna por vez (a leitura cobre a lista quando há seleção).
 */
export function SplitView({ list, detail, hasSelection, empty }: { list: React.ReactNode; detail: React.ReactNode; hasSelection: boolean; empty: React.ReactNode }) {
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]">
      <section aria-label="Lista" className={`min-h-0 min-w-0 flex-col border-border md:flex md:border-r ${hasSelection ? "hidden" : "flex"}`}>
        {list}
      </section>
      <section aria-label="Leitura" className={`min-h-0 min-w-0 bg-surface ${hasSelection ? "block" : "hidden md:block"}`}>
        {hasSelection ? detail : empty}
      </section>
    </div>
  );
}

export function PaneEmpty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
      <p className="text-base font-medium">{title}</p>
      {children && <p className="max-w-xs text-sm text-muted">{children}</p>}
    </div>
  );
}
