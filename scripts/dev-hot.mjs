import { spawn } from "node:child_process";
import { loadRootEnv, root } from "./env.mjs";

loadRootEnv();
normalizeLocalHotEnv();

const children = [
  run("api", ["run", "dev:api"]),
  run("web", ["run", "dev:web"]),
];

let shuttingDown = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    for (const child of children) {
      child.kill(signal);
    }
  });
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    for (const other of children) {
      if (other !== child) {
        other.kill("SIGTERM");
      }
    }
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

function run(name, args) {
  const child = spawn("npm", args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });

  child.on("error", (error) => {
    console.error(`[${name}] failed to start: ${error.message}`);
    process.exit(1);
  });

  return child;
}

function normalizeLocalHotEnv() {
  if (process.env.REPL_ID !== undefined) {
    return;
  }

  const frontendPort = process.env.LOCAL_FRONTEND_PORT ?? "3000";
  process.env.FRONTEND_PORT = frontendPort;

  const frontendOrigin = `http://localhost:${frontendPort}`;
  const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:8080";
  process.env.API_ORIGIN = apiOrigin;
  process.env.ALLOWED_ORIGINS = mergeList(
    process.env.ALLOWED_ORIGINS,
    frontendOrigin,
    apiOrigin,
  );
}

function mergeList(current, ...values) {
  const entries = new Set(
    (current ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

  for (const value of values) {
    entries.add(value);
  }

  return [...entries].join(",");
}
