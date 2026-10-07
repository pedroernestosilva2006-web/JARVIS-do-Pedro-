import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @jarvis/core é TypeScript em um pacote do monorepo (sem build próprio)
  transpilePackages: ["@jarvis/core"],
  poweredByHeader: false,
};

export default nextConfig;
