import type { GameStateManager } from "../core/GameStateManager";
import type { GameModeManager } from "../modes/GameModeManager";
import { NetworkClient, SnapshotBuffer } from "./NetworkClient";
import {
  DEFAULT_RULES,
  type RoomView,
  type Snapshot,
  type ServerMessage,
  type GameCommand,
} from "./protocol";
import { ONLINE_TARGETS } from "./table";
import { RAILS } from "../data/table";
import { BUILDINGS, buildingConfig } from "../config/buildings";
import { UNITS, FORMATIONS } from "../config/army";
import { ELEMENTS, SPELLS } from "../config/magic";
import { RESOURCES, RESOURCE_IDS } from "../config/economy";
import { canonicalKey } from "../presentation/settings";
import "./online.css";
const esc = (v: unknown) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const SIGNALS = [
  "공격하자!",
  "방어가 필요합니다.",
  "왼쪽 방어",
  "오른쪽 방어",
  "식량이 부족합니다.",
  "마력석이 필요합니다.",
  "보스 약점 노출!",
  "멀티볼 준비!",
  "STORM 준비!",
  "감사합니다!",
  "좋은 플레이!",
];
export class MultiplayerUI {
  readonly root = document.createElement("section");
  readonly buffer = new SnapshotBuffer();
  client?: NetworkClient;
  room?: RoomView;
  snapshot?: Snapshot;
  private frame = 0;
  private lastPaint = 0;
  private lastHud = 0;
  private inputTimer?: ReturnType<typeof setInterval>;
  private input = { left: false, right: false, launch: false };
  private abort = new AbortController();
  private muteSignals = false;
  private lastMessage = "";
  private messageAt = 0;
  private active = false;
  constructor(
    readonly game: GameStateManager,
    readonly modes: GameModeManager,
  ) {
    this.root.className = "online-root";
    this.root.hidden = true;
    document.body.append(this.root);
    const button = document.createElement("button");
    button.textContent = "온라인 멀티플레이 · ONLINE";
    button.className = "menu-primary";
    button.addEventListener("click", () => this.open(), {
      signal: this.abort.signal,
    });
    document.querySelector(".welcome")?.append(button);
    this.root.addEventListener("click", (e) => this.action(e), {
      signal: this.abort.signal,
    });
    window.addEventListener("keydown", (e) => this.key(e, true), {
      capture: true,
      signal: this.abort.signal,
    });
    window.addEventListener("keyup", (e) => this.key(e, false), {
      capture: true,
      signal: this.abort.signal,
    });
    window.addEventListener("blur", () => this.clearInput(), {
      signal: this.abort.signal,
    });
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) this.clearInput();
      },
      { signal: this.abort.signal },
    );
  }
  open() {
    if (this.active) return;
    this.active = true;
    this.game.pause();
    this.game.clearInputs();
    document.querySelector<HTMLElement>("#app")!.inert = true;
    this.root.hidden = false;
    this.renderShell();
    this.animate();
  }
  private renderShell() {
    this.root.innerHTML = `<header><div><small>TWO KINGS. ONE BATTLEFIELD.</small><h1>왕관의 전장 <span>ONLINE</span></h1></div><div><output data-network>서버 연결 전</output><button data-online="view">SIMPLE / ADVANCED</button><button data-online="close">싱글 플레이로</button></div></header>
  <p class="online-notice" role="status" data-notice>독립된 핀볼 테이블, 하나의 서버 전장. 준비 중에도 핀볼로 자원을 모으세요.</p>
  <div data-lobby class="online-lobby"><section><h2>왕국의 이름</h2><label>닉네임 <input data-name maxlength="20" value="왕국 탐험가"></label><button data-online="connect">게스트 접속</button><button data-online="newGuest">새 게스트 세션</button><p>이 탭을 새로고침해도 세션을 유지합니다. 싱글 플레이 기록과 분리됩니다.</p><p data-profile></p></section>
  <section><h2>친구와 플레이</h2><label>전장 <select data-mode><option value="duel">1:1 왕국 전쟁</option><option value="survival">2인 협동 생존</option><option value="raid">2인 협동 IRON TITAN</option></select></label><label>준비 시간 <select data-prep><option value="120">120초</option><option value="60">60초</option><option value="180">180초</option></select></label><button data-online="create">비공개 방 만들기</button><label>참가 코드 <input data-code maxlength="32" placeholder="KP-…"></label><button data-online="join">방 참가</button></section>
  <section><h2>다음 도전자</h2><button data-online="queue">빠른 일반 대전</button><button data-online="cancelQueue">매칭 취소</button><button data-online="history">내 경기 기록</button><button data-online="leaderboard">일반전 승리 기록</button><button data-online="community">비공개 테이블 공유</button><p>공개 경쟁전은 안정성·운영 검증 전까지 비활성 상태입니다. AI를 사람으로 표시하지 않습니다.</p></section></div>
  <section data-room class="online-room" hidden></section><section data-info class="online-info" hidden></section>
  <main class="online-play" hidden><aside class="online-economy"><h2>나의 왕국</h2><div data-resources></div><label>생산시설 <select data-producer></select></label><label>병종 <select data-unit>${UNITS.map((u) => `<option value="${u.id}">${u.name} · 금${u.cost.gold ?? 0} 식량${u.cost.food ?? 0}</option>`).join("")}</select></label><button data-online="train">병력 1기 생산</button><button data-online="upgrade">선택 시설 강화 · 12초</button><p data-queue></p>
  <details><summary>왕국 건설 · 12초</summary><label>건물 <select data-building>${BUILDINGS.filter(
    (b) => b.id !== "warCastle",
  )
    .map((b) => `<option value="${b.id}">${b.name}</option>`)
    .join(
      "",
    )}</select></label><label>X <input data-x type="number" min="70" max="510" value="170"></label><label>Y <input data-y type="number" min="400" max="690" value="540"></label><button data-online="build">건설 요청</button><p>테이블 아래쪽 보호 구역에 배치합니다. 비용과 통로는 서버가 검사합니다.</p><p data-work></p></details>
  <details data-cooperative hidden><summary>동료에게 자원 지원</summary><select data-transfer-resource><option value="wood">목재</option><option value="stone">석재</option><option value="gold">금화</option><option value="food">식량</option><option value="mana">마력석</option></select><input aria-label="지원 수량" data-transfer-amount type="number" min="1" max="1000" value="20"><button data-online="transfer">자원 보내기</button></details><button data-online="repair">왕궁 수리</button><button data-online="battleReady">준비 끝 · 조기 전투 동의</button><p data-preparation></p></aside>
  <section class="online-table"><div class="online-score"><span data-score>0</span><span data-matchtime>0:00</span></div><canvas data-table width="600" height="900" aria-label="내 온라인 핀볼 테이블"></canvas><p data-charge>Space를 눌러 충전</p><div class="online-touch"><button data-held="left">왼쪽</button><button data-held="launch">발사</button><button data-held="right">오른쪽</button></div><p>A/D · 플리퍼, Space · 발사, W · 흔들기</p></section>
  <aside class="online-strategy"><h2>공용 전장 <button data-online="expand">확대</button></h2><p data-boss></p><canvas data-battle width="600" height="900" aria-label="서버 공용 전장"></canvas><div data-castles></div><div class="online-orders">${[
    ["defend", "방어"],
    ["frontline", "공격"],
    ["siege", "공성"],
    ["castle", "왕궁 공격"],
    ["retreat", "후퇴"],
  ]
    .map(([order, name]) => `<button data-order="${order}">${name}</button>`)
    .join(
      "",
    )}</div><label>공격로 <select data-lane><option value="left">왼쪽</option><option value="center" selected>중앙</option><option value="right">오른쪽</option></select></label><label>진형 <select data-formation>${Object.entries(
    FORMATIONS,
  )
    .map(([id, f]) => `<option value="${id}">${f.name}</option>`)
    .join(
      "",
    )}</select></label><button data-online="formation">진형 적용</button><details><summary>상대 테이블 · 공개 공 상태</summary><canvas data-opponent width="600" height="900"></canvas></details></aside>
  <nav class="online-magic"><label>특수 공 <select data-element>${ELEMENTS.map((e) => `<option value="${e.id}">${e.name}</option>`).join("")}</select></label><button data-online="element">속성 변경</button><label>주문 <select data-spell>${SPELLS.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}</select></label><button data-online="spell">주문 사용</button><button data-online="multi">J · 멀티볼</button><button data-online="storm">K · CORE STORM</button><p data-magic></p><label>전략 신호 <select data-signal>${SIGNALS.map((s, i) => `<option value="${i}">${s}</option>`).join("")}</select></label><button data-online="signal">신호 보내기</button><button data-online="mute">신호 음소거</button><button data-online="report">플레이어 신고</button><button data-online="surrender">항복</button></nav></main>
  <section data-result class="online-result" hidden></section>`;
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-held]")
      .forEach((b) => {
        const key = b.dataset.held as keyof typeof this.input;
        const release = () => {
          this.input[key] = false;
          this.sendInput();
        };
        b.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          b.setPointerCapture(e.pointerId);
          this.input[key] = true;
          this.sendInput();
        });
        b.addEventListener("pointerup", release);
        b.addEventListener("pointercancel", release);
        b.addEventListener("lostpointercapture", release);
      });
  }
  private val(selector: string) {
    return this.root.querySelector<HTMLInputElement>(selector)!.value;
  }
  private text(selector: string, value: string) {
    const el = this.root.querySelector(selector);
    if (el) el.textContent = value;
  }
  private notice(message: string) {
    this.lastMessage = message;
    this.messageAt = performance.now();
    this.text("[data-notice]", message);
  }
  private connect() {
    if (this.client?.connected) return;
    const configured = import.meta.env.VITE_GAME_SERVER_URL as
      string | undefined;
    const url =
      configured ||
      (import.meta.env.DEV ? `ws://${location.hostname}:8787/ws` : "");
    if (!url) {
      this.notice(
        "온라인 서버 주소가 설정되지 않았습니다. VITE_GAME_SERVER_URL 설정 후 다시 빌드하세요.",
      );
      return;
    }
    this.client?.close();
    this.client = new NetworkClient(url);
    this.client.onStatus = (s) => this.text("[data-network]", s);
    this.client.onMessage = (m) => this.message(m);
    this.client.connect(this.val("[data-name]"));
    if (this.inputTimer) clearInterval(this.inputTimer);
    this.inputTimer = setInterval(() => this.sendInput(), 500);
  }
  private message(m: ServerMessage) {
    if (m.type === "auth" || m.type === "profile")
      this.text(
        "[data-profile]",
        `${m.profile.name} · ${m.profile.games}경기 · ${m.profile.wins}승 ${m.profile.losses}패 ${m.profile.draws}무`,
      );
    if (m.type === "error") this.notice(m.message);
    if (m.type === "queued")
      this.notice(
        "실제 상대를 찾고 있습니다. 다른 플레이어가 접속할 때까지 기다려주세요.",
      );
    if (m.type === "left") {
      this.room = undefined;
      this.snapshot = undefined;
      this.buffer.frames = [];
      this.root.querySelector<HTMLElement>("[data-room]")!.hidden = true;
      this.root.querySelector<HTMLElement>(".online-play")!.hidden = true;
      this.root.querySelector<HTMLElement>("[data-lobby]")!.hidden = false;
      this.root.querySelector<HTMLElement>("[data-result]")!.hidden = true;
    }
    if (m.type === "room") {
      this.room = m.room;
      const el = this.root.querySelector<HTMLElement>("[data-room]")!;
      el.hidden = false;
      el.innerHTML = `<strong>참가 코드 <code>${esc(m.room.code)}</code></strong><span>${esc(m.room.state)} · 준비 ${m.room.rules.preparation}초</span><div>${m.room.players.map((p) => `<span>${esc(p.name)} · ${p.connected ? "연결됨" : "재접속 대기"} · ${p.ready ? "READY" : "준비 중"}</span>`).join("")}</div><button data-online="ready" ${m.room.state === "RUNNING" || m.room.state === "FINISHED" ? "disabled" : ""}>준비 완료</button><button data-online="leave">방 나가기</button>`;
    }
    if (m.type === "snapshot") {
      this.snapshot = m;
      this.buffer.push(m);
      this.root.querySelector<HTMLElement>("[data-lobby]")!.hidden = true;
      this.root.querySelector<HTMLElement>(".online-play")!.hidden = false;
      if (m.result) {
        const r = m.result,
          win =
            r.winner === null
              ? "DRAW"
              : r.winner === (r.mode === "duel" ? m.seat : 0)
                ? "VICTORY"
                : "DEFEAT";
        const el = this.root.querySelector<HTMLElement>("[data-result]")!;
        el.hidden = false;
        el.innerHTML = `<h2>${win}</h2><p>${esc(r.reason)}</p><p>${Math.floor(r.seconds)}초 · 최종 왕궁 ${r.castles.map(Math.ceil).join(" / ")}</p><p>경기 ID ${esc(r.id)}</p><details><summary>서버 확정 기여 기록</summary><pre>${esc(JSON.stringify(r.stats, null, 2))}</pre></details><button data-online="leave">결과 닫고 로비로</button>`;
      }
    }
    if (m.type === "history" || m.type === "leaderboard") {
      const el = this.root.querySelector<HTMLElement>("[data-info]")!;
      el.hidden = false;
      el.innerHTML = `<h2>${m.type === "history" ? "내 경기 기록" : "서버 확정 일반전 승리 기록"}</h2>${m.type === "history" ? m.matches.map((r) => `<p>${esc(r.at)} · ${esc(r.reason)} · ${Math.floor(r.seconds)}초</p>`).join("") || "<p>아직 경기 기록이 없습니다.</p>" : m.players.map((p, i) => `<p>${i + 1}. ${esc(p.name)} · ${p.wins}승 / ${p.games}경기</p>`).join("") || "<p>아직 참가 기록이 없습니다.</p>"}<button data-online="dismiss">닫기</button>`;
    }
  }
  private action(e: Event) {
    const button = (e.target as Element).closest<HTMLElement>("button");
    if (!button) return;
    const action = button.dataset.online,
      order = button.dataset.order;
    if (order) {
      this.command({
        type: "order",
        order: order as never,
        lane: this.val("[data-lane]") as never,
      });
      return;
    }
    if (action === "connect") {
      this.connect();
      return;
    }
    if (action === "newGuest") {
      if (this.room) {
        this.notice("먼저 현재 방을 나가세요.");
        return;
      }
      if (this.client) {
        this.client.close();
        try {
          sessionStorage.removeItem(`kingdom-online:${this.client.url}`);
        } catch {}
      }
      this.client = undefined;
      this.connect();
      return;
    }
    if (action === "close") {
      if (this.snapshot && !this.snapshot.result) {
        this.notice("진행 중 경기입니다. 항복 후 나가거나 연결을 유지하세요.");
        return;
      }
      this.close();
      return;
    }
    if (action === "view") {
      this.root.classList.toggle("advanced");
      return;
    }
    if (action === "expand") {
      this.root.classList.toggle("battle-expanded");
      return;
    }
    if (action === "dismiss") {
      this.root.querySelector<HTMLElement>("[data-info]")!.hidden = true;
      return;
    }
    if (action === "mute") {
      this.muteSignals = !this.muteSignals;
      button.textContent = this.muteSignals ? "신호 다시 듣기" : "신호 음소거";
      return;
    }
    if (action?.startsWith("table-")) {
      void this.tables(action, button.dataset.id);
      return;
    }
    if (!this.client?.connected) {
      this.notice("먼저 게스트 접속을 눌러 서버에 연결하세요.");
      return;
    }
    switch (action) {
      case "create":
        this.client.send({
          type: "create",
          rules: {
            ...DEFAULT_RULES,
            mode: this.val("[data-mode]") as never,
            preparation: +this.val("[data-prep]"),
          },
        });
        break;
      case "community":
        void this.tables("table-list");
        break;
      case "report": {
        const target = this.room?.players.find((p) => p.id !== this.client!.id);
        if (target) {
          this.client.send({
            type: "report",
            target: target.id,
            reason: "게임 내 신고 · 방해 행위 검토 요청",
          });
          this.notice(
            "검토 요청을 기록했습니다. 신고만으로 자동 정지되지 않습니다.",
          );
        }
        break;
      }
      case "join":
        this.client.send({
          type: "join",
          code: this.val("[data-code]").trim(),
        });
        break;
      case "ready":
      case "leave":
      case "queue":
      case "cancelQueue":
      case "history":
      case "leaderboard":
        this.client.send({ type: action });
        break;
      case "battleReady":
        this.command({ type: "battleReady" });
        break;
      case "train":
        this.command({
          type: "train",
          id: this.val("[data-producer]"),
          kind: this.val("[data-unit]") as never,
          count: 1,
        });
        break;
      case "upgrade": {
        const b = this.snapshot?.self.buildings.find(
          (b) => b.id === this.val("[data-producer]"),
        );
        if (b) this.command({ type: "upgrade", id: b.id, level: b.level });
        break;
      }
      case "build":
        this.command({
          type: "build",
          kind: this.val("[data-building]"),
          x: +this.val("[data-x]"),
          y: +this.val("[data-y]"),
          angle: 0,
        });
        break;
      case "formation":
        this.command({
          type: "formation",
          formation: this.val("[data-formation]") as never,
        });
        break;
      case "repair": {
        const s = this.snapshot?.battlefield.structures.find(
          (s) =>
            s.castle &&
            s.side ===
              (this.room?.rules.mode === "duel" && this.snapshot!.seat
                ? "enemy"
                : "ally"),
        );
        if (s) this.command({ type: "repair", id: s.id });
        break;
      }
      case "transfer":
        this.command({
          type: "transfer",
          resource: this.val("[data-transfer-resource]") as never,
          amount: +this.val("[data-transfer-amount]"),
        });
        break;
      case "element":
        this.command({
          type: "element",
          element: this.val("[data-element]") as never,
        });
        break;
      case "spell":
        this.command({
          type: "spell",
          spell: this.val("[data-spell]") as never,
        });
        break;
      case "multi":
      case "storm":
        this.command({ type: "multi", storm: action === "storm" });
        break;
      case "signal":
        this.command({
          type: "ping",
          signal: +this.val("[data-signal]"),
          x: 300,
          y: 450,
        });
        break;
      case "surrender":
        this.notice(
          this.room?.rules.mode === "duel"
            ? "항복하면 상대 승리로 확정됩니다. 다시 눌러 확인하세요."
            : "항복하면 팀 패배로 확정됩니다. 다시 눌러 확인하세요.",
        );
        button.dataset.online = "confirmSurrender";
        button.textContent = "항복 확정";
        break;
      case "confirmSurrender":
        this.command({ type: "surrender" });
        break;
    }
  }
  private command(c: GameCommand) {
    this.client?.command(c);
  }
  private async tables(action: string, id?: string) {
    if (!this.client?.connected) {
      this.notice("먼저 온라인 서버에 접속하세요.");
      return;
    }
    const base = new URL(this.client.url);
    base.protocol = base.protocol === "wss:" ? "https:" : "http:";
    base.pathname = "/tables";
    const request = async (path = "", method = "GET", body?: string) => {
      const response = await fetch(base.toString() + path, {
        method,
        headers: {
          Authorization: `Bearer ${this.client!.token}`,
          "Content-Type": "application/json",
        },
        body,
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error ?? "서버 요청 실패");
      return data;
    };
    try {
      if (action === "table-upload") {
        const result = await request("", "POST", this.modes.creator.export());
        this.notice(`비공개 공유 코드: ${result.id}`);
      }
      if (action === "table-load") {
        const code = this.val("[data-share-code]").trim();
        if (!/^[a-f0-9]{32}$/.test(code))
          throw Error("32자리 공유 코드를 확인하세요.");
        const result = await request("/" + code);
        this.modes.creator.import(JSON.stringify(result.table));
        if (!this.modes.creator.save()) throw Error(this.modes.creator.message);
        this.notice(
          "새 로컬 프로젝트로 저장했습니다. 싱글 플레이 → TABLE CREATOR에서 불러오고 플레이하세요.",
        );
      }
      if (action === "table-delete" && id)
        await request("/" + encodeURIComponent(id), "DELETE");
      if (action === "table-report") {
        const code = this.val("[data-share-code]").trim();
        this.client.send({
          type: "report",
          target: "table:" + code,
          reason: "비공개 공유 맵 콘텐츠 검토 요청",
        });
        this.notice("맵 검토 요청을 저장했습니다.");
      }
      const list = (await request()) as { id: string; name: string }[];
      const el = this.root.querySelector<HTMLElement>("[data-info]")!;
      el.hidden = false;
      el.innerHTML = `<h2>비공개 테이블 공유</h2><p>현재 제작기 선택: ${esc(this.modes.creator.selected.name)}. 서버 검사 후 참가 코드로 공유합니다. 공개 커뮤니티·공식 경쟁전 사용은 아직 지원하지 않습니다.</p><button data-online="table-upload">현재 테이블 공유</button><label>공유 코드 <input data-share-code maxlength="32"></label><button data-online="table-load">로컬 제작기로 가져오기</button><button data-online="table-report">이 맵 신고</button><h3>내 공유 맵</h3>${list.map((t) => `<p>${esc(t.name)} · <code>${esc(t.id)}</code> <button data-online="table-delete" data-id="${esc(t.id)}">공유 중단</button></p>`).join("") || "<p>공유한 맵이 없습니다.</p>"}<button data-online="dismiss">닫기</button>`;
    } catch (e) {
      this.notice(e instanceof Error ? e.message : "공유 맵 처리 오류");
    }
  }
  private sendInput() {
    if (this.snapshot && !this.snapshot.result)
      this.command({ type: "input", ...this.input });
  }
  private clearInput() {
    this.input = { left: false, right: false, launch: false };
    this.sendInput();
  }
  private key(e: KeyboardEvent, down: boolean) {
    if (!this.active) return;
    e.stopImmediatePropagation();
    if ((e.target as Element)?.closest("input,select,textarea")) return;
    const code = canonicalKey(
      e.code,
      this.game.save.data.settings.presentation,
    );
    const key = ["KeyA", "ArrowLeft"].includes(code)
      ? "left"
      : ["KeyD", "ArrowRight"].includes(code)
        ? "right"
        : code === "Space"
          ? "launch"
          : null;
    if (key) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (this.input[key] !== down) {
        this.input[key] = down;
        this.sendInput();
      }
    } else if (down && !e.repeat && ["KeyW", "KeyJ", "KeyK"].includes(code)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.command(
        code === "KeyW"
          ? { type: "nudge" }
          : { type: "multi", storm: code === "KeyK" },
      );
    }
  }
  private hud(s: Snapshot) {
    this.root.querySelector<HTMLElement>("[data-cooperative]")!.hidden =
      this.room?.rules.mode === "duel";
    this.text(
      "[data-network]",
      this.client?.connected
        ? `${Math.round(this.client.ping)}ms · ${this.client.ping > 180 ? "높은 지연 · 입력 보정 주의" : "연결됨"} · 업데이트 ${Math.round(performance.now() - this.client.lastSnapshot)}ms 전`
        : "재접속 중 · 전투 계속",
    );
    this.root.querySelector("[data-resources]")!.innerHTML = RESOURCE_IDS.map(
      (r) =>
        `<span>${esc(RESOURCES[r].name)}<b>${Math.floor(s.self.resources[r])}</b></span>`,
    ).join("");
    this.text(
      "[data-boss]",
      s.boss
        ? "IRON TITAN · " +
            Math.ceil(s.boss.hp) +
            "/" +
            s.boss.maxHp +
            " · 장갑 " +
            Math.ceil(s.boss.armor) +
            " · PHASE " +
            s.boss.phase +
            (s.boss.warning ? " · 충격파 예고!" : "")
        : this.room?.rules.mode === "survival"
          ? "협동 WAVE " + s.wave
          : "",
    );
    this.text(
      "[data-score]",
      `${s.self.score.toLocaleString()} · 유효 타격 ${s.self.hits}`,
    );
    this.text(
      "[data-matchtime]",
      `${Math.floor(s.time / 60000)}:${String(Math.floor(s.time / 1000) % 60).padStart(2, "0")}`,
    );
    this.text(
      "[data-charge]",
      s.self.charge
        ? `발사 충전 ${Math.round(s.self.charge * 100)}%`
        : s.self.energyWait
          ? "재발사 대기 중"
          : s.self.launched
            ? "공 진행 중 · 플리퍼로 목표물을 조준하세요."
            : "Space를 눌러 충전 · 놓아서 발사",
    );
    this.text(
      "[data-preparation]",
      s.time < s.preparation * 1000
        ? `전투까지 ${Math.ceil(s.preparation - s.time / 1000)}초 · 두 명 모두 동의하면 조기 시작`
        : "전투 진행 중 · 개인 일시정지 없음",
    );
    const producer =
        this.root.querySelector<HTMLSelectElement>("[data-producer]")!,
      options = s.self.buildings.filter(
        (b) => buildingConfig(b.type)?.category === "military",
      );
    const signature = options.map((b) => b.id).join(",");
    if (producer.dataset.signature !== signature) {
      const old = producer.value;
      producer.innerHTML = options
        .map(
          (b) =>
            `<option value="${esc(b.id)}">${esc(buildingConfig(b.type)?.name)} ${b.level}단계</option>`,
        )
        .join("");
      if (options.some((b) => b.id === old)) producer.value = old;
      producer.dataset.signature = signature;
    }
    const queues = s.self.queues as Record<
      string,
      { entries: { progress: number; kind: string }[] }
    >;
    this.text(
      "[data-queue]",
      Object.values(queues)
        .flatMap((q) =>
          q.entries.map((e) => `${e.kind} ${Math.floor(e.progress * 100)}%`),
        )
        .join(" · ") || "생산 대기열 비어 있음",
    );
    this.text(
      "[data-work]",
      s.self.work
        .map(
          (w) => `${buildingConfig(w.type)?.name} ${Math.ceil(w.remaining)}초`,
        )
        .join(" · "),
    );
    this.text(
      "[data-castles]",
      s.battlefield.structures
        .filter((v) => v.castle)
        .map(
          (v) =>
            `${v.side === (this.room?.rules.mode === "duel" && s.seat ? "enemy" : "ally") ? "우리" : "상대"} 왕궁 ${Math.ceil(v.hp)}/${v.maxHp}`,
        )
        .join(" · "),
    );
    const m = s.self.magic as {
      charge: number;
      multiCharge: number;
      stormCharge: number;
    };
    this.text(
      "[data-magic]",
      `마법 ${Math.floor(m.charge)} · 멀티볼 ${Math.floor(m.multiCharge)} · STORM ${Math.floor(m.stormCharge)} · 공 ${s.self.balls.length}/10`,
    );
    if (
      !this.muteSignals &&
      s.signals.length &&
      performance.now() - this.messageAt > 1500
    )
      this.text(
        "[data-notice]",
        s.signals
          .map(
            (p) =>
              `${p.seat === s.seat ? "나" : "동료/상대"}: ${SIGNALS[p.signal]}`,
          )
          .join(" · "),
      );
    else if (performance.now() - this.messageAt < 5000)
      this.text("[data-notice]", this.lastMessage);
  }
  private animate = () => {
    if (!this.active) return;
    const now = performance.now(),
      s = this.buffer.sample(now);
    if (s && now - this.lastPaint > 15) {
      this.lastPaint = now;
      this.draw(s);
      if (now - this.lastHud > 200) {
        this.lastHud = now;
        this.hud(s);
      }
    }
    this.frame = requestAnimationFrame(this.animate);
  };
  private draw(s: Snapshot) {
    const drawTable = (selector: string, other = false) => {
      const canvas = this.root.querySelector<HTMLCanvasElement>(selector)!,
        c = canvas.getContext("2d")!;
      c.clearRect(0, 0, 600, 900);
      c.fillStyle = "#173f36";
      c.fillRect(0, 0, 600, 900);
      const glow = c.createRadialGradient(300, 350, 20, 300, 450, 570);
      glow.addColorStop(0, "#496550");
      glow.addColorStop(1, "#102923");
      c.fillStyle = glow;
      c.fillRect(12, 12, 576, 876);
      c.strokeStyle = "#b9bd9e";
      c.lineCap = "round";
      for (const rail of RAILS) {
        c.lineWidth = rail.width;
        c.beginPath();
        c.moveTo(...rail.a);
        c.lineTo(...rail.b);
        c.stroke();
      }
      c.font = "13px Georgia";
      c.textAlign = "center";
      for (const t of ONLINE_TARGETS) {
        c.fillStyle = `#${t.color.toString(16).padStart(6, "0")}`;
        c.strokeStyle = "#f2dd9c";
        c.lineWidth = 3;
        c.beginPath();
        c.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.fillStyle = "#f4e6bd";
        c.fillText(t.name, t.x, t.y + t.radius + 19);
      }
      if (!other)
        for (const b of s.self.buildings) {
          const cfg = buildingConfig(b.type);
          if (!cfg) continue;
          c.save();
          c.translate(b.x, b.y);
          c.rotate((b.angle * Math.PI) / 180);
          c.fillStyle = b.disabled ? "#483d38" : "#72847c";
          c.strokeStyle = "#d6bc7b";
          c.lineWidth = 3;
          c.fillRect(-cfg.width / 2, -cfg.height / 2, cfg.width, cfg.height);
          c.strokeRect(-cfg.width / 2, -cfg.height / 2, cfg.width, cfg.height);
          c.fillStyle = "#efe4c4";
          c.fillText(`${cfg.name} ${b.level}`, 0, cfg.height / 2 + 16);
          c.restore();
        }
      const angles = other
        ? s.opponent.flippers
        : [
            this.input.left ? -0.48 : s.self.flippers[0],
            this.input.right ? Math.PI + 0.48 : s.self.flippers[1],
          ];
      angles.forEach((angle, i) => {
        const x = i ? 395 : 181;
        c.strokeStyle = "#c2d7da";
        c.lineWidth = 20;
        c.beginPath();
        c.moveTo(x, 786);
        c.lineTo(x + Math.cos(angle) * 91, 786 + Math.sin(angle) * 91);
        c.stroke();
        c.strokeStyle = "#b6975c";
        c.lineWidth = 5;
        c.stroke();
      });
      for (const b of (other ? s.opponent : s.self).balls) {
        const e = ELEMENTS.find((e) => e.id === b.element),
          g = c.createRadialGradient(b.x - 3, b.y - 4, 1, b.x, b.y, 11);
        g.addColorStop(0, "#fff");
        g.addColorStop(
          0.4,
          `#${(e?.color ?? 0xffffff).toString(16).padStart(6, "0")}`,
        );
        g.addColorStop(1, "#243f4d");
        c.fillStyle = g;
        c.beginPath();
        c.arc(b.x, b.y, 10, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = "#fff";
        c.lineWidth = 1;
        c.stroke();
      }
    };
    drawTable("[data-table]");
    const details = this.root.querySelector("[data-opponent]")!
      .parentElement as HTMLDetailsElement;
    if (details.open) drawTable("[data-opponent]", true);
    const c = this.root
      .querySelector<HTMLCanvasElement>("[data-battle]")!
      .getContext("2d")!;
    c.fillStyle = "#142e29";
    c.fillRect(0, 0, 600, 900);
    for (const x of [130, 300, 455]) {
      c.fillStyle = "#253f33";
      c.fillRect(x - 35, 160, 70, 560);
      c.strokeStyle = "#536244";
      c.lineWidth = 1;
      c.strokeRect(x - 35, 160, 70, 560);
    }
    c.fillStyle = "#39626a";
    c.fillRect(0, 440, 600, 18);
    for (const v of s.battlefield.structures) {
      c.fillStyle =
        v.hp <= 0 ? "#39372f" : v.side === "ally" ? "#78bba0" : "#c27d76";
      c.fillRect(v.x - 22, v.y - 20, 44, 40);
      c.fillStyle = "#d5b86e";
      c.fillRect(v.x - 22, v.y - 29, 44 * Math.max(0, v.hp / v.maxHp), 4);
      if (v.castle) {
        c.font = "22px Georgia";
        c.fillText("♛", v.x - 10, v.y + 7);
      }
    }
    for (const u of s.battlefield.units) {
      c.fillStyle = u.side === "ally" ? "#80d7bc" : "#ee968f";
      c.beginPath();
      c.arc(u.x, u.y, u.kind === "catapult" ? 12 : 7, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#f3dfa0";
      c.fillRect(u.x - 8, u.y - 12, (16 * u.hp) / u.maxHp, 2);
    }
    if (s.boss?.warning) {
      c.strokeStyle = "#ffb361";
      c.lineWidth = 5;
      c.beginPath();
      c.arc(s.boss.warning.x, s.boss.warning.y, 100, 0, Math.PI * 2);
      c.stroke();
    }
    for (const e of s.battlefield.effects) {
      c.strokeStyle = "#d1b4f2";
      c.lineWidth = 3;
      c.beginPath();
      c.arc(e.x, e.y, 22, 0, Math.PI * 2);
      c.stroke();
    }
  }
  close() {
    this.clearInput();
    this.client?.close();
    if (this.inputTimer) clearInterval(this.inputTimer);
    this.active = false;
    cancelAnimationFrame(this.frame);
    this.root.hidden = true;
    document.querySelector<HTMLElement>("#app")!.inert = false;
  }
  dispose() {
    this.close();
    this.abort.abort();
    this.root.remove();
  }
}
