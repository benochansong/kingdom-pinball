import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { startServer } from "./server";
if (existsSync(".env")) process.loadEnvFile(".env");
const production = process.env.NODE_ENV === "production";
const origin =
  process.env.APP_ORIGIN ??
  (process.env.APP_DOMAIN ? `https://${process.env.APP_DOMAIN}` : undefined);
if (
  production &&
  (!origin || !process.env.ALLOWED_ORIGINS || !process.env.DATABASE_URL)
)
  throw Error(
    "Production requires APP_ORIGIN (or APP_DOMAIN), ALLOWED_ORIGINS and DATABASE_URL.",
  );
if (
  production &&
  (!origin?.startsWith("https://") ||
    process.env
      .ALLOWED_ORIGINS!.split(",")
      .some((v) => !v.trim().startsWith("https://")))
)
  throw Error(
    "Production origins must use HTTPS. Terminate WSS at a trusted reverse proxy.",
  );
for (const [name, value, max] of [
  ["SERVER_PORT", process.env.SERVER_PORT ?? 8787, 65535],
  ["MAX_ROOMS", process.env.MAX_ROOMS ?? 5, 20],
  ["MAX_PLAYERS", process.env.MAX_PLAYERS ?? 32, 128],
] as const)
  if (
    !Number.isInteger(Number(value)) ||
    Number(value) < 1 ||
    Number(value) > max
  )
    throw Error(`${name} must be an integer in 1..${max}.`);
const database = process.env.DATABASE_URL ?? "./data/online.sqlite";
if (database !== ":memory:") mkdirSync(dirname(database), { recursive: true });
const app = await startServer({
  port: Number(process.env.SERVER_PORT ?? 8787),
  host: process.env.SERVER_HOST ?? "127.0.0.1",
  database,
  origins:
    process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()) ??
    (origin ? [origin] : undefined),
  maxRooms: Number(process.env.MAX_ROOMS ?? 5),
  maxPlayers: Number(process.env.MAX_PLAYERS ?? 32),
  adminToken: process.env.ADMIN_TOKEN,
});
console.log(`KINGDOM PINBALL server listening on port ${app.port}`);
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    void app.close().then(() => process.exit(0));
  });
