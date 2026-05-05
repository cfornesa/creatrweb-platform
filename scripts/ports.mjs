import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { root } from "./env.mjs";

export async function stopStaleServerOnPort(port) {
  const pids = await listeningPids(port);
  const blockedBy = [];

  for (const pid of pids) {
    if (pid === process.pid || pid === process.ppid) {
      continue;
    }

    const command = await processCommand(pid);
    if (!isSameRepoNodeProcess(command)) {
      blockedBy.push({ pid, command });
      continue;
    }

    process.kill(pid, "SIGTERM");
    await waitForExit(pid, 2_000);
    if (await isRunning(pid)) {
      process.kill(pid, "SIGKILL");
    }
  }

  if (blockedBy.length > 0) {
    const details = blockedBy
      .map(({ pid, command }) => `- ${pid}: ${command || "(unknown)"}`)
      .join("\n");
    throw new Error(
      `Port ${port} is already in use by a process outside this repo:\n${details}`,
    );
  }
}

async function listeningPids(port) {
  if (process.platform === "linux") {
    return listeningPidsFromProc(port);
  }

  return listeningPidsFromLsof(port);
}

async function listeningPidsFromProc(port) {
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
  if (process.platform === "linux") {
    try {
      const command = await fs.readFile(`/proc/${pid}/cmdline`, "utf8");
      return command.replaceAll("\0", " ").trim();
    } catch {
      return "";
    }
  }

  return capture("ps", ["-p", String(pid), "-o", "command="]);
}

function isSameRepoNodeProcess(command) {
  return (
    command.includes(root) &&
    /(^|\s)(?:\S+\/)?(?:node|npm|tsx|vite)(\s|$)/.test(command)
  );
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

async function listeningPidsFromLsof(port) {
  const result = await capture("lsof", ["-ti", `tcp:${port}`]).catch(() => "");
  return result
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
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
