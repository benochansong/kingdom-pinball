import type { UIManager } from "./UIManager";
import type { GameModeManager } from "../modes/GameModeManager";
import {
  KEY_DEFAULTS,
  QUALITIES,
  sanitizePresentation,
} from "../presentation/settings";
const esc = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export class PresentationUI {
  private abort = new AbortController();
  private disposers: (() => void)[] = [];
  constructor(
    private ui: UIManager,
    private modes: GameModeManager,
  ) {
    const action = ui.onAction,
      render = ui.onRender;
    ui.onAction = (a) => {
      if (a === "settings") {
        this.settings();
        return true;
      }
      if (a === "view:toggle") {
        this.p.ui = this.p.ui === "simple" ? "advanced" : "simple";
        ui.game.save.persist();
        this.render();
        return true;
      }
      if (a === "view:fullscreen") {
        void (
          document.fullscreenElement
            ? document.exitFullscreen()
            : document.documentElement.requestFullscreen()
        ).catch(() =>
          ui.message("이 브라우저는 전체 화면을 지원하지 않습니다."),
        );
        return true;
      }
      if (a === "view:skip") {
        ui.game.events.emit("presentationSkip", {});
        return true;
      }
      return action?.(a) ?? false;
    };
    ui.onRender = () => {
      render?.();
      this.render();
    };
    ui.root
      .querySelector(".top-actions")!
      .insertAdjacentHTML(
        "afterbegin",
        '<button data-action="view:toggle" id="view-toggle" title="화면 정보량을 전환합니다">SIMPLE UI</button><button data-action="view:skip" title="등장 배너와 카메라 연출 건너뛰기">연출 건너뛰기</button><button data-action="view:fullscreen" title="전체 화면 전환" aria-label="전체 화면">⛶</button>',
      );
    ui.root
      .querySelector(".table-section")!
      .insertAdjacentHTML(
        "afterbegin",
        '<div id="focus-objective" role="status"></div>',
      );
    ui.root.querySelectorAll<HTMLElement>('[data-action="start"], [data-action="campaign:new"]').forEach(el=>el.hidden=false);
    const note = ui.root.querySelector(".edition-note");
    if (note) note.textContent = "PHASE 09 · FEEL EVERY IMPACT";
    const tagline = ui.root.querySelector(".tagline");
    if (tagline) tagline.textContent = "Bounce, Build, Conquer!";
    ui.root.addEventListener(
      "click",
      (e) => {
        if ((e.target as Element).closest("button:not(:disabled)"))
          ui.audio.uiClick();
      },
      { signal: this.abort.signal },
    );
    this.disposers.push(
      ui.game.events.on("production", (p) => {
        if (p.amount <= 0) return;
        const hud = ui.root.querySelector(`#res-${p.resource}`);
        if (hud) {
          hud.classList.remove("resource-earned");
          void (hud as HTMLElement).offsetWidth;
          hud.classList.add("resource-earned");
        }
      }),
    );
    this.render();
  }
  get p() {
    return this.ui.game.save.data.settings.presentation;
  }
  settings() {
    const p = this.p,
      s = this.ui.game.save.data.settings;
    const slider = (
      key: string,
      name: string,
      value: number,
      min = 0,
      max = 100,
    ) =>
      `<label class="setting">${name}<output id="p-${key}">${Math.round(value * 100)}%</output><input aria-label="${name}" data-p="${key}" type="range" min="${min}" max="${max}" value="${value * 100}"></label>`;
    const check = (key: string, name: string, value: boolean) =>
      `<label class="setting-check"><input type="checkbox" data-p="${key}" ${value ? "checked" : ""}>${name}</label>`;
    const select = (
      key: string,
      name: string,
      values: string[],
      value: string,
    ) =>
      `<label class="setting">${name}<select data-p="${key}" aria-label="${name}">${values.map((v) => `<option ${v === value ? "selected" : ""}>${v}</option>`).join("")}</select></label>`;
    this.ui.open(
      "ROYAL SETTINGS · 플레이 환경",
      `<div class="settings-tabs"><fieldset><legend>화면 · GRAPHICS</legend>${select("quality", "그래픽 품질", [...QUALITIES], p.quality)}${check("autoQuality", "지속적인 프레임 저하 시 장식 품질 자동 감소", p.autoQuality)}${select("lighting", "조명", ["cycle", "day", "sunset", "night"], p.lighting)}${check("weather", "지역 날씨", p.weather)}${slider("particleAmount", "파티클 밀도", p.particleAmount)}${check("particles", "파티클과 잔상", s.particles)}${select("ui", "HUD 구성", ["simple", "advanced"], p.ui)}${slider("uiScale", "UI 크기", p.uiScale, 85, 140)}${slider("textScale", "글자 크기", p.textScale, 85, 140)}</fieldset><fieldset><legend>접근성 · ACCESSIBILITY</legend>${slider("shakeAmount", "흔들림 강도", p.shakeAmount)}${check("shake", "카메라 흔들림 허용", s.shake)}${check("reduceFlash", "강한 섬광 감소", p.reduceFlash)}${check("outline", "공 외곽선 강화", p.outline)}${check("contrast", "높은 대비", p.contrast)}${check("symbols", "진영·속성 보조 문양", p.symbols)}${check("cinematics", "짧은 등장 연출", p.cinematics)}${check("debug", "실측 성능 정보 표시", p.debug)}<p>날씨와 품질은 장식만 변경합니다. 물리·전투·보상은 동일합니다. 자동 품질은 20초 이상 관찰 후 한 단계씩 낮춥니다.</p></fieldset><fieldset><legend>오디오 · MIXER</legend>${slider("master", "전체 음량", p.master)}${slider("music", "음악", s.music)}${slider("effects", "전체 효과음", s.effects)}${slider("pinball", "핀볼", p.pinball)}${slider("combat", "전투", p.combat)}${slider("magic", "마법", p.magic)}${slider("ambience", "환경음", p.ambience)}${slider("uiSound", "메뉴", p.uiSound)}${check("muted", "전체 음소거", s.muted)}<p>각 채널을 0%로 설정하면 해당 채널만 음소거됩니다.</p></fieldset><fieldset><legend>키 설정 · CONTROLS</legend><p>중복 키는 저장되지 않습니다. ESC·R·M, 속성 Z/X/C/V, 방향키는 고정입니다.</p>${Object.entries(
        KEY_DEFAULTS,
      )
        .map(
          ([a]) =>
            `<label class="setting">${{ left: "왼쪽 플리퍼", right: "오른쪽 플리퍼", launch: "발사", nudge: "흔들기", build: "건설", army: "군대", formation: "진형", war: "전쟁", magic: "마법", multi: "멀티볼", storm: "CORE STORM" }[a]}<input readonly aria-label="키 설정 ${a}" data-key="${a}" value="${esc(p.keys[a as keyof typeof p.keys])}" title="선택 후 사용할 키를 누르세요"></label>`,
        )
        .join(
          "",
        )}<p id="key-feedback" role="status"></p></fieldset></div><button class="primary" data-action="close">설정 완료</button>`,
    );
    this.ui.dialog
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-p]")
      .forEach((input) =>
        input.addEventListener("input", () => {
          const key = input.dataset.p!;
          const value =
            input instanceof HTMLInputElement && input.type === "checkbox"
              ? input.checked
              : input instanceof HTMLInputElement
                ? +input.value / 100
                : input.value;
          if (["music", "effects", "particles", "shake", "muted"].includes(key))
            Object.assign(s, { [key]: value });
          else Object.assign(p, sanitizePresentation({ ...p, [key]: value }));
          const out = this.ui.dialog.querySelector(`#p-${key}`);
          if (out) out.textContent = `${Math.round(Number(value) * 100)}%`;
          this.ui.game.save.persist();
          this.ui.audio.sync();
          this.render();
        }),
      );
    this.ui.dialog
      .querySelectorAll<HTMLInputElement>("[data-key]")
      .forEach((input) =>
        input.addEventListener("keydown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const candidate = { ...p.keys, [input.dataset.key!]: e.code };
          const valid = sanitizePresentation({ ...p, keys: candidate }).keys;
          const ok = JSON.stringify(valid) === JSON.stringify(candidate);
          this.ui.text(
            "key-feedback",
            ok ? "키 설정을 저장했습니다." : "중복 또는 예약된 키입니다.",
          );
          if (ok) {
            p.keys = valid;
            input.value = e.code;
            this.ui.game.save.persist();
          }
        }),
      );
  }
  render() {
    const root = this.ui.root,
      p = this.p,
      g = this.ui.game;
    root.dataset.view = p.ui;
    root.dataset.play = g.state;
    root.dataset.contrast = String(p.contrast);
    root.dataset.flat = String(!!g.sessionExtension?.flatBoard);
    root.dataset.building = String(!!g.builder?.active);
    root.style.setProperty("--ui-scale", String(p.uiScale));
    root.style.setProperty("--text-scale", String(p.textScale));
    this.ui.text(
      "view-toggle",
      p.ui === "simple" ? "SIMPLE UI" : "ADVANCED UI",
    );
    const s = this.modes.active ? this.modes.session : null;
    const objective = s
      ? s.kind === "puzzle"
        ? `목표 ${this.modes.puzzle?.board.hits ?? 0} · ${s.name}`
        : s.status === "reward"
          ? "보상 1개를 선택하세요."
          : s.kind === "survival"
            ? `웨이브 ${s.wave.number} · 왕궁을 지키세요.`
            : s.name
      : g.war
        ? g.war.castle("ally").hp / g.war.castle("ally").maxHp < 0.25
          ? "왕궁 위기 · 수리와 방어가 필요합니다."
          : g.war.preparing
            ? "침공에 대비해 건설·병력을 준비하세요."
            : "적 성벽을 돌파하고 왕궁을 점령하세요."
        : g.economy
          ? "생산시설을 타격해 왕국을 성장시키세요."
          : "왕궁 5회 타격 · ROYAL BONUS";
    this.ui.text(
      "focus-objective",
      g.state === "menu"
        ? "FEEL EVERY IMPACT · WATCH YOUR KINGDOM RISE"
        : objective,
    );
    this.ui.text(
      "charge-label",
      `${p.keys.launch.replace("Key", "")} · CHARGE`,
    );
  }
  dispose() {
    this.abort.abort();
    this.disposers.forEach((f) => f());
  }
}
