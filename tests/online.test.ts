import { describe, it, expect } from "vitest";
import { WebSocket } from "ws";
import { startServer } from "../server/server";
import { ServerSimulation } from "../server/simulation";
import { OnlineStore, elo } from "../server/persistence";
import {
  DEFAULT_RULES,
  PROTOCOL,
  type ServerMessage,
} from "../src/network/protocol";
const until = async (check: () => boolean) => {
  const end = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > end) throw Error("network timeout");
    await new Promise((r) => setTimeout(r, 10));
  }
};
describe("online authority", () => {
  it("starts with identical resources and independent physics, rejects forged state and settles once", () => {
    const sim = new ServerSimulation({ ...DEFAULT_RULES });
    expect(sim.games[0].physics).not.toBe(sim.games[1].physics);
    expect(sim.games[0].economy!.data.resources).toEqual(
      sim.games[1].economy!.data.resources,
    );
    expect(sim.command(0, { type: "resources", gold: 999999 })).toBeTruthy();
    expect(
      sim.command(0, {
        type: "train",
        id: sim.games[1].army!.buildings[0].id,
        kind: "swordsman",
        count: 1,
      }),
    ).toBeTruthy();
    expect(
      sim.command(0, { type: "input", left: true, right: false, launch: true }),
    ).toBeNull();
    for (let i = 0; i < 20; i++) sim.step();
    sim.command(0, { type: "input", left: false, right: false, launch: false });
    sim.step();
    expect(sim.games[0].physics.launched).toBe(true);
    expect(sim.games[1].physics.launched).toBe(false);
    const own = sim.snapshot(0);
    expect(own.opponent).not.toHaveProperty("resources");
    expect(own.opponent).not.toHaveProperty("magic");
    const db = new OnlineStore(),
      a = db.guest("검증왕 A"),
      b = db.guest("검증왕 B");
    sim.command(0, { type: "surrender" });
    expect(sim.result!.winner).toBe(1);
    expect(db.settle([a.profile.id, b.profile.id], sim.result!)).toBe(true);
    expect(db.settle([a.profile.id, b.profile.id], sim.result!)).toBe(false);
    expect(db.profile(b.profile.id).wins).toBe(1);
    expect(sim.command(1, { type: "nudge" })).toBeTruthy();
    expect(() => db.authenticate(a.profile.id)).toThrow();
    expect(db.authenticate(a.token).id).toBe(a.profile.id);
    expect(elo(1000, 1000, 1)).toBe(16);
    sim.dispose();
    db.close();
  });
  it("connects two real WebSocket clients, readies, rejects replay and reconnects to the same match", async () => {
    const app = await startServer({
      port: 0,
      origins: ["http://localhost:5173"],
    });
    const sockets: WebSocket[] = [];
    const open = async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`, {
        origin: "http://localhost:5173",
      });
      sockets.push(ws);
      const messages: ServerMessage[] = [];
      ws.on("message", (data) => messages.push(JSON.parse(data.toString())));
      await until(() => ws.readyState === WebSocket.OPEN);
      return { ws, messages, send: (m: unknown) => ws.send(JSON.stringify(m)) };
    };
    try {
      const a = await open(),
        b = await open();
      a.send({ type: "auth", version: PROTOCOL, name: "네트워크 A" });
      b.send({ type: "auth", version: PROTOCOL, name: "네트워크 B" });
      await until(
        () =>
          a.messages.some((m) => m.type === "auth") &&
          b.messages.some((m) => m.type === "auth"),
      );
      const auth = a.messages.find((m) => m.type === "auth")!;
      if (auth.type !== "auth") throw Error();
      a.send({ type: "create", rules: DEFAULT_RULES });
      await until(() => a.messages.some((m) => m.type === "room"));
      const room = a.messages.find((m) => m.type === "room")!;
      if (room.type !== "room") throw Error();
      b.send({ type: "join", code: room.room.code });
      await until(() => b.messages.some((m) => m.type === "room"));
      a.send({ type: "ready" });
      b.send({ type: "ready" });
      await until(
        () =>
          a.messages.some((m) => m.type === "snapshot") &&
          b.messages.some((m) => m.type === "snapshot"),
      );
      const snap = a.messages.find((m) => m.type === "snapshot")!;
      if (snap.type !== "snapshot") throw Error();
      const command = {
        type: "command",
        match: snap.match,
        seq: 1,
        command: { type: "input", left: true, right: false, launch: true },
      };
      a.send(command);
      a.send(command);
      await until(() => a.messages.some((m) => m.type === "error"));
      a.ws.close();
      await until(() => a.ws.readyState === WebSocket.CLOSED);
      const again = await open();
      again.send({ type: "auth", version: PROTOCOL, token: auth.token });
      await until(() => again.messages.some((m) => m.type === "snapshot"));
      const restored = again.messages.find((m) => m.type === "snapshot")!;
      if (restored.type !== "snapshot") throw Error();
      expect(restored.match).toBe(snap.match);
      expect(restored.ack).toBe(1);
      again.send({
        type: "command",
        match: snap.match,
        seq: 2,
        command: { type: "surrender" },
      });
      await until(() =>
        b.messages.some((m) => m.type === "snapshot" && !!m.result),
      );
      expect(app.store.history(auth.profile.id)).toHaveLength(1);
    } finally {
      for (const ws of sockets) ws.terminate();
      await app.close();
    }
  });
});
