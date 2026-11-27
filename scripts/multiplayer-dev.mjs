import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
const children = [
  ["node_modules/tsx/dist/cli.mjs", "watch", "server/index.ts"],
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"],
].map((args) =>
  spawn(process.execPath, args, {
    stdio: "inherit",
    windowsHide: true,
    env: process.env,
  }),
);
let stopped = false;
const stop = () => {
  if (stopped) return;
  stopped = true;
  for (const child of children) child.kill();
};
for (const child of children) {
  child.on("error", (e) => {
    console.error(e.message);
    stop();
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    stop();
    process.exitCode = code ?? 0;
  });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
