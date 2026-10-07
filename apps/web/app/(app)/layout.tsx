import Link from "next/link";
import { CheckerMark, JarvisMark } from "@/components/brand/motifs";
import { NavLinks } from "@/components/brand/NavLinks";
import { AddModal } from "@/components/add/AddModal";
import { aiProvider } from "@/lib/ai/llm";
import { requireWorkspace } from "@/lib/workspace";
import { signOut } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, internal } = await requireWorkspace();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="sticky top-0 z-20 flex shrink-0 flex-row items-center gap-2 overflow-x-auto border-b border-border bg-background/95 px-3 py-2 backdrop-blur md:h-screen md:w-56 md:flex-col md:items-stretch md:gap-0 md:overflow-visible md:border-b-0 md:border-r md:px-5 md:py-6">
        <Link href="/graph" className="mr-2 flex shrink-0 items-center gap-2.5 text-foreground md:mb-10 md:mr-0">
          <JarvisMark className="h-6 w-6" />
          <span className="display text-[13px] tracking-[0.2em]">Jarvis</span>
        </Link>
        <div className="kicker mb-3 hidden md:block">Segundo cérebro</div>
        <div className="order-last ml-auto shrink-0 md:order-none md:ml-0"><AddModal aiReady={aiProvider().kind !== "none"} /></div>
        <NavLinks />
        <div className="ml-auto flex items-center gap-3 md:mt-auto md:ml-0 md:block">
          <CheckerMark className="mb-4 hidden text-foreground/50 md:block" />
          <p className="hidden truncate text-[11px] text-muted md:block">{internal ? "Acesso interno" : user.email}</p>
          {!internal && (
            <form action={signOut}>
              <button className="text-[11px] uppercase tracking-[0.18em] text-muted hover:text-foreground md:mt-2">Sair</button>
            </form>
          )}
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
