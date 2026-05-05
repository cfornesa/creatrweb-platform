import { spawn } from "node:child_process";
import { loadRootEnv, root } from "./env.mjs";
import { stopStaleServerOnPort } from "./ports.mjs";

loadRootEnv();

await run(["run", "build"]);
await stopStaleServerOnPort(process.env.PORT ?? "8080");
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
