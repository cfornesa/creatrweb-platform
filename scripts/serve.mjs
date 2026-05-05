import fs from "node:fs/promises";
import path from "node:path";
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
  if (process.platform !== "linux") {
    return [];
  }

  const socketInodes = await listeningSocketInodes(Number(port));
  if (socketInodes.size === 0) {
    return [];
  }

  const procEntries = await fs.readdir("/proc", { withFileTypes: true });
  const pids = new Set();

  for (const entry of procEntries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) {
      continue;
    }

    const pid = Number(entry.name);
    const fdPath = path.join("/proc", entry.name, "fd");
    let fdEntries;
    try {
      fdEntries = await fs.readdir(fdPath);
    } catch {
      continue;
    }

    for (const fd of fdEntries) {
      let target;
      try {
        target = await fs.readlink(path.join(fdPath, fd));
      } catch {
        continue;
      }

      const match = /^socket:\[(\d+)\]$/.exec(target);
      if (match && socketInodes.has(match[1])) {
        pids.add(pid);
        break;
      }
    }
  }

  return [...pids];
}

async function processCommand(pid) {
  try {
    const command = await fs.readFile(`/proc/${pid}/cmdline`, "utf8");
    return command.replaceAll("\0", " ").trim();
  } catch {
    return "";
  }
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

async function listeningSocketInodes(port) {
  const inodes = new Set();
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let content;
    try {
      content = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }

    for (const line of content.trim().split(/\r?\n/).slice(1)) {
      const columns = line.trim().split(/\s+/);
      const localAddress = columns[1];
      const state = columns[3];
      const inode = columns[9];
      const localPortHex = localAddress?.split(":")[1];

      if (!localPortHex || !inode || state !== "0A") {
        continue;
      }

      if (Number.parseInt(localPortHex, 16) === port) {
        inodes.add(inode);
      }
    }
  }

  return inodes;
}
