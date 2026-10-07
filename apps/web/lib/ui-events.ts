/**
 * Eventos da interface (window) que ligam shell, grafo, painéis e dock sem prop drilling.
 * - jarvis:changed  → algo foi criado/editado (grafo, listas e contadores recarregam)
 * - jarvis:palette  → abre a barra de comando ({ mode?: "files" })
 * - jarvis:dock     → abre o chat rápido ({ question?: string })
 * - jarvis:review   → abre a gaveta de revisão
 * - jarvis:focus    → seleciona um nó no grafo ({ id })
 * - jarvis:local    → abre o grafo local de uma nota ({ id, depth })
 * - jarvis:toast    → aviso discreto ({ text, tone? })
 */
export type UiEvent = "jarvis:changed" | "jarvis:palette" | "jarvis:dock" | "jarvis:review" | "jarvis:focus" | "jarvis:local" | "jarvis:toast";

export function emit<T = unknown>(name: UiEvent, detail?: T) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function on<T = unknown>(name: UiEvent, fn: (detail: T) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<T>).detail);
  window.addEventListener(name, h);
  return () => window.removeEventListener(name, h);
}

export function notifyChanged() {
  emit("jarvis:changed");
}

/** Resolve o título de uma nota (citação do Jarvis) para o id, sem criar nada. */
export async function resolveNoteId(title: string): Promise<string | null> {
  try {
    const r = await fetch(`/api/notes/titles?q=${encodeURIComponent(title)}`);
    if (!r.ok) return null;
    const list = (await r.json()) as { id: string; title: string }[];
    const exact = list.find((n) => n.title.toLowerCase() === title.toLowerCase());
    return (exact ?? list[0])?.id ?? null;
  } catch {
    return null;
  }
}

export function toast(text: string, tone: "ok" | "error" = "ok") {
  emit("jarvis:toast", { text, tone });
}
