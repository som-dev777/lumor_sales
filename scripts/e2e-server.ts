// Starts the built app for the browser tests (`npm run test:e2e`), on a brand-new database in
// .e2e/ (never your real data/app.db). Playwright runs this and stops it afterwards.
import { execFileSync, spawn } from "node:child_process";
import { rmSync } from "node:fs";

rmSync(".e2e", { recursive: true, force: true });
const run = (script: string) =>
  execFileSync("npm", ["run", script], { stdio: "inherit", env: process.env });
run("db:migrate");
run("seed:admin");
run("seed:library");
run("seed:plans");

const server = spawn("npx", ["next", "start", "-p", "3100"], {
  stdio: "inherit",
  env: process.env,
});
const stop = () => server.kill("SIGTERM");
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", (code) => process.exit(code ?? 0));
