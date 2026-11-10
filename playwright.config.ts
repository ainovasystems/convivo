import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

// Las pruebas e2e con datos necesitan Supabase (local: `npx supabase start`).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const PORT = Number(process.env.PORT ?? 3000);
// Segundo servidor con la indexación ENCENDIDA (tests/e2e/seo.spec.ts): el primero es la web de pruebas.
const PORT_INDEXING = Number(process.env.PORT_INDEXING ?? 3100);
export const INDEXING_SITE_URL = "https://convivo.example.test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-ES",
    trace: "on-first-retry",
  },
  projects: [
    { name: "movil", use: { ...devices["Pixel 7"] } },
    { name: "escritorio", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      command: `npm run start -- -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // Web de pruebas: indexación apagada (el valor por defecto, dicho explícitamente).
      env: { INDEXING_ENABLED: "false", indexing: "" },
    },
    {
      command: `npm run start -- -p ${PORT_INDEXING}`,
      url: `http://localhost:${PORT_INDEXING}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { INDEXING_ENABLED: "true", indexing: "", NEXT_PUBLIC_SITE_URL: INDEXING_SITE_URL },
    },
  ],
});
