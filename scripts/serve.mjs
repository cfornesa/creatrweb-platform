import { spawn } from "node:child_process";
import { loadRootEnv, root } from "./env.mjs";

loadRootEnv();

await run(["run", "build"]);
await stopStaleReplitServer();
await runNode(["--enable-source-maps", "artifacts/api-server/dist/index.mjs"]);

function run(args) {
  return spawnAndWait("npm", args);
}

function runNode(args) {
  return spawnAndWait(process.execPath, args);
}

function spawnAndWait(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

async function stopStaleReplitServer() {
  if (process.env.REPL_ID === undefined) {
    return;
  }

  const port = process.env.PORT ?? "8080";
  const pids = await listeningPids(port);
  for (const pid of pids) {
    if (pid === process.pid || pid === process.ppid) {
      continue;
    }

    const command = await processCommand(pid);
    if (!command.includes(root)) {
      continue;
    }

    process.kill(pid, "SIGTERM");
    await waitForExit(pid, 2_000);
    if (await isRunning(pid)) {
      process.kill(pid, "SIGKILL");
    }
  }
}

async function listeningPids(port) {
  const result = await capture("lsof", ["-ti", `tcp:${port}`]);
  return result
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

async function processCommand(pid) {
  return capture("ps", ["-p", String(pid), "-o", "command="]);
}

async function waitForExit(pid, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!(await isRunning(pid))) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || code === 1) {
        resolve(stdout);
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed: ${stderr}`));
      }
    });
  });
}
