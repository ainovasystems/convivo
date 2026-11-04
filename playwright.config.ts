import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

// Las pruebas e2e con datos necesitan Supabase (local: `npx supabase start`).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const PORT = Number(process.env.PORT ?? 3000);

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
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
