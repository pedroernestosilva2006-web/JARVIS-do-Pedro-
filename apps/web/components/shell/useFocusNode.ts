"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import { emit } from "@/lib/ui-events";

/** "Pular para o nó": no Cérebro só seleciona; em outras telas navega para /graph?focus=… */
export function useFocusNode() {
  const router = useRouter();
  const path = usePathname();
  return useCallback(
    (id: string, opts?: { local?: number }) => {
      if (path === "/graph") {
        emit("jarvis:focus", { id });
        if (opts?.local) emit("jarvis:local", { id, depth: opts.local });
      } else {
        router.push(`/graph?focus=${id}${opts?.local ? `&local=${opts.local}` : ""}`);
      }
    },
    [path, router],
  );
}
