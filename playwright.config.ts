import { defineConfig } from "@playwright/test";

// Browser tests (`npm run test:e2e`). They build the app, start it on port 3100 with a fresh
// test database (.e2e/), and drive the installed Google Chrome.
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && tsx scripts/e2e-server.ts",
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
    // Test-only values, so the tests never touch real data or real passwords.
    env: {
      DATABASE_URL: "file:.e2e/e2e.db",
      DATABASE_AUTH_TOKEN: "",
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      BETTER_AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else-0123456789",
      SEED_ADMIN_PASSWORD: "e2e-admin-password",
      // The stand-in AI (works only with a local database file); never calls OpenAI.
      AI_FAKE: "1",
      OPENAI_API_KEY: "",
      RESEND_API_KEY: "",
      EMAIL_FROM: "",
    },
  },
});
