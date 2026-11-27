import type { GameStateManager } from "../core/GameStateManager";
import type { AudioManager } from "../audio/AudioManager";
import { TUTORIAL } from "../data/table";
import { ko } from "../data/strings";

export const format = (n: number): string =>
  Math.floor(n).toLocaleString("ko-KR");
export const duration = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const crest =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 18l14 10 10-17 10 17 14-10-7 29H15z" fill="currentColor"/><path d="M18 53h28" stroke="currentColor" stroke-width="3"/></svg>';
const controls =
  '<div class="key-row"><span><kbd>A</kbd> <kbd>←</kbd></span><span>왼쪽 플리퍼</span></div><div class="key-row"><span><kbd>D</kbd> <kbd>→</kbd></span><span>오른쪽 플리퍼</span></div><div class="key-row"><kbd>SPACE</kbd><span>길게 충전 · 놓아서 발사</span></div><div class="key-row"><kbd>W</kbd><span>흔들기 · TILT 주의</span></div><div class="key-row"><kbd>ESC</kbd><span>일시정지</span></div><div class="key-row"><kbd>R</kbd><span>다시 시작</span></div><div class="key-row"><kbd>M</kbd><span>음소거</span></div>';

export class UIManager {
  readonly root: HTMLElement;
  readonly dialog: HTMLDialogElement;
  private lastUpdate = 0;
  private messageUntil = 0;
  private wasPlaying = false;
  private lastFocus?: HTMLElement;
  private logs: { text: string; time: number }[] = [];
  private abort = new AbortController();
  private disposers: (() => void)[] = [];
  onAction?: (action: string) => boolean;
  onRender?: () => void;
  onRelaunchClose?: () => void;
  constructor(
    readonly game: GameStateManager,
    readonly audio: AudioManager,
  ) {
    this.root = document.querySelector("#app")!;
    this.root.innerHTML = `
      <header class="topbar"><a class="brand" href="#" data-action="home">${crest}<span>KINGDOM <b>PINBALL</b></span></a><div class="edition">THE GREENWOOD CHRONICLES <span>·</span> CHAPTER I</div><div class="top-actions"><button class="icon-button" data-action="sound" aria-label="음소거" title="음소거 (M)">♫</button><button class="icon-button" data-action="settings" aria-label="설정" title="설정">⚙</button></div></header>
      <main class="game-layout" data-state="menu">
        <aside class="left-panel">
          <section class="welcome"><div class="eyebrow"><span class="gold-line"></span> A KINGDOM AWAITS</div><div class="title-crest">${crest}</div><h1>KINGDOM<br><span>PINBALL</span></h1><p class="tagline">Bounce, Build, Conquer!</p><p class="intro">한 번의 타격으로 깨어나는 왕국.<br>당신의 손끝에서 원정이 시작됩니다.</p><button class="primary start-button" data-action="start"><span>게임 시작</span><small>START GAME</small></button><nav class="menu-links" aria-label="메인 메뉴"><button data-action="how">플레이 방법 <small>HOW TO PLAY</small></button><button data-action="scores">최고 기록 <small>HIGH SCORES</small></button><button data-action="settings">설정 <small>SETTINGS</small></button><button data-action="credits">크레딧 <small>CREDITS</small></button></nav><div class="edition-note">PHASE 01 <span>CORE PINBALL ENGINE</span></div></section>
          <section class="kingdom-panel in-play"><div class="eyebrow">YOUR KINGDOM</div><h2>그린우드 왕국</h2><p class="muted">녹음이 짙은 땅, 첫 번째 원정</p><div class="kingdom-seal">${crest}<span>GREENWOOD<br><small>EST. THE FIRST AGE</small></span></div><div class="section-heading">이번 원정의 목표</div><p class="objective">왕궁을 5회 타격하여<br><strong>ROYAL BONUS</strong>를 획득하세요.</p><div id="palace-progress" class="palace-progress"></div><p class="tiny">왕궁 타격 <span id="palace-count">0 / 5</span><b>+3,000</b></p><div class="section-heading">왕실 보물</div><p id="bonus-info" class="muted">숲 · 석재 · 금광 · 수정을 모두 맞히면 보물 상자가 열립니다.</p><div class="future-note">다음 원정을 위한 땅<br><span>건설 · 자원 · 왕국 성장</span></div></section>
          <section class="controls-panel in-play"><div class="section-heading">왕국을 움직이는 손끝</div>${controls}<button class="text-button" data-action="tutorial">튜토리얼 다시 보기</button></section>
        </aside>
        <section class="table-section" aria-label="핀볼 게임 테이블"><div class="table-heading"><div><span class="tiny">THE FIRST REALM</span><h2>GREENWOOD KINGDOM</h2></div><div class="map-number">01</div></div><div class="scoreboard"><div><span>현재 점수</span><strong id="score">0</strong></div><div class="best-score"><span>최고 기록</span><strong id="best">0</strong></div><button class="pause-button" data-action="pause" aria-label="일시정지">Ⅱ</button></div><div class="table-frame"><div class="corner corner-tl"></div><div class="corner corner-tr"></div><div id="game-canvas" aria-label="Greenwood Kingdom 핀볼 테이블"></div><div id="table-message" class="table-message">왕국의 새로운 기록을 세워보세요</div><div id="combo-banner" class="combo-banner"></div><div class="corner corner-bl"></div><div class="corner corner-br"></div></div><div class="launcher-bar"><span><i class="sphere-dot"></i> CORE SPHERE <b id="sphere-count">5</b><small>/ 5</small></span><div class="charge-wrap"><span id="charge-label">SPACE · CHARGE</span><div class="charge-track"><i id="charge-fill"></i></div><b id="charge-value">0%</b></div></div><div class="touch-controls in-play"><button data-control="left" aria-label="왼쪽 플리퍼">A · 왼쪽</button><button data-control="launch">SPACE · 발사</button><button data-control="right" aria-label="오른쪽 플리퍼">D · 오른쪽</button></div></section>
        <aside class="right-panel"><section class="record-panel"><div class="eyebrow">THE ROYAL RECORD</div><div class="record-value" id="record-value">0</div><p class="muted">당신의 가장 위대한 원정</p><div class="record-rule"></div><div class="stat-row"><span>최대 콤보</span><b id="record-combo">0</b></div><div class="stat-row"><span>총 원정 횟수</span><b id="record-plays">0</b></div><button class="text-button" data-action="scores">원정 기록 보기</button></section><section class="combo-panel"><div class="eyebrow">KEEP THE MOMENTUM</div><div class="combo-number"><strong id="combo-count">0</strong><span>COMBO<br><b id="combo-multi">×1</b></span></div><div class="combo-track"><i id="combo-timer"></i></div><p class="muted">3초 안에 타격을 이어가세요.</p></section><section class="event-panel"><div class="section-heading">왕국의 소식 <span>LIVE</span></div><ol id="event-log"><li class="empty-event">아직 고요한 왕국.<br>첫 번째 스피어를 발사하세요.</li></ol></section><section class="tilt-panel in-play"><div class="stat-row"><span>테이블 안정도</span><b id="tilt-label">안정</b></div><div class="tilt-track"><i id="tilt-fill"></i></div><p class="tiny">과도한 흔들기는 TILT를 유발합니다.</p></section></aside>
      </main><footer class="page-footer"><span>CRAFTED FOR THE ART OF PINBALL</span><span>STEEL & MAGIC <i>✦</i> GREENWOOD KINGDOM</span><span id="play-time">00:00</span></footer>
      <div id="tutorial" class="tutorial" hidden><span class="tutorial-index"></span><div><strong></strong><p></p></div><button data-action="tutorial-next" title="다음 안내">다음</button><button data-action="tutorial-skip" aria-label="튜토리얼 건너뛰기">건너뛰기</button></div>
      <dialog id="dialog" aria-labelledby="dialog-title"><div class="dialog-inner"></div></dialog>`;
    this.dialog = this.root.querySelector("dialog")!;
    this.root
      .querySelector(".table-section")!
      .prepend(this.root.querySelector("#tutorial")!);
    this.root.addEventListener(
      "click",
      (event) => {
        const action = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-action]",
        )?.dataset.action;
        if (action) {
          event.preventDefault();
          this.audio.unlock();
          this.action(action);
        }
      },
      { signal: this.abort.signal },
    );
    this.dialog.addEventListener(
      "cancel",
      (event) => {
        event.preventDefault();
        this.close();
      },
      { signal: this.abort.signal },
    );
    this.bindTouch();
    this.disposers = [
      game.events.on("state", ({ state }) => {
        this.root.querySelector<HTMLElement>(".game-layout")!.dataset.state =
          state === "relaunch" ? "playing" : state;
        if (state === "over" && game.mode === "classic") this.showGameOver();
        if (state === "playing" && game.time === 0) {
          this.logs = [];
          this.renderLogs();
        }
      }),
      game.events.on("message", ({ text, tone }) => this.message(text, tone)),
      game.events.on("hit", ({ kind, points, combo }) => {
        const names = {
          forest: "숲",
          stone: "석재 광산",
          gold: "금광",
          crystal: "마법 수정",
          palace: "왕궁",
          bonus: "왕실 보물",
          farm: "농장",
          core: "코어 충전소",
        };
        this.log(`${names[kind]} +${format(points)}`);
        const thresholds = [3, 5, 10, 15, 20];
        const i = thresholds.indexOf(combo);
        if (i >= 0) {
          this.message(ko.combos[i], "gold");
          this.text("combo-banner", ko.combos[i]);
          setTimeout(() => this.text("combo-banner", ""), 1400);
        }
      }),
      game.events.on("royal", () => {
        this.message("ROYAL BONUS  +3,000", "gold");
        this.log("왕실의 축복 · +3,000");
      }),
      game.events.on("drain", ({ remaining }) =>
        this.log(`스피어 손실 · ${remaining}개 남음`),
      ),
    ];
    this.render(true);
  }
  action(action: string): void {
    if (this.onAction?.(action)) return;
    switch (action) {
      case "start":
        this.close(false);
        this.game.start();
        break;
      case "classic-continue":
        this.close(false);
        this.game.resumeClassic();
        break;
      case "pause":
        this.pause();
        break;
      case "resume":
        this.close();
        if (this.game.state === "paused") this.game.resume();
        break;
      case "restart":
        this.confirmRestart();
        break;
      case "restart-confirm":
        this.close(false);
        this.game.restartClassic();
        break;
      case "home":
        if (this.game.state === "playing" || this.game.state === "paused")
          this.open(
            "원정을 마칠까요?",
            '<p>현재 점수는 원정 기록에 저장됩니다.</p><div class="dialog-actions"><button data-action="home-confirm">메인 메뉴로</button><button class="primary" data-action="close">계속 플레이</button></div>',
          );
        else {
          this.close(false);
          this.game.menu();
        }
        break;
      case "home-confirm":
        this.close(false);
        this.game.menu();
        break;
      case "close":
        this.close();
        break;
      case "sound":
        this.game.save.data.settings.muted =
          !this.game.save.data.settings.muted;
        this.game.save.persist();
        this.audio.sync();
        this.render(true);
        break;
      case "how":
        this.open(
          "플레이 방법",
          `<p>스페이스로 충전하고, 플리퍼로 왕국의 목표물을 조준하세요.</p>${controls}<div class="help-grid"><p><b>콤보 배율</b><br>3회 ×1.5 · 5회 ×2<br>10회 ×3 · 20회 ×5</p><p><b>왕실의 축복</b><br>왕궁 5회 타격 +3,000<br>4종 범퍼 타격 후 보물 활성화</p></div><p class="muted">플리퍼를 누르고 있으면 올라간 상태를 유지합니다. 타격 위치와 타이밍으로 방향을 조절해 보세요.</p><button class="primary" data-action="close">알겠습니다</button>`,
        );
        break;
      case "settings":
        this.settings();
        break;
      case "scores":
        this.scores();
        break;
      case "credits":
        this.open(
          "작은 왕국을 만든 것들",
          '<p class="credits-title">KINGDOM PINBALL</p><p>기획 · KINGDOM PINBALL PHASE 1<br>엔진 · Phaser & Matter.js<br>제작 · TypeScript & Vite</p><p>테이블과 모든 장식은 Canvas로 직접 그렸습니다. 음악과 효과음은 Web Audio로 합성한 독자적인 음원입니다.</p><p class="muted">상용 게임의 그래픽·음원은 사용하지 않았습니다. Phaser와 Matter.js는 MIT 라이선스입니다.</p><button class="primary" data-action="close">닫기</button>',
        );
        break;
      case "tutorial":
        this.close();
        if (this.game.state === "menu" || this.game.state === "over")
          this.game.start(true);
        else this.game.replayTutorial();
        break;
      case "tutorial-next":
        if (++this.game.tutorialStep >= TUTORIAL.length)
          this.game.finishTutorial();
        break;
      case "tutorial-skip":
        this.game.finishTutorial();
        break;
    }
  }
  private get waitingToRespawn(): boolean {
    return (
      this.game.state === "relaunch" &&
      (!!this.game.war || this.game.ballStatus === "respawn-pending")
    );
  }
  pause(): void {
    if (this.game.state === "paused") {
      this.close();
      this.game.resume();
      return;
    }
    if (this.game.state !== "playing" && !this.waitingToRespawn) return;
    this.open(
      ko.paused,
      '<p>왕국은 당신을 기다립니다.<br>스피어와 콤보 시간은 그대로 멈춰 있습니다.</p><div class="pause-menu"><button class="primary" data-action="resume">원정 계속하기</button><button data-action="settings">설정</button><button data-action="restart">다시 시작</button><button data-action="home">메인 메뉴</button></div>',
    );
  }
  autoPause(): void {
    if (this.game.state === "playing" || this.waitingToRespawn) this.pause();
    this.game.clearInputs();
  }
  confirmRestart(): void {
    if (this.game.state === "menu") return;
    if (this.game.war && this.onAction?.("war:setup")) return;
    if (this.game.mode === "kingdom" && this.onAction?.("new-kingdom")) return;
    this.open(
      "새로운 원정을 시작할까요?",
      '<p>진행 중인 원정을 기록하고, 스피어 5개로 다시 시작합니다.</p><div class="dialog-actions"><button data-action="close">돌아가기</button><button class="primary" data-action="restart-confirm">다시 시작</button></div>',
    );
  }
  open(title: string, body: string, resumeOnClose?: boolean): void {
    this.dialog.classList.remove("wide");
    if (!this.dialog.open) {
      this.wasPlaying = this.game.state === "playing" || this.waitingToRespawn;
      this.lastFocus = document.activeElement as HTMLElement;
    }
    if (resumeOnClose !== undefined) this.wasPlaying = resumeOnClose;
    if (this.game.state === "playing" || this.waitingToRespawn)
      this.game.pause();
    this.dialog.querySelector(".dialog-inner")!.innerHTML =
      `<div class="dialog-eyebrow">THE ROYAL CHAMBER</div><button class="dialog-close" data-action="close" aria-label="닫기">×</button><h2 id="dialog-title">${title}</h2>${body}`;
    if (!this.dialog.open) this.dialog.showModal();
  }
  close(resume = true): void {
    if (this.dialog.open) {
      this.dialog.close();
      this.lastFocus?.focus();
    }
    if (resume && this.wasPlaying && this.game.state === "paused")
      this.game.resume();
    this.wasPlaying = false;
    if (resume && this.game.state === "relaunch" && !this.game.war)
      this.onRelaunchClose?.();
  }
  private settings(): void {
    const s = this.game.save.data.settings;
    this.open(
      "나만의 플레이 환경",
      `<label class="setting">배경 음악 <output id="music-output">${Math.round(s.music * 100)}%</output><input aria-label="배경 음악 음량" type="range" min="0" max="100" value="${s.music * 100}" data-setting="music"></label><label class="setting">효과음 <output id="effects-output">${Math.round(s.effects * 100)}%</output><input aria-label="효과음 음량" type="range" min="0" max="100" value="${s.effects * 100}" data-setting="effects"></label><label class="setting-check"><input type="checkbox" data-setting="particles" ${s.particles ? "checked" : ""}> 파티클과 스피어 잔상</label><label class="setting-check"><input type="checkbox" data-setting="shake" ${s.shake ? "checked" : ""}> 미세한 화면 흔들림</label><label class="setting-check"><input type="checkbox" data-setting="muted" ${s.muted ? "checked" : ""}> 모든 소리 음소거</label><button class="primary" data-action="close">설정 완료</button>`,
    );
    this.dialog
      .querySelectorAll<HTMLInputElement>("[data-setting]")
      .forEach((input) =>
        input.addEventListener("input", () => {
          const key = input.dataset.setting as keyof typeof s;
          if (key === "music" || key === "effects") {
            s[key] = Number(input.value) / 100;
            this.text(`${key}-output`, `${input.value}%`);
          } else if (key === "particles" || key === "shake" || key === "muted")
            s[key] = input.checked;
          this.game.save.persist();
          this.audio.sync();
        }),
      );
  }
  private scores(): void {
    const data = this.game.save.data;
    const list = data.recent.length
      ? `<table><thead><tr><th>원정</th><th>점수</th><th>최대 콤보</th><th>시간</th></tr></thead><tbody>${data.recent.map((r) => `<tr><td>${r.date.replace(/[^0-9-]/g, "")}</td><td>${format(r.score)}</td><td>${r.combo}</td><td>${duration(r.seconds)}</td></tr>`).join("")}</tbody></table>`
      : "<p>아직 기록이 없습니다. 첫 원정을 떠나보세요.</p>";
    this.open(
      "왕국의 원정 기록",
      `<div class="big-record">${format(data.highScore)}<span>ALL-TIME BEST</span></div>${list}<p class="muted">총 ${data.plays}회 · 누적 플레이 ${duration(data.totalSeconds)}</p><button class="primary" data-action="close">닫기</button>`,
    );
  }
  private showGameOver(): void {
    const s = this.game.score;
    this.open(
      ko.over,
      `<div class="big-record">${format(s.score)}<span>FINAL SCORE</span></div><div class="results-grid"><div>최고 점수<b>${format(this.game.save.data.highScore)}</b></div><div>최대 콤보<b>${s.combo.max}</b></div><div>왕궁 타격<b>${s.palaceHits}</b></div><div>총 타격<b>${s.hits}</b></div><div>플레이 시간<b>${duration(this.game.time / 1000)}</b></div></div><div class="dialog-actions"><button data-action="home">메인 메뉴</button><button class="primary" data-action="restart-confirm">다시 시작</button></div>`,
    );
  }
  message(text: string, tone?: string): void {
    const e = this.root.querySelector<HTMLElement>("#table-message")!;
    e.textContent = text;
    e.dataset.tone = tone ?? "";
    this.messageUntil = performance.now() + 3200;
  }
  log(text: string): void {
    this.logs.unshift({ text, time: this.game.time });
    this.logs = this.logs.slice(0, 5);
    this.renderLogs();
  }
  private renderLogs(): void {
    const el = this.root.querySelector("#event-log")!;
    el.replaceChildren(
      ...this.logs.map((entry) => {
        const li = document.createElement("li");
        const time = document.createElement("time");
        time.textContent = duration(entry.time / 1000);
        const text = document.createElement("span");
        text.textContent = entry.text;
        li.append(time, text);
        return li;
      }),
    );
  }
  text(id: string, value: string): void {
    const el = this.root.querySelector(`#${id}`);
    if (el && el.textContent !== value) el.textContent = value;
  }
  render(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastUpdate < 70) return;
    this.lastUpdate = now;
    const s = this.game.score,
      data = this.game.save.data;
    this.text("score", format(s.score));
    this.text("best", format(Math.max(s.score, data.highScore)));
    this.text("record-value", format(data.highScore));
    this.text("record-combo", format(data.maxCombo));
    this.text("record-plays", format(data.plays));
    this.text("combo-count", `${s.combo.count}`);
    this.text("combo-multi", `×${s.combo.multiplier}`);
    this.text("sphere-count", `${this.game.remaining}`);
    this.text("charge-value", `${Math.round(this.game.charge * 100)}%`);
    this.text("palace-count", `${s.palaceHits % 5} / 5`);
    this.text("play-time", duration(this.game.time / 1000));
    const palace = this.root.querySelector("#palace-progress")!;
    const dots = Array.from(
      { length: 5 },
      (_, i) => `<i class="${i < s.palaceHits % 5 ? "lit" : ""}"></i>`,
    ).join("");
    if (palace.innerHTML !== dots) palace.innerHTML = dots;
    this.text(
      "bonus-info",
      s.bonusActive
        ? "왕실 보물이 열렸습니다! 왼쪽 보물 상자를 조준하세요. +1,000"
        : "숲 · 석재 · 금광 · 수정을 모두 맞히면 보물 상자가 열립니다.",
    );
    this.root.querySelector<HTMLElement>("#charge-fill")!.style.width =
      `${this.game.charge * 100}%`;
    this.root.querySelector<HTMLElement>("#combo-timer")!.style.width =
      `${s.combo.count ? Math.max(0, 100 - (this.game.time - s.combo.lastHit) / 30) : 0}%`;
    this.root.querySelector<HTMLElement>("#tilt-fill")!.style.width =
      `${this.game.tilt.heat}%`;
    this.text(
      "tilt-label",
      this.game.tilt.tilted
        ? "TILT"
        : this.game.tilt.heat > 65
          ? "위험"
          : "안정",
    );
    const sound = this.root.querySelector<HTMLButtonElement>(
      '[data-action="sound"]',
    )!;
    sound.textContent = data.settings.muted ? "♪̸" : "♫";
    sound.setAttribute("aria-pressed", String(data.settings.muted));
    if (now > this.messageUntil)
      this.text(
        "table-message",
        this.game.state === "playing" &&
          !this.game.physics.launched &&
          this.game.physics.ball
          ? ko.ready
          : "",
      );
    const tutorial = this.root.querySelector<HTMLElement>("#tutorial")!;
    const step = this.game.tutorialStep;
    tutorial.hidden = step < 0 || this.game.state !== "playing";
    if (step >= 0) {
      tutorial.querySelector(".tutorial-index")!.textContent = `0${step + 1}`;
      tutorial.querySelector("strong")!.textContent = TUTORIAL[step].title;
      tutorial.querySelector("p")!.textContent = TUTORIAL[step].text;
    }
    this.onRender?.();
  }
  private bindTouch(): void {
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-control]")
      .forEach((button) => {
        const control = button.dataset.control!;
        button.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          this.audio.unlock();
          button.setPointerCapture(event.pointerId);
          if (control === "launch") this.game.chargeStart();
          else this.game.flipper(control as "left" | "right", true);
        });
        const up = (): void => {
          if (control === "launch") this.game.chargeRelease();
          else this.game.flipper(control as "left" | "right", false);
        };
        button.addEventListener("pointerup", up);
        button.addEventListener("pointercancel", () => this.game.clearInputs());
      });
  }
  dispose(): void {
    this.abort.abort();
    this.disposers.forEach((fn) => fn());
  }
}
