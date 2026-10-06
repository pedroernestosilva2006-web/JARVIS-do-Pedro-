import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { signOut } from "./actions";

const NAV = [
  { href: "/inbox", label: "Inbox", icon: "📥" },
  { href: "/notes", label: "Notas", icon: "🗒️" },
  { href: "/graph", label: "Grafo", icon: "🕸️" },
  { href: "/chat", label: "Jarvis", icon: "💬" },
  { href: "/timeline", label: "Timeline", icon: "📅" },
  { href: "/settings", label: "Configurações", icon: "⚙️" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireWorkspace();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-row items-center gap-1 overflow-x-auto border-b border-border bg-panel px-2 py-2 md:w-52 md:flex-col md:items-stretch md:border-b-0 md:border-r md:px-3 md:py-4">
        <Link href="/inbox" className="mr-2 whitespace-nowrap px-2 text-lg font-bold md:mb-4 md:mr-0">
          <span className="text-accent">●</span> JARVIS
        </Link>
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className="whitespace-nowrap rounded-md px-2 py-1.5 text-sm text-muted hover:bg-panel-2 hover:text-foreground"
          >
            <span className="mr-2">{n.icon}</span>
            {n.label}
          </Link>
        ))}
        <div className="ml-auto md:mt-auto md:ml-0">
          <p className="hidden truncate px-2 text-xs text-muted md:block">{user.email}</p>
          <form action={signOut}>
            <button className="px-2 py-1 text-xs text-muted hover:text-foreground">Sair</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
