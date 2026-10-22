import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    // Database tests each use a real SQLite file; a few at a time keeps them reliable on a busy
    // machine (unlimited workers timed out under load).
    maxWorkers: 4,
  },
});
