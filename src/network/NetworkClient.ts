import {
  PROTOCOL,
  type ClientMessage,
  type GameCommand,
  type ServerMessage,
  type Snapshot,
} from "./protocol";
export class NetworkClient {
  socket?: WebSocket;
  token = "";
  id = "";
  seq = 0;
  match = "";
  ping = 0;
  lastSnapshot = 0;
  connected = false;
  onMessage: (message: ServerMessage) => void = () => {};
  onStatus: (status: string) => void = () => {};
  private retry?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private stopped = false;
  private attempt = 0;
  constructor(readonly url: string) {
    try {
      this.token = sessionStorage.getItem(`kingdom-online:${url}`) ?? "";
    } catch {
      /* Storage is optional. */
    }
  }
  connect(name = "왕국 탐험가") {
    this.stopped = false;
    this.onStatus(this.attempt ? "재접속 중…" : "서버 연결 중…");
    this.socket = new WebSocket(this.url);
    this.socket.onopen = () =>
      this.send({
        type: "auth",
        version: PROTOCOL,
        name,
        token: this.token || undefined,
      });
    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type === "auth") {
          this.connected = true;
          this.attempt = 0;
          this.token = message.token;
          this.id = message.profile.id;
          try {
            sessionStorage.setItem(`kingdom-online:${this.url}`, this.token);
          } catch {}
          this.onStatus("연결됨");
          if (this.heartbeat) clearInterval(this.heartbeat);
          this.heartbeat = setInterval(
            () => this.send({ type: "latency", at: performance.now() }),
            2000,
          );
        }
        if (message.type === "latency")
          this.ping = Math.max(0, performance.now() - message.at);
        if (message.type === "snapshot") {
          if (this.match !== message.match) {
            this.match = message.match;
            this.seq = message.ack;
          }
          this.seq = Math.max(this.seq, message.ack);
          this.lastSnapshot = performance.now();
        }
        this.onMessage(message);
      } catch {
        this.onStatus("서버 메시지 형식 오류");
      }
    };
    this.socket.onerror = () =>
      this.onStatus("서버에 연결할 수 없습니다. 서버 실행 주소를 확인하세요.");
    this.socket.onclose = (e) => {
      this.connected = false;
      if (this.heartbeat) clearInterval(this.heartbeat);
      if (this.stopped) return;
      if (e.code === 4001 || e.code === 4003) {
        this.onStatus(
          e.code === 4001
            ? "다른 연결에서 이 세션을 사용 중입니다."
            : "인증 실패 · 새 게스트로 접속하세요.",
        );
        return;
      }
      this.onStatus(
        "연결 끊김 · 서버 전투는 계속됩니다. 60초 안에 재접속하세요.",
      );
      this.retry = setTimeout(
        () => {
          this.attempt++;
          this.connect(name);
        },
        Math.min(5000, 500 * 2 ** this.attempt),
      );
    };
  }
  send(message: ClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(message));
  }
  command(command: GameCommand) {
    if (!this.connected || !this.match) return;
    this.send({ type: "command", match: this.match, seq: ++this.seq, command });
  }
  close() {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.socket?.close();
    this.connected = false;
  }
}
/** Presentation only: interpolate snapshots; never derive rewards or combat from it. */
export class SnapshotBuffer {
  frames: { snapshot: Snapshot; at: number }[] = [];
  push(snapshot: Snapshot, at = performance.now()) {
    const last = this.frames.at(-1);
    if (
      last &&
      last.snapshot.match === snapshot.match &&
      snapshot.tick <= last.snapshot.tick
    )
      return;
    if (last?.snapshot.match !== snapshot.match) this.frames = [];
    this.frames.push({ snapshot, at });
    if (this.frames.length > 6) this.frames.shift();
  }
  sample(now = performance.now()) {
    const latest = this.frames.at(-1);
    if (!latest) return null;
    const target = now - 70;
    let a = this.frames[0],
      b = latest;
    for (let i = 1; i < this.frames.length; i++)
      if (this.frames[i].at >= target) {
        a = this.frames[i - 1];
        b = this.frames[i];
        break;
      }
    const t =
      a === b ? 1 : Math.max(0, Math.min(1, (target - a.at) / (b.at - a.at)));
    const blend = <T extends { id: string | number; x: number; y: number }>(
      older: T[],
      newer: T[],
    ) =>
      newer.map((p) => {
        const old = older.find((v) => v.id === p.id);
        return old
          ? { ...p, x: old.x + (p.x - old.x) * t, y: old.y + (p.y - old.y) * t }
          : p;
      });
    return {
      ...b.snapshot,
      self: {
        ...b.snapshot.self,
        balls: blend(a.snapshot.self.balls, b.snapshot.self.balls),
      },
      opponent: {
        ...b.snapshot.opponent,
        balls: blend(a.snapshot.opponent.balls, b.snapshot.opponent.balls),
      },
      battlefield: {
        ...b.snapshot.battlefield,
        units: blend(
          a.snapshot.battlefield.units,
          b.snapshot.battlefield.units,
        ),
      },
    };
  }
}
