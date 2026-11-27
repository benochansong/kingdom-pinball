import { createServer, type IncomingMessage } from "node:http";
import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { WebSocketServer, WebSocket } from "ws";
import { OnlineStore } from "./persistence";
import { ServerSimulation } from "./simulation";
import {
  DEFAULT_RULES,
  PROTOCOL,
  isRecord,
  roomRules,
  type RoomRules,
  type RoomView,
  type ServerMessage,
} from "../src/network/protocol";
interface Peer {
  ws: WebSocket;
  id?: string;
  tokens: number;
  commandTokens: number;
  last: number;
  authTimer: ReturnType<typeof setTimeout>;
}
interface Member {
  id: string;
  name: string;
  ready: boolean;
  disconnected: number | null;
  left?: boolean;
}
interface Room {
  saveError?: boolean;
  code: string;
  rules: RoomRules;
  players: Member[];
  sim?: ServerSimulation;
  created: number;
  finished?: number;
  settled: boolean;
}
export interface ServerOptions {
  port?: number;
  host?: string;
  database?: string;
  origins?: string[];
  maxRooms?: number;
  maxPlayers?: number;
  adminToken?: string;
  autoTick?: boolean;
}
export async function startServer(options: ServerOptions = {}) {
  const store = new OnlineStore(options.database ?? ":memory:");
  const rooms = new Map<string, Room>(),
    peers = new Map<string, Peer>(),
    waiting = new Set<string>(),
    ips = new Map<string, { count: number; until: number }>();
  const limits = {
    rooms: options.maxRooms ?? 5,
    players: options.maxPlayers ?? 32,
  };
  const origins = options.origins ?? [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:5176",
  ];
  let stopping = false,
    invalid = 0,
    disconnects = 0,
    saveFailures = 0,
    bytes = 0,
    steps = 0,
    totalStepMs = 0,
    maxStepMs = 0;
  const send = (p: Peer | undefined, message: ServerMessage) => {
    if (p?.ws.readyState === WebSocket.OPEN) {
      const body = JSON.stringify(message);
      if (p.ws.bufferedAmount > 1024 * 1024) {
        p.ws.close(4008, "Slow receiver");
        return;
      }
      if (p.ws.bufferedAmount > 256 * 1024 && message.type === "snapshot")
        return;
      p.ws.send(body);
      bytes += Buffer.byteLength(body);
    }
  };
  const error = (p: Peer, e: unknown, seq?: number) => {
    invalid++;
    send(p, {
      type: "error",
      message: e instanceof Error ? e.message : String(e),
      seq,
    });
  };
  const roomOf = (id: string) =>
    [...rooms.values()].find((r) =>
      r.players.some((p) => p.id === id && !p.left),
    );
  const roomView = (r: Room): RoomView => ({
    code: r.code,
    rules: r.rules,
    state: r.sim
      ? r.sim.result
        ? "FINISHED"
        : "RUNNING"
      : r.players.length === 2
        ? "READY"
        : "WAITING",
    players: r.players.map((p) => ({
      id: p.id,
      name: p.name,
      ready: p.ready,
      connected: peers.has(p.id),
    })),
  });
  const broadcast = (r: Room) => {
    for (const m of r.players)
      if (!m.left) send(peers.get(m.id), { type: "room", room: roomView(r) });
  };
  const snapshots = (r: Room) => {
    if (r.sim)
      r.players.forEach((p, i) => {
        if (!p.left) send(peers.get(p.id), r.sim!.snapshot(i));
      });
  };
  const settle = (r: Room) => {
    if (!r.sim?.result || r.settled) return;
    try {
      store.settle(
        r.players.map((p) => p.id),
        r.sim.result,
      );
      r.settled = true;
      r.finished = Date.now();
      broadcast(r);
      snapshots(r);
    } catch {
      saveFailures++; /* Retain finalized state and retry; never replay simulation. */
      if (!r.saveError)
        for (const p of r.players)
          send(peers.get(p.id), {
            type: "error",
            message: "경기 결과는 확정되었지만 저장을 재시도하고 있습니다.",
          });
      r.saveError = true;
    }
  };
  const remove = (r: Room) => {
    r.sim?.dispose();
    rooms.delete(r.code);
  };
  const leave = (id: string) => {
    waiting.delete(id);
    const r = roomOf(id);
    if (!r) return;
    if (r.sim && !r.sim.result)
      throw Error("진행 중 경기는 항복한 뒤 나갈 수 있습니다.");
    if (r.sim) {
      if (!r.settled)
        throw Error("경기 기록 저장을 재시도 중입니다. 잠시 후 나가세요.");
      r.players.find((p) => p.id === id)!.left = true;
      if (r.players.every((p) => p.left) && r.settled) remove(r);
    } else {
      r.players = r.players.filter((p) => p.id !== id);
      if (!r.players.length) remove(r);
      else broadcast(r);
    }
  };
  const create = (id: string, rules: RoomRules) => {
    if (stopping || rooms.size >= limits.rooms)
      throw Error("현재 서버의 방 한도에 도달했습니다.");
    if (roomOf(id)) throw Error("현재 방에서 먼저 나가세요.");
    let code = "";
    do {
      code = "KP-" + randomBytes(5).toString("hex").toUpperCase();
    } while (rooms.has(code));
    const p = store.profile(id),
      r: Room = {
        code,
        rules,
        players: [{ id, name: p.name, ready: false, disconnected: null }],
        created: Date.now(),
        settled: false,
      };
    rooms.set(code, r);
    return r;
  };
  const join = (id: string, code: string) => {
    if (roomOf(id)) throw Error("이미 방에 참가 중입니다.");
    const r = rooms.get(code);
    if (!r || r.sim || r.players.length >= 2)
      throw Error("입장 가능한 방을 찾지 못했습니다.");
    const p = store.profile(id);
    r.players.push({ id, name: p.name, ready: false, disconnected: null });
    broadcast(r);
    return r;
  };
  function allowIP(req: IncomingMessage) {
    const id = req.socket.remoteAddress ?? "unknown",
      now = Date.now();
    for (const [key, v] of ips) if (v.until < now) ips.delete(key);
    const bucket = ips.get(id) ?? { count: 0, until: now + 60000 };
    bucket.count++;
    if (ips.size < 2000 || ips.has(id)) ips.set(id, bucket);
    return bucket.count <= 40;
  }
  const http = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.url === "/health") {
      res.end(
        JSON.stringify({
          status: stopping ? "stopping" : "ok",
          version: PROTOCOL,
        }),
      );
      return;
    }
    if (req.url?.startsWith("/tables")) {
      const origin = req.headers.origin;
      if (origin && !origins.includes(origin)) {
        res.writeHead(403).end("{}");
        return;
      }
      if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "authorization,content-type",
      );
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
      if (req.method === "OPTIONS") {
        res.writeHead(204).end();
        return;
      }
      if (!allowIP(req)) {
        res.writeHead(429).end("{}");
        return;
      }
      try {
        const profile = store.authenticate(
          req.headers.authorization?.replace(/^Bearer /, ""),
        );
        const id = req.url.split("/")[2];
        if (req.method === "GET") {
          res.end(
            JSON.stringify(id ? store.table(id) : store.ownTables(profile.id)),
          );
          return;
        }
        if (req.method === "DELETE" && id) {
          if (!store.deleteTable(profile.id, id))
            throw Error("본인의 맵만 삭제할 수 있습니다.");
          res.end("{}");
          return;
        }
        if (req.method === "POST" && !id) {
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 262144) {
              res.writeHead(413).end("{}");
              return;
            }
            chunks.push(chunk);
          }
          res.end(
            JSON.stringify(
              store.shareTable(
                profile.id,
                Buffer.concat(chunks).toString("utf8"),
              ),
            ),
          );
          return;
        }
        res.writeHead(405).end("{}");
        return;
      } catch (e) {
        res.writeHead(400).end(
          JSON.stringify({
            error: e instanceof Error ? e.message : "요청 오류",
          }),
        );
        return;
      }
    }
    if (req.url === "/admin/metrics") {
      if (
        !options.adminToken ||
        req.headers.authorization !== `Bearer ${options.adminToken}`
      ) {
        res.writeHead(403).end("{}");
        return;
      }
      res.end(
        JSON.stringify({
          rooms: rooms.size,
          players: peers.size,
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          averageStepMs: totalStepMs / Math.max(1, steps),
          maxStepMs,
          bytes,
          invalid,
          disconnects,
          saveFailures,
          database: "sqlite",
        }),
      );
      return;
    }
    res.writeHead(404).end("{}");
  });
  http.requestTimeout = 15000;
  http.headersTimeout = 10000;
  http.maxHeadersCount = 40;
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 16384,
    perMessageDeflate: false,
  });
  http.on("upgrade", (req, socket, head) => {
    if (
      stopping ||
      req.url !== "/ws" ||
      !origins.includes(req.headers.origin ?? "") ||
      wss.clients.size >= limits.players ||
      !allowIP(req)
    ) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req),
    );
  });
  wss.on("connection", (ws: WebSocket) => {
    const peer: Peer = {
      ws,
      tokens: 120,
      commandTokens: 20,
      last: Date.now(),
      authTimer: setTimeout(
        () => ws.close(4003, "Authentication timeout"),
        5000,
      ),
    };
    ws.on("error", () => {});
    ws.on("message", (data, isBinary) => {
      try {
        const now = Date.now(),
          elapsed = (now - peer.last) / 1000;
        peer.last = now;
        peer.tokens = Math.min(120, peer.tokens + elapsed * 60);
        peer.commandTokens = Math.min(20, peer.commandTokens + elapsed * 10);
        if (--peer.tokens < 0) {
          ws.close(4008, "Rate limit");
          return;
        }
        if (isBinary) throw Error("JSON 메시지만 허용됩니다.");
        const m: unknown = JSON.parse(data.toString());
        if (!isRecord(m) || typeof m.type !== "string")
          throw Error("잘못된 메시지");
        if (!peer.id) {
          if (m.type !== "auth" || m.version !== PROTOCOL)
            throw Error("게임 버전을 확인하세요.");
          const auth = m.token
            ? { token: String(m.token), profile: store.authenticate(m.token) }
            : store.guest(m.name);
          peer.id = auth.profile.id;
          clearTimeout(peer.authTimer);
          const old = peers.get(peer.id);
          peers.set(peer.id, peer);
          old?.ws.close(4001, "Session replaced");
          send(peer, { type: "auth", ...auth });
          const r = roomOf(peer.id);
          if (r) {
            r.players.find((p) => p.id === peer.id)!.disconnected = null;
            broadcast(r);
            snapshots(r);
          }
          return;
        }
        if (m.type === "latency") {
          if (typeof m.at === "number" && Number.isFinite(m.at))
            send(peer, { type: "latency", at: m.at });
          return;
        }
        const id = peer.id;
        if (m.type === "command") {
          const r = roomOf(id),
            seat = r?.players.findIndex((p) => p.id === id) ?? -1;
          if (
            !r?.sim ||
            m.match !== r.sim.id ||
            !Number.isSafeInteger(m.seq) ||
            (m.seq as number) <= r.sim.ack[seat] ||
            (m.seq as number) > r.sim.ack[seat] + 1000
          )
            throw Error("경기 또는 입력 순서가 올바르지 않습니다.");
          if (!isRecord(m.command) || m.command.type !== "input") {
            if (--peer.commandTokens < 0)
              throw Error("명령 요청이 너무 빠릅니다.");
          }
          r.sim.ack[seat] = m.seq as number;
          const message = r.sim.command(seat, m.command);
          if (message) error(peer, message, m.seq as number);
          settle(r);
          return;
        }
        if (--peer.commandTokens < 0) throw Error("잠시 후 다시 요청하세요.");
        switch (m.type) {
          case "create":
            waiting.delete(id);
            broadcast(create(id, roomRules(m.rules)));
            break;
          case "join":
            if (typeof m.code !== "string" || m.code.length > 32)
              throw Error("잘못된 참가 코드");
            waiting.delete(id);
            join(id, m.code.toUpperCase());
            break;
          case "ready": {
            const r = roomOf(id);
            if (!r || r.sim) throw Error("준비 가능한 방이 없습니다.");
            r.players.find((p) => p.id === id)!.ready = true;
            if (
              r.players.length === 2 &&
              r.players.every((p) => p.ready && peers.has(p.id))
            )
              r.sim = new ServerSimulation(r.rules);
            broadcast(r);
            snapshots(r);
            break;
          }
          case "leave":
            leave(id);
            send(peer, { type: "left" });
            break;
          case "queue": {
            if (roomOf(id)) throw Error("방에서 나간 뒤 매칭하세요.");
            const opponent = [...waiting].find((p) => p !== id && peers.has(p));
            if (opponent) {
              waiting.delete(opponent);
              const r = create(opponent, { ...DEFAULT_RULES });
              join(id, r.code);
            } else {
              waiting.add(id);
              send(peer, { type: "queued" });
            }
            break;
          }
          case "cancelQueue":
            waiting.delete(id);
            send(peer, { type: "left" });
            break;
          case "profile":
            send(peer, { type: "profile", profile: store.profile(id) });
            break;
          case "history":
            send(peer, { type: "history", matches: store.history(id) });
            break;
          case "leaderboard":
            send(peer, { type: "leaderboard", players: store.leaderboard() });
            break;
          case "report":
            if (
              typeof m.target !== "string" ||
              typeof m.reason !== "string" ||
              m.reason.length < 2 ||
              m.reason.length > 500
            )
              throw Error("신고 내용을 확인하세요.");
            store.report(id, m.target, m.reason);
            break;
          default:
            throw Error("지원하지 않는 요청입니다.");
        }
      } catch (e) {
        error(peer, e);
      }
    });
    ws.on("close", () => {
      clearTimeout(peer.authTimer);
      if (peer.id && peers.get(peer.id) === peer) {
        peers.delete(peer.id);
        waiting.delete(peer.id);
        disconnects++;
        const r = roomOf(peer.id);
        if (r) {
          const seat = r.players.findIndex((p) => p.id === peer.id);
          r.players[seat].disconnected = Date.now();
          r.sim?.disconnect(seat);
          broadcast(r);
        }
      }
    });
  });
  let last = performance.now(),
    accumulator = 0;
  const update = () => {
    const now = performance.now();
    accumulator += now - last;
    last = now;
    if (accumulator > 2000) {
      for (const r of rooms.values())
        r.sim?.finish(null, "서버 처리 지연으로 경기 중단");
      accumulator = 0;
    }
    let count = 0;
    while (accumulator >= 1000 / 30 && count++ < 5) {
      accumulator -= 1000 / 30;
      const before = performance.now();
      for (const r of rooms.values())
        if (r.sim && !r.sim.result) {
          try {
            r.sim.step();
            if (r.sim.tick % 2 === 0) snapshots(r);
          } catch {
            r.sim.finish(null, "서버 시뮬레이션 오류");
          }
        }
      const ms = performance.now() - before;
      steps++;
      totalStepMs += ms;
      maxStepMs = Math.max(maxStepMs, ms);
    }
    for (const r of rooms.values()) {
      if (r.sim) {
        const expired = r.players.map(
          (p) =>
            p.disconnected !== null && Date.now() - p.disconnected >= 60000,
        );
        if (expired.every(Boolean)) r.sim.finish(null, "양쪽 연결 종료");
        else if (expired.some(Boolean) && r.rules.mode === "duel")
          r.sim.finish(expired[0] ? 1 : 0, "재접속 유예 60초 종료");
        settle(r);
        if (r.finished && r.settled && Date.now() - r.finished > 60000)
          remove(r);
      } else if (Date.now() - r.created > 600000) remove(r);
    }
  };
  const timer =
    options.autoTick === false ? undefined : setInterval(update, 10);
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(options.port ?? 8787, options.host ?? "127.0.0.1", resolve);
  });
  const address = http.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    port,
    store,
    rooms,
    update,
    metrics: () => ({
      rooms: rooms.size,
      peers: peers.size,
      bytes,
      steps,
      totalStepMs,
      maxStepMs,
      invalid,
    }),
    async close() {
      stopping = true;
      if (timer) clearInterval(timer);
      for (const r of rooms.values()) {
        r.sim?.finish(null, "서버 종료 · 점수 변동 없음");
        settle(r);
        r.sim?.dispose();
      }
      for (const p of wss.clients) p.close(1001, "Server shutdown");
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
      store.close();
    },
  };
}
