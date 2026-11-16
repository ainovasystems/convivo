import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig usa jsx: preserve (Next); para las pruebas de componentes se transforma aquí.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/db/**/*.test.ts", "src/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
