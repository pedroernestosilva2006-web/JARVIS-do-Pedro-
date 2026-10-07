"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/graph", label: "Cérebro", n: "01" },
  { href: "/notes", label: "Notas", n: "02" },
  { href: "/files", label: "Arquivos", n: "03" },
  { href: "/chat", label: "Jarvis", n: "04" },
  { href: "/inbox", label: "Revisar", n: "05" },
  { href: "/settings", label: "Ajustes", n: "06" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex flex-row gap-1 md:flex-col md:gap-0">
      {NAV.map((item) => {
        const active = path === item.href || path.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`group flex items-center gap-3 whitespace-nowrap px-2 py-2 text-[11px] uppercase tracking-[0.18em] transition md:border-b md:border-border md:py-3 ${
              active ? "text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            <span className={`hidden font-mono text-[10px] md:inline ${active ? "text-[var(--signal)]" : "text-border-strong"}`}>{item.n}</span>
            {item.label}
            {active && <span className="ml-auto hidden h-1 w-1 bg-[var(--signal)] md:block" />}
          </Link>
        );
      })}
    </nav>
  );
}
