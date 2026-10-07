import { ListSkeleton } from "@/components/ui";

/** Esqueleto enquanto a tela carrega (em vez de uma tela vazia). */
export default function Loading() {
  return (
    <div className="grid h-full md:grid-cols-[minmax(20rem,26rem)_1fr]">
      <div className="border-border md:border-r">
        <div className="space-y-3 border-b border-border p-3">
          <div className="skeleton h-6 w-32" />
          <div className="skeleton h-10 w-full" />
        </div>
        <ListSkeleton rows={9} />
      </div>
      <div className="hidden space-y-4 p-6 md:block" role="status" aria-label="Carregando">
        <div className="skeleton h-7 w-1/2" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-5/6" />
        <div className="skeleton h-32 w-full" />
      </div>
    </div>
  );
}
