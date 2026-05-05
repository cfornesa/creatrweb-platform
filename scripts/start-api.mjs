import path from "node:path";
import { spawn } from "node:child_process";
import { loadRootEnv } from "./env.mjs";
import { stopStaleServerOnPort } from "./ports.mjs";

loadRootEnv();

const entry = process.argv[2];
if (!entry) {
  console.error("Usage: node scripts/start-api.mjs <entrypoint>");
  process.exit(1);
}

await stopStaleServerOnPort(process.env.PORT ?? "8080");

const child = spawn(
  process.execPath,
  ["--enable-source-maps", path.resolve(process.cwd(), entry)],
  {
    env: process.env,
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
