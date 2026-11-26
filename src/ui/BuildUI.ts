import type { GameStateManager } from "../core/GameStateManager";
import type { UIManager } from "./UIManager";
import {
  BUILDINGS,
  BUILD_TUTORIAL,
  TERRITORIES,
  buildingConfig,
} from "../config/buildings";
import { RESOURCE_IDS, RESOURCES, type Cost } from "../config/economy";
import { activeSynergies, SYNERGIES } from "../building/BuildingManager";
import { snap } from "../building/PlacementValidator";
import type { BlueprintItem, BuildingCategory } from "../building/types";
const costs = (c: Cost) =>
  RESOURCE_IDS.filter((r) => c[r])
    .map((r) => `${RESOURCES[r].name} ${c[r]}`)
    .join(" · ") || "없음";
const categories: Record<BuildingCategory, string> = {
  economy: "경제",
  operation: "운영",
  physics: "물리",
  magic: "마법",
  military: "군사",
};
export function buildingSVG(
  b: BlueprintItem & { id?: string },
  selected = false,
  ghost = false,
): string {
  const c = buildingConfig(b.type)!;
  const color = {
    economy: "#91bd7e",
    operation: "#d6bc75",
    physics: "#c49c66",
    magic: "#b494ec",
    military: "#85aec3",
  }[c.category];
  const rect = `<rect x="${-c.width / 2}" y="${-c.height / 2}" width="${c.width}" height="${c.height}" rx="${c.category === "physics" ? 2 : 4}"/>`;
  const shape = c.shape === "circle" ? `<circle r="${c.width / 2}"/>` : rect;
  const roof =
    c.category === "physics"
      ? c.sensor
        ? '<path d="M-12 0H12M4-7l8 7-8 7" fill="none"/>'
        : `<path d="M${-c.width / 2 + 3} -2H${c.width / 2 - 3}"/>`
      : c.category === "magic"
        ? '<path d="M0-12 8 0 0 12-8 0Z" fill="#bce7fa"/>'
        : `<path d="M-12-2 0-14 12-2Z" fill="${b.level >= 3 ? "#b6c9cf" : "#755b43"}"/><rect x="-3" y="1" width="6" height="9" fill="#18332e"/>`;
  return `<g ${b.id ? `data-building="${b.id}"` : ""} transform="translate(${b.x} ${b.y}) rotate(${b.angle})" opacity="${ghost ? 0.55 : 1}" class="built-structure"><g fill="#132c29" stroke="${selected ? "#fff3b2" : color}" stroke-width="${selected ? 3 : 2}">${shape}${roof}</g>${b.level >= 2 ? `<path d="M${c.width / 2 - 4} -5v-17l12 3-12 4" fill="${b.level >= 4 ? "#f1d583" : color}" stroke="#d2c69f" stroke-width="1"/>` : ""}<text y="${c.height / 2 + 11}" text-anchor="middle" fill="#e6e4c5" font-size="9" transform="rotate(${-b.angle})">${c.name} ${b.level}</text>${b.level === 5 ? '<circle r="25" fill="none" stroke="#f1da8c" opacity=".5"/>' : ""}</g>`;
}
export class BuildUI {
  private overlay: SVGSVGElement;
  private left: HTMLElement;
  private right: HTMLElement;
  private toolbar: HTMLElement;
  private abort = new AbortController();
  private category: BuildingCategory = "physics";
  private selected?: string;
  private moving = false;
  private preview?: BlueprintItem;
  private feedback = "";
  private last = "";
  private lastDraw = "";
  private pendingPreset?: BlueprintItem[];
  constructor(
    private ui: UIManager,
    private game: GameStateManager,
  ) {
    ui.root
      .querySelector(".economy-nav")!
      .insertAdjacentHTML(
        "beforeend",
        '<button data-action="build:toggle">건설 B<small>BUILD</small></button>',
      );
    ui.root
      .querySelector(".left-panel")!
      .insertAdjacentHTML(
        "beforeend",
        '<section id="build-left" class="build-panel" hidden></section>',
      );
    ui.root
      .querySelector(".right-panel")!
      .insertAdjacentHTML(
        "beforeend",
        '<section id="build-right" class="build-panel" hidden></section>',
      );
    ui.root
      .querySelector(".table-frame")!
      .insertAdjacentHTML(
        "beforeend",
        '<svg id="build-overlay" viewBox="0 0 600 900" aria-label="건설 배치 영역"></svg>',
      );
    ui.root
      .querySelector(".table-section")!
      .insertAdjacentHTML(
        "beforeend",
        '<nav id="build-toolbar" class="build-panel" hidden aria-label="건설 조작"><button data-action="build:cancel">선택 취소</button><button data-action="build:rotate:-15">Q ↶</button><button data-action="build:rotate:15">E ↷</button><button data-action="build:undo">실행 취소</button><button data-action="build:test">TEST BALL</button><button data-action="build:finish" class="primary">플레이 재개</button></nav>',
      );
    this.overlay = ui.root.querySelector("#build-overlay")!;
    this.left = ui.root.querySelector("#build-left")!;
    this.right = ui.root.querySelector("#build-right")!;
    this.toolbar = ui.root.querySelector("#build-toolbar")!;
    const oldAction = ui.onAction,
      oldRender = ui.onRender;
    ui.onAction = (a) => this.action(a) || oldAction?.(a) || false;
    ui.onRender = () => {
      oldRender?.();
      this.render();
    };
    this.overlay.addEventListener(
      "pointermove",
      (e) => {
        if (!this.game.builder?.active || this.game.testBall || !this.preview)
          return;
        const r = this.overlay.getBoundingClientRect();
        this.preview.x = snap(((e.clientX - r.left) / r.width) * 600);
        this.preview.y = snap(((e.clientY - r.top) / r.height) * 900);
        this.last = "";
      },
      { signal: this.abort.signal },
    );
    this.overlay.addEventListener(
      "click",
      (e) => {
        if (!this.game.builder?.active || this.game.testBall) return;
        if (this.preview) {
          this.place();
          return;
        }
        const id = (e.target as Element)
          .closest("[data-building]")
          ?.getAttribute("data-building");
        this.selected = id ?? undefined;
        this.last = "";
      },
      { signal: this.abort.signal },
    );
    this.overlay.addEventListener(
      "contextmenu",
      (e) => {
        if (this.game.builder?.active) {
          e.preventDefault();
          this.cancel();
        }
      },
      { signal: this.abort.signal },
    );
    ui.root.addEventListener(
      "change",
      (e) => {
        const input = e.target as HTMLInputElement;
        if (input.id === "build-category") {
          this.category = input.value as BuildingCategory;
          this.last = "";
        }
        if (input.dataset.buildCoordinate && this.preview) {
          const n = Number(input.value);
          if (Number.isFinite(n))
            this.preview[input.dataset.buildCoordinate as "x" | "y"] = snap(n);
          this.last = "";
        }
      },
      { signal: this.abort.signal },
    );
  }
  handleKey(e: KeyboardEvent): boolean {
    if ((e.target as HTMLElement).matches("input,select,textarea"))
      return false;
    if (e.code === "KeyB" && !this.ui.dialog.open) {
      e.preventDefault();
      if (!e.repeat) this.action("build:toggle");
      return true;
    }
    if (!this.game.builder?.active) return false;
    if (this.ui.dialog.open) return false;
    const action =
      e.code === "KeyQ"
        ? "build:rotate:-15"
        : e.code === "KeyE"
          ? "build:rotate:15"
          : e.code === "Delete"
            ? "build:delete"
            : e.ctrlKey && e.code === "KeyZ"
              ? "build:undo"
              : e.code === "Escape"
                ? "build:cancel"
                : e.code === "KeyR" && this.game.testBall
                  ? "build:relaunch"
                  : undefined;
    if (action) {
      e.preventDefault();
      if (!e.repeat) this.action(action);
      return true;
    }
    return !this.game.testBall;
  }
  private cancel() {
    this.preview = undefined;
    this.pendingPreset = undefined;
    this.moving = false;
    this.selected = undefined;
    this.last = "";
  }
  private place() {
    const m = this.game.builder;
    if (!m || !this.preview) return;
    const error =
      this.moving && this.selected
        ? m.move(this.selected, this.preview)
        : m.build(this.preview);
    this.feedback = error ?? "건설 완료 · 배치가 저장되었습니다.";
    this.ui.audio.unlock();
    if (error) this.game.events.emit("construction", { kind: "invalid" });
    else {
      this.preview = undefined;
      this.moving = false;
    }
    this.last = "";
  }
  action(a: string): boolean {
    if (!a.startsWith("build:")) {
      if (
        this.game.builder?.active &&
        !["sound", "settings", "close"].includes(a)
      ) {
        this.feedback = "건설을 완료한 뒤 다른 메뉴를 이용하세요.";
        this.last = "";
        return true;
      }
      return false;
    }
    const [, cmd, id] = a.split(":");
    const m = this.game.builder;
    if (!m || this.game.saveConflict) return true;
    if (cmd === "toggle" || cmd === "finish") {
      if (m.active) {
        const error = this.game.leaveBuild();
        this.feedback = error ?? "";
        if (!error) this.cancel();
      } else {
        this.ui.close(false);
        this.game.enterBuild();
        this.feedback =
          "목재 반사판 추천 위치: (300, 340). 배치 전에는 비용을 쓰지 않습니다.";
      }
      this.last = "";
      return true;
    }
    if (!m.active) return true;
    if (cmd === "test") {
      if (this.game.testBall) {
        this.game.stopTestBall();
        this.feedback =
          "실제 공과 경제 상태가 보존된 건설 모드로 돌아왔습니다.";
      } else {
        this.cancel();
        this.game.startTestBall();
      }
      this.last = "";
      return true;
    }
    if (cmd === "relaunch") {
      if (this.game.testBall) {
        this.game.testBall.paused = false;
        this.game.testBall.reset();
      }
      return true;
    }
    if (this.game.testBall) return true;
    if (cmd === "select") {
      this.preview = { type: id, x: 300, y: 340, angle: 0, level: 1 };
      this.selected = undefined;
      this.moving = false;
      m.data.tutorial = Math.max(2, m.data.tutorial);
      this.game.events.emit("construction", { kind: "select" });
    }
    if (cmd === "cancel") this.cancel();
    if (cmd === "rotate") {
      if (!this.preview && this.selected) {
        const b = m.buildings.find((b) => b.id === this.selected);
        if (b) {
          this.preview = { ...b };
          this.moving = true;
        }
      }
      if (this.preview) {
        const step =
          buildingConfig(this.preview.type)!.category === "physics" ||
          this.preview.type === "wall"
            ? 15
            : 90;
        this.preview.angle =
          (this.preview.angle + Math.sign(Number(id)) * step + 360) % 360;
        m.data.tutorial = Math.max(3, m.data.tutorial);
      }
    }
    if (cmd === "place") this.place();
    if (cmd === "move") {
      const b = m.buildings.find((b) => b.id === this.selected);
      if (b) {
        this.preview = { ...b };
        this.moving = true;
      }
    }
    if (cmd === "inspect") {
      this.cancel();
      this.selected = id;
    }
    if (cmd === "upgrade") {
      const b = m.buildings.find((b) => b.id === this.selected);
      if (b) this.feedback = m.upgrade(b.id, Number(id)) ?? "강화 완료";
    }
    if (cmd === "delete") {
      const b = m.buildings.find((b) => b.id === this.selected);
      if (b)
        this.ui.open(
          "건물 철거 확인",
          `<p>${buildingConfig(b.type)!.name} Lv.${b.level}</p><p>지불한 투자: ${costs(b.paid)}</p><p>회수: ${costs(m.refund(b))} (이동 비용 제외)</p><p>창고 용량이 줄면 초과 자원은 소실됩니다.</p><button data-action="build:demolish:${b.id}">철거 확정</button><button data-action="close">취소</button>`,
        );
    }
    if (cmd === "demolish") {
      this.feedback = m.demolish(id) ?? "철거 완료";
      this.ui.close(false);
      this.cancel();
      this.game.events.emit("construction", { kind: "demolish" });
    }
    if (cmd === "undo") {
      this.feedback = m.undo()
        ? "직전 거래를 정확히 되돌렸습니다."
        : "취소할 거래가 없습니다.";
      this.cancel();
    }
    if (cmd === "expand") this.feedback = m.expand(id) ?? "영토 확장 완료";
    if (cmd === "plans") this.showPlans();
    if (cmd === "save") {
      const name =
        this.ui.dialog.querySelector<HTMLInputElement>("#preset-name")?.value ??
        "";
      m.savePreset(name, Number(id));
      this.showPlans();
    }
    if (cmd === "remove") {
      m.data.presets.splice(Number(id), 1);
      m.economy.checkpoint();
      this.showPlans();
    }
    if (cmd === "preset") {
      const p = m.data.presets[Number(id)];
      if (p) this.quote(p.items, p.name);
    }
    if (cmd === "recommend") {
      const recipes: Record<string, BlueprintItem[]> = {
        economy: [
          { type: "woodDeflector", x: 300, y: 340, angle: 45, level: 1 },
          { type: "lumber", x: 300, y: 520, angle: 0, level: 1 },
        ],
        combo: [
          { type: "woodDeflector", x: 300, y: 340, angle: 135, level: 1 },
          { type: "bumper", x: 300, y: 520, angle: 0, level: 1 },
        ],
        fortress: [
          { type: "wall", x: 120, y: 400, angle: 90, level: 1 },
          { type: "wall", x: 470, y: 540, angle: 90, level: 1 },
        ],
        magic: [
          { type: "arcane", x: 300, y: 340, angle: 0, level: 1 },
          { type: "booster", x: 300, y: 520, angle: 270, level: 1 },
        ],
      };
      this.quote(recipes[id], `${id} 추천 설계`);
    }
    if (cmd === "apply" && this.pendingPreset) {
      this.feedback = m.applyPreset(this.pendingPreset) ?? "설계 적용 완료";
      this.pendingPreset = undefined;
      this.ui.close(false);
    }
    if (cmd === "goals") this.showGoals();
    if (cmd === "claim") {
      m.claim(id);
      this.showGoals();
    }
    if (cmd === "tutorial") {
      m.data.tutorial = 0;
      m.data.tutorialDone = false;
    }
    if (cmd === "skip") {
      m.data.tutorialDone = true;
      m.economy.checkpoint();
    }
    this.last = "";
    return true;
  }
  private quote(items: BlueprintItem[], name: string) {
    const q = this.game.builder!.quote(items);
    this.pendingPreset = items;
    this.ui.open(
      name,
      `<p>기존에 없는 시설·강화·이동의 총 비용: ${costs(q.cost)}</p><p>설계에 없는 기존 건물은 유지합니다.</p><svg viewBox="0 100 600 600" class="blueprint-preview">${items.map((b) => buildingSVG(b, false, true)).join("")}</svg><p>${q.error ?? "✓ 자원과 배치 검사 통과"}</p><button class="primary" data-action="build:apply" ${q.error ? "disabled" : ""}>비용 지불 후 적용</button><button data-action="close">취소</button>`,
    );
  }
  private showPlans() {
    const m = this.game.builder!;
    this.ui.open(
      "왕국 설계 도면",
      `<p>추천 설계도 동일한 비용·해금·안전 검사를 거칩니다.</p><div class="build-button-grid">${["economy", "combo", "fortress", "magic"].map((id, i) => `<button data-action="build:recommend:${id}">${["경제 발전형", "콤보 집중형", "요새 방어형", "마법 활용형"][i]}</button>`).join("")}</div><label>프리셋 이름 <input id="preset-name" maxlength="32" value="나의 왕국"></label>${[0, 1, 2].map((i) => `<article><b>${m.data.presets[i]?.name ?? `빈 슬롯 ${i + 1}`}</b><button data-action="build:save:${i}">현재 배치 저장 / 이름 변경</button>${m.data.presets[i] ? `<button data-action="build:preset:${i}">미리 보기</button><button data-action="build:remove:${i}">삭제</button>` : ""}</article>`).join("")}`,
    );
  }
  private showGoals() {
    const m = this.game.builder!;
    this.ui.open(
      "건설 목표와 조합",
      `<p>목표당 목재 10 · 금화 20. 한 번만 수령합니다.</p>${m.goals.map((g) => `<article class="build-goal">${g.name}<button data-action="build:claim:${g.id}" ${!g.done || m.data.claimed.includes(g.id) ? "disabled" : ""}>${m.data.claimed.includes(g.id) ? "수령 완료" : g.done ? "보상 받기" : "진행 중"}</button></article>`).join("")}<h3>190px 이내 조합 · 중첩 없음</h3>${SYNERGIES.map((s) => `<p>${activeSynergies(m.economy.data).includes(s.id) ? "✓" : "○"} ${s.name}<small>${s.needs.map((id) => buildingConfig(id)!.name).join(" + ")}</small></p>`).join("")}`,
    );
  }
  render() {
    const m = this.game.mode === "kingdom" ? this.game.builder : undefined,
      active = !!m?.active,
      test = !!this.game.testBall;
    this.ui.root.classList.toggle("building-mode", active);
    this.ui.root.classList.toggle("testing-ball", test);
    this.left.hidden = !active;
    this.right.hidden = !active;
    this.toolbar.hidden = !active;
    this.overlay.classList.toggle("editing", active && !test);
    if (!m) {
      this.overlay.innerHTML = "";
      this.lastDraw = "";
      return;
    }
    const error = this.preview
      ? m.preview(this.preview, this.moving ? this.selected : undefined)
      : null;
    const drawKey = JSON.stringify([
      m.buildings.map((b) => [b.id, b.x, b.y, b.angle, b.level]),
      active,
      test,
      this.preview,
      this.selected,
      error,
      m.data.territories,
    ]);
    if (drawKey !== this.lastDraw) {
      this.lastDraw = drawKey;
      this.overlay.innerHTML = `<defs><pattern id="build-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#d8cf9f" stroke-width=".5" opacity=".35"/></pattern></defs>${
        active && !test
          ? `<rect width="600" height="900" fill="#081b2360"/><rect x="60" y="110" width="455" height="590" fill="url(#build-grid)"/>${TERRITORIES.filter(
              (t) => t.id !== "outer",
            )
              .map(
                (t) =>
                  `<rect x="${t.rect[0]}" y="${t.rect[1]}" width="${t.rect[2]}" height="${t.rect[3]}" fill="${m.data.territories.includes(t.id) ? "#88c9aa12" : "#ae5e5428"}" stroke="${m.data.territories.includes(t.id) ? "#92bc8a" : "#b77c68"}" stroke-dasharray="5 4"/><text x="${t.rect[0] + 8}" y="${t.rect[1] + 16}" font-size="10" fill="#ded1b2">${m.data.territories.includes(t.id) ? "✓" : "🔒"} ${t.name}</text>`,
              )
              .join(
                "",
              )}<rect x="0" y="710" width="600" height="190" fill="#ba5d4c28"/><text x="300" y="744" text-anchor="middle" fill="#ebc2a0" font-size="12">플리퍼 · 손실 구역 보호</text>`
          : ""
      }${(this.game.war && !active ? [] : m.buildings.filter((b) => !b.disabled)).map((b) => buildingSVG(b, b.id === this.selected)).join("")}${this.preview && !test ? `<g>${buildingSVG(this.preview, false, true)}<circle cx="${this.preview.x}" cy="${this.preview.y}" r="35" fill="none" stroke="${error ? "#ff8c79" : "#a1edb1"}" stroke-width="2" stroke-dasharray="4 3"/><path d="M${this.preview.x} ${this.preview.y}l${Math.cos((this.preview.angle * Math.PI) / 180) * 55} ${Math.sin((this.preview.angle * Math.PI) / 180) * 55}" stroke="#efcf7e" stroke-width="2"/></g>` : ""}`;
    }
    if (!active) return;
    const key = JSON.stringify([
      this.category,
      this.selected,
      this.preview,
      this.feedback,
      m.data,
      m.economy.data.resources,
      test,
      error,
    ]);
    if (key === this.last) {
      if (test) this.updateTest();
      return;
    }
    this.last = key;
    this.left.innerHTML = `<div class="eyebrow">THE ROYAL ARCHITECT</div><h2>${test ? "TEST BALL" : "왕국 건설"}</h2><p>${m.buildings.length} / ${m.limit}개 · 왕국 등급 ${m.economy.data.rank}</p><p class="tiny">${m.style}</p>${
      test
        ? "<p>Space 충전 · A / D 플리퍼<br>R 무료 재발사</p>"
        : `<label>시설 분류<select id="build-category">${Object.entries(
            categories,
          )
            .map(
              ([k, v]) =>
                `<option value="${k}" ${this.category === k ? "selected" : ""}>${v}</option>`,
            )
            .join(
              "",
            )}</select></label><div class="building-catalog">${BUILDINGS.filter(
            (c) => c.category === this.category,
          )
            .map(
              (c) =>
                `<button data-action="build:select:${c.id}" ${m.economy.data.rank < c.rank ? "disabled" : ""}><b>${c.name}</b><small>${costs(m.cost(c.id))}</small><span>${m.economy.data.rank < c.rank ? `등급 ${c.rank} 필요` : c.description}</span></button>`,
            )
            .join("")}</div>`
    }${m.buildings.length ? `<h3>배치된 건물</h3>${m.buildings.map((b) => `<button data-action="build:inspect:${b.id}">${buildingConfig(b.type)!.name} Lv.${b.level} · (${b.x}, ${b.y})</button>`).join("")}` : ""}<button data-action="build:plans">추천 설계 · 프리셋</button><button data-action="build:goals">목표 · 건물 조합</button><button data-action="build:tutorial">건설 안내 다시 보기</button>`;
    const b = m.buildings.find((b) => b.id === this.selected),
      p = this.preview,
      c = p ? buildingConfig(p.type) : b ? buildingConfig(b.type) : undefined;
    this.right.innerHTML = `<div class="eyebrow">SHAPE YOUR KINGDOM</div><h2>${c?.name ?? (test ? "독립 물리 시험" : "배치 도구")}</h2><p class="build-feedback" role="status">${this.feedback}</p>${
      test
        ? '<p id="test-info"></p><button data-action="build:relaunch">무료 재발사</button><button class="primary" data-action="build:test">건설로 복귀</button>'
        : `${c ? `<p>${c.description}</p><p>충돌 영역 ${c.width} × ${c.height}px · 반발 ${c.restitution}</p>` : ""}${p ? `<div class="coordinate-fields"><label>X<input data-build-coordinate="x" type="number" step="10" value="${p.x}"></label><label>Y<input data-build-coordinate="y" type="number" step="10" value="${p.y}"></label></div><p>${p.angle}° · ${error ? "✕ " + error : "✓ 배치 가능 · 노란 화살표는 방향 안내"}</p><button class="primary" data-action="build:place" ${error ? "disabled" : ""}>${this.moving ? "이동 확정" : "건설 확정"}</button>` : b ? `<p>Lv.${b.level} · ID ${b.id}<br>누적 생산 ${b.production.yielded} · 활성화 ${b.charge}/5</p><button data-action="build:move">이동 · 비용 10%</button><button data-action="build:upgrade:${b.level}" ${b.level >= 5 ? "disabled" : ""}>강화 ${b.level < 5 ? costs(m.upgradeCost(b)) : "최대"}</button><button data-action="build:delete">철거 · 50% 회수</button>` : "<p>시설을 선택하고 테이블 위를 클릭하세요. 기존 건물을 클릭하면 이동·강화할 수 있습니다.</p>"}<h3>영토 확장</h3>${TERRITORIES.filter(
            (t) => t.id !== "central",
          )
            .map(
              (t) =>
                `<button data-action="build:expand:${t.id}" ${m.data.territories.includes(t.id) ? "disabled" : ""}>${t.name} ${m.data.territories.includes(t.id) ? "✓" : `등급 ${t.rank}`}<small>생산 ${t.production} · ${costs(t.cost)}</small></button>`,
            )
            .join("")}`
    }${!m.data.tutorialDone ? `<aside class="build-guide"><b>건축가의 안내 ${m.data.tutorial + 1}/6</b><p>${BUILD_TUTORIAL[m.data.tutorial]}</p><button data-action="build:skip">안내 건너뛰기</button></aside>` : ""}`;
    this.toolbar.querySelector('[data-action="build:test"]')!.textContent = test
      ? "건설로 복귀"
      : "TEST BALL";
    if (test) this.updateTest();
  }
  private updateTest() {
    const t = this.game.testBall;
    if (t) {
      const e = this.right.querySelector("#test-info");
      if (e)
        e.textContent = `${t.notice} 속도 ${Math.round((t.physics.ball?.speed ?? 0) * 60)}px/s · 충돌 ${t.collisions} · 충전 ${Math.round(t.charge * 100)}%`;
    }
  }
  dispose() {
    this.abort.abort();
  }
}
