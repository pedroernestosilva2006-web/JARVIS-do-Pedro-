import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      // "server-only" lança erro fora do bundler do Next; nos testes vira um módulo vazio
      "server-only": path.resolve(import.meta.dirname, "test/server-only-stub.ts"),
    },
  },
  test: { include: ["lib/**/*.test.ts", "test/**/*.test.ts"], exclude: ["node_modules/**"] },
});
