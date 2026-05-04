import { spawn } from "node:child_process";
import { loadRootEnv, root } from "./env.mjs";

loadRootEnv();

await run(["run", "typecheck"]);
await run(["run", "build", "--workspaces", "--if-present"]);

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", args, {
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
        reject(new Error(`npm ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}
