import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @jarvis/core é TypeScript em um pacote do monorepo (sem build próprio)
  transpilePackages: ["@jarvis/core"],
  poweredByHeader: false,
  // Endereços antigos continuam válidos: a Inbox virou a gaveta "Revisar" e a nota abre ao lado da lista.
  async redirects() {
    return [
      { source: "/inbox", destination: "/graph?review=1", permanent: false },
      { source: "/notes/:id([0-9a-fA-F-]{36})", destination: "/notes?sel=:id", permanent: false },
    ];
  },
};

export default nextConfig;
