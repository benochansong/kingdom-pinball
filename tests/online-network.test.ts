import { it, expect } from "vitest";
import { WebSocket } from "ws";
import { startServer } from "../server/server";
import {
  DEFAULT_RULES,
  PROTOCOL,
  type ServerMessage,
} from "../src/network/protocol";
import { newTable } from "../src/modes/TableCreator";
const until = async (test: () => boolean) => {
  const end = Date.now() + 4000;
  while (!test()) {
    if (Date.now() > end) throw Error("Expected server message did not arrive");
    await new Promise((r) => setTimeout(r, 10));
  }
};
it("handles 50/100/200/300ms application delivery delay and isolates malformed clients", async () => {
  const app = await startServer({
    port: 0,
    origins: ["http://localhost:5173"],
  });
  const sockets: WebSocket[] = [];
  const open = async (name: string) => {
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`, {
        origin: "http://localhost:5173",
      }),
      messages: ServerMessage[] = [];
    sockets.push(ws);
    ws.on("error", () => {});
    ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
    await until(() => ws.readyState === 1);
    ws.send(JSON.stringify({ type: "auth", name, version: PROTOCOL }));
    await until(() => messages.some((m) => m.type === "auth"));
    return { ws, messages, send: (v: unknown) => ws.send(JSON.stringify(v)) };
  };
  try {
    const a = await open("지연 왕 A"),
      b = await open("지연 왕 B");
    a.send({ type: "create", rules: DEFAULT_RULES });
    await until(() => a.messages.some((m) => m.type === "room"));
    const r = a.messages.find((m) => m.type === "room")!;
    if (r.type !== "room") throw Error();
    b.send({ type: "join", code: r.room.code });
    await until(() => b.messages.some((m) => m.type === "room"));
    a.send({ type: "ready" });
    b.send({ type: "ready" });
    await until(() => a.messages.some((m) => m.type === "snapshot"));
    const snap = a.messages.find((m) => m.type === "snapshot")!;
    if (snap.type !== "snapshot") throw Error();
    let seq = 0;
    for (const delay of [50, 100, 200, 300]) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      a.send({
        type: "command",
        match: snap.match,
        seq: ++seq,
        command: { type: "input", left: true, right: false, launch: true },
      });
      await until(() =>
        a.messages.some((m) => m.type === "snapshot" && m.ack === seq),
      );
    }
    a.send({
      type: "command",
      match: "other-match",
      seq: seq + 1,
      command: { type: "surrender" },
    });
    await until(() => a.messages.some((m) => m.type === "error"));
    expect(app.rooms.get(r.room.code)!.sim!.result).toBeNull();
    const auth = a.messages.find((m) => m.type === "auth")!;
    if (auth.type !== "auth") throw Error();
    const base = `http://127.0.0.1:${app.port}/tables`,
      headers = {
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      };
    const response = await fetch(base, {
      method: "POST",
      headers,
      body: JSON.stringify(newTable("Classic")),
    });
    expect(response.status).toBe(200);
    const shared = (await response.json()) as { id: string };
    expect((await fetch(base + "/" + shared.id, { headers })).status).toBe(200);
    expect(
      (await fetch(base, { method: "POST", headers, body: "a".repeat(270000) }))
        .status,
    ).toBe(413);
    const bad = await open("위조 검사");
    bad.send({ type: "rating", value: 999999 });
    await until(() => bad.messages.some((m) => m.type === "error"));
    bad.ws.send("x".repeat(17000));
    await until(() => bad.ws.readyState === WebSocket.CLOSED);
    b.send({ type: "latency", at: 12345 });
    await until(() =>
      b.messages.some((m) => m.type === "latency" && m.at === 12345),
    );
    expect(app.rooms.get(r.room.code)!.sim!.time).toBeGreaterThan(500);
  } finally {
    for (const ws of sockets) ws.terminate();
    await app.close();
  }
}, 15000);
