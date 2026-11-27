import { patchHTML } from "./patchHTML";
import type { UIManager } from "./UIManager";
import type { GameStateManager } from "../core/GameStateManager";
import {
  ELEMENTS,
  SPELLS,
  MAGIC_RESEARCH,
  MAGIC_BRANCHES,
  MULTI_TYPES,
  STORMS,
  MAGIC_TUTORIAL,
  element,
  spell,
} from "../config/magic";
import type { Element, Spell } from "../magic/types";
import { MagicTraining, MAGIC_LESSONS } from "../magic/MagicTraining";
const esc = (v: unknown) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export class MagicUI {
  readonly training: MagicTraining;
  private aim?: Spell;
  private next = 0;
  private abort = new AbortController();
  private hud: HTMLElement;
  private overlay: HTMLElement;
  private error = "";
  constructor(
    private ui: UIManager,
    private game: GameStateManager,
  ) {
    this.training = new MagicTraining(game);
    ui.root.querySelector(".edition-note")!.innerHTML="PHASE 06 <span>MAGIC & MULTIBALL</span>";
    ui.root.querySelector(".edition")!.innerHTML="THE GREENWOOD CHRONICLES <span>·</span> CHAPTER VI";
    ui.root
      .querySelector(".menu-links")!
      .insertAdjacentHTML(
        "beforeend",
        '<button data-action="magic:training">마법 훈련 <small>MAGIC TRAINING</small></button>',
      );
    ui.root
      .querySelector(".table-section")!
      .insertAdjacentHTML(
        "beforeend",
        '<section id="magic-hud" aria-label="마법 조작"></section>',
      );
    this.hud = ui.root.querySelector("#magic-hud")!;
    ui.root
      .querySelector(".table-frame")!
      .insertAdjacentHTML(
        "beforeend",
        '<div id="magic-aim" hidden><svg viewBox="0 0 600 900"><circle cx="300" cy="400" r="90"/></svg><span>범위를 눌러 시전 · ESC 취소</span></div>',
      );
    this.overlay = ui.root.querySelector("#magic-aim")!;
    const point = (e: PointerEvent) => {
      const r = this.overlay.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / r.width) * 600,
        y: ((e.clientY - r.top) / r.height) * 900,
      };
    };
    this.overlay.addEventListener(
      "pointermove",
      (e) => {
        const p = point(e);
        const c = this.overlay.querySelector("circle")!;
        c.setAttribute("cx", String(p.x));
        c.setAttribute("cy", String(p.y));
      },
      { signal: this.abort.signal },
    );
    this.overlay.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        if (this.aim) this.report(this.game.magic?.cast(this.aim, point(e)));
        this.cancelAim();
      },
      { signal: this.abort.signal },
    );
    const action = ui.onAction,
      render = ui.onRender;
    ui.onAction = (a) => this.action(a) || action?.(a) || false;
    ui.onRender = () => {
      render?.();
      this.render();
    };
  }
  private report(error?: string | null) {
    if (error)
      this.game.events.emit("message", { text: error, tone: "warning" });
  }
  private cancelAim() {
    this.aim = undefined;
    this.overlay.hidden = true;
  }
  handleKey(e: KeyboardEvent) {
    if (this.aim && e.code === "Escape") {
      e.preventDefault();
      this.cancelAim();
      return true;
    }
    if (
      !this.game.magic ||
      this.ui.dialog.open ||
      this.game.builder?.active ||
      this.game.testBall ||
      (e.target as HTMLElement).matches("input,select,textarea")
    )
      return false;
    const codes = [
        "KeyZ",
        "KeyX",
        "KeyC",
        "KeyV",
        "KeyG",
        "KeyH",
        "KeyJ",
        "KeyK",
        "Tab",
      ],
      i = codes.indexOf(e.code);
    if (i < 0) return false;
    e.preventDefault();
    if (!e.repeat)
      this.action(
        i < 4
          ? `magic:ball:${i}`
          : i < 6
            ? `magic:spell:${i - 4}`
            : i === 6
              ? "magic:multi"
              : i === 7
                ? "magic:storm"
                : "magic:panel",
      );
    return true;
  }
  private action(a: string) {
    if (!a.startsWith("magic:")) return false;
    const [, id, arg] = a.split(":"),
      m = this.game.magic;
    if (id === "training") {
      this.ui.open(
        "마법 훈련장",
        `<p>가상 자원과 별도 전장입니다. 원래 왕국·연구·전쟁 기록은 유지됩니다.</p>${MAGIC_LESSONS.map((s, i) => `<button data-action="magic:lesson:${i}">${i + 1}. ${s}</button>`).join("")}`,
      );
      return true;
    }
    if (id === "lesson") {
      this.ui.close(false);
      this.training.start(Number(arg));
      return true;
    }
    if (id === "exit") {
      this.ui.close(false);
      this.training.exit();
      return true;
    }
    if (!m) return true;
    if (id === "panel") this.panel();
    if (id === "ball") {
      const type = m.data.loadout.balls[Number(arg)];
      if (type) this.report(m.activate(type));
    }
    if (id === "steel") this.report(m.activate("steel"));
    if (id === "spell") {
      const type = m.data.loadout.spells[Number(arg)];
      if (type) {
        if (m.data.loadout.autoAim) this.report(m.cast(type));
        else {
          this.aim = type;
          this.overlay.hidden = false;
          this.overlay
            .querySelector("circle")!
            .setAttribute("r", String(spell(type).radius));
        }
      }
    }
    if (id === "multi" || id === "storm")
      this.report(m.multiball(id === "storm"));
    if (id === "research") {
      this.error =
        m.research(arg) ?? "연구를 시작했습니다. 패널을 닫으면 진행됩니다.";
      this.panel();
    }
    if (id === "save") {
      const d = this.ui.dialog;
      this.error =
        m.configure(
          Array.from(d.querySelectorAll<HTMLSelectElement>("[data-ball-slot]"))
            .map((s) => s.value as Element)
            .filter(Boolean),
          Array.from(d.querySelectorAll<HTMLSelectElement>("[data-spell-slot]"))
            .map((s) => s.value as Spell)
            .filter(Boolean),
          d.querySelector<HTMLSelectElement>("#magic-multi")!.value,
          d.querySelector<HTMLSelectElement>("#magic-storm")!.value,
          d.querySelector<HTMLInputElement>("#magic-auto")!.checked,
        ) ?? "편성을 저장했습니다.";
      this.panel();
    }
    if (id === "preset") {
      const sets: Record<string, [Element[], Spell[]]> = {
        attack: [
          ["fire", "thunder", "cannon", "explosion"],
          ["fireStorm", "earthquake"],
        ],
        defense: [
          ["ice", "healing", "cannon", "steel"],
          ["royalShield", "holyLight"],
        ],
        economy: [
          ["golden", "healing", "steel", "fire"],
          ["holyLight", "royalShield"],
        ],
        arcane: [
          ["fire", "ice", "thunder", "chaos"],
          ["chainLightning", "frostField"],
        ],
      };
      const s = sets[arg];
      this.error =
        m.configure(
          s[0].filter((e) => e === "steel" || m.data.research[e]),
          s[1].filter((e) => m.data.research[e]),
          "steel",
          "core",
          m.data.loadout.autoAim,
        ) ?? "연구한 능력으로 프리셋을 적용했습니다.";
      this.panel();
    }
    if (id === "tutorial") {
      m.data.tutorial = 0;
      m.data.tutorialDone = false;
      this.tutorial();
    }
    if (id === "next") {
      if (++m.data.tutorial >= MAGIC_TUTORIAL.length) {
        m.data.tutorialDone = true;
        this.ui.close();
      } else this.tutorial();
      m.save();
    }
    if (id === "skip") {
      m.data.tutorialDone = true;
      m.save();
      this.ui.close();
    }
    return true;
  }
  private tutorial() {
    const d = this.game.magic!.data;
    this.ui.open(
      `마법 안내 ${d.tutorial + 1} / 13`,
      `<p>${MAGIC_TUTORIAL[d.tutorial]}</p><button data-action="magic:next">다음</button><button data-action="magic:skip">건너뛰기</button>`,
    );
  }
  private panel() {
    const m = this.game.magic!,
      d = m.data;
    const options = (type: "ball" | "spell", selected: string) =>
      `<option value="">빈 슬롯</option>` +
      (type === "ball" ? ELEMENTS : SPELLS)
        .filter((c) => c.id === "steel" || d.research[c.id])
        .map(
          (c) =>
            `<option value="${c.id}" ${c.id === selected ? "selected" : ""}>${c.name}</option>`,
        )
        .join("");
    this.ui.open(
      "ARCANE CHAMBER · 마법 관리",
      `<p class="magic-message" role="status">${esc(this.error)}</p><p>마력석 ${Math.floor(m.economy.data.resources.mana)} · 충전 ${Math.floor(d.charge)} / 100 · 편성은 준비 기간 또는 공이 아군 하단에 있을 때 변경할 수 있습니다.</p><details open><summary>전투 편성</summary><div class="magic-grid">${[0, 1, 2, 3].map((i) => `<label>${"ZXCV"[i]} 스피어<select data-ball-slot>${options("ball", d.loadout.balls[i])}</select></label>`).join("")}${[0, 1].map((i) => `<label>${"GH"[i]} 주문<select data-spell-slot>${options("spell", d.loadout.spells[i])}</select></label>`).join("")}<label>J 멀티볼<select id="magic-multi">${Object.entries(
        MULTI_TYPES,
      )
        .map(
          ([id, c]) =>
            `<option value="${id}" ${id === d.loadout.multi ? "selected" : ""}>${c.name} (+${c.extra} 마력석)</option>`,
        )
        .join(
          "",
        )}</select></label><label>K 궁극기<select id="magic-storm">${Object.entries(
        STORMS,
      )
        .map(
          ([id, c]) =>
            `<option value="${id}" ${id === d.loadout.storm ? "selected" : ""}>${c.name}</option>`,
        )
        .join(
          "",
        )}</select></label></div><label><input id="magic-auto" type="checkbox" ${d.loadout.autoAim ? "checked" : ""}> 주문 자동 조준 · 공의 궤적에는 개입하지 않습니다.</label><button data-action="magic:save">편성 저장</button><div>${[
        ["attack", "공격"],
        ["defense", "방어"],
        ["economy", "경제"],
        ["arcane", "마법"],
      ]
        .map(
          ([id, n]) =>
            `<button data-action="magic:preset:${id}">${n} 프리셋</button>`,
        )
        .join(
          "",
        )}</div></details><p>${d.task ? `${esc(d.task.id)} 연구 ${Math.floor(d.task.progress * 100)}% · 시설 파괴 시 중단` : "진행 중인 연구 없음"}</p>${Object.entries(
        MAGIC_BRANCHES,
      )
        .map(
          ([id, name]) =>
            `<details><summary>${name}</summary>${MAGIC_RESEARCH.filter(
              (r) => r.branch === id,
            )
              .map(
                (r) =>
                  `<article class="magic-research"><b>${r.name} ${d.research[r.id] ?? 0}/3</b><small>등급 ${r.rank} · ${r.facility} · 다음 비용 ${Object.entries(
                    r.cost,
                  )
                    .map(
                      ([k, n]) => `${k} ${n * ((d.research[r.id] ?? 0) + 1)}`,
                    )
                    .join(
                      " / ",
                    )} · ${r.seconds * ((d.research[r.id] ?? 0) + 1)}초</small><button data-action="magic:research:${r.id}" ${d.task || (d.research[r.id] ?? 0) >= 3 ? "disabled" : ""}>연구</button></article>`,
              )
              .join("")}</details>`,
        )
        .join(
          "",
        )}<details><summary>마법 기록 · 업적</summary><p>피해 ${Math.floor(Object.values(d.stats.damage).reduce((a, b) => a + (b ?? 0), 0))} / 지속 피해 ${Math.floor(d.stats.dot)} / 회복 ${Math.floor(d.stats.healing)} / 보호 ${Math.floor(d.stats.shield)}</p><p>멀티볼 ${d.stats.multiballs}회 · 최대 ${d.stats.maxBalls}공 · STORM ${d.stats.storms}회 / 피해 ${Math.floor(d.stats.stormDamage)}</p><p>${d.achievements.map(esc).join(" · ") || "아직 달성한 업적 없음"}</p></details><button data-action="magic:tutorial">13단계 안내 다시 보기</button><button class="primary" data-action="close">전장으로 돌아가기</button>`,
    );
    this.ui.dialog.classList.add("wide");
  }
  render() {
    if (performance.now() < this.next) return;
    this.next = performance.now() + 120;
    const m = this.game.magic;
    this.hud.hidden = !m || this.game.state === "menu" || !!this.game.testBall;
    if (this.hud.hidden) {
      this.cancelAim();
      return;
    }
    const d = m!.data,
      b = m!.balls?.state(),
      remaining = d.multi
        ? Math.max(0, (d.multi.until - this.game.time) / 1000)
        : 0;
    patchHTML(
      this.hud,
      `<div class="magic-gauges"><span>MAGIC <b>${Math.floor(d.charge)}</b><meter max="100" value="${d.charge}"></meter></span><span>MULTI <b>${Math.floor(d.multiCharge)}</b><meter max="100" value="${d.multiCharge}"></meter></span><span>STORM <b>${Math.floor(d.stormCharge)}</b><meter max="100" value="${d.stormCharge}"></meter></span></div><div class="magic-slots">${d.loadout.balls
        .map((id, i) => {
          const c = element(id);
          return `<button data-action="magic:ball:${i}" title="${esc(c.description)}">${"ZXCV"[i]} ${c.glyph} ${c.name}<small>마력석 ${c.mana} · 충전 ${c.charge}</small></button>`;
        })
        .join("")}${d.loadout.spells
        .map((id, i) => {
          const c = spell(id),
            cd = Math.max(
              0,
              Math.ceil(((d.cooldowns[id] ?? 0) - this.game.time) / 1000),
            );
          return `<button data-action="magic:spell:${i}" ${cd ? "disabled" : ""}>${"GH"[i]} ${c.name}<small>${cd ? `${cd}초` : `마력석 ${c.mana} · 충전 ${c.charge}`}</small></button>`;
        })
        .join(
          "",
        )}<button data-action="magic:multi" ${m!.locked("multiball") || d.multi ? "disabled" : ""}>J 분열</button><button data-action="magic:storm" ${m!.locked("storm") || d.multi ? "disabled" : ""}>K STORM</button><button data-action="magic:panel">마법 관리 ⇥</button><button data-action="magic:steel">스틸 복귀</button></div><p class="${remaining && remaining <= 3 ? "magic-warning" : ""}">${b ? `${element(b.type).name} ${b.until ? Math.max(0, Math.ceil((b.until - this.game.time) / 1000)) + "초" : ""}` : ""} · ${this.game.physics.balls.length}개 공 ${remaining ? " · " + remaining.toFixed(1) + "초 남음" : ""} · 마력석 ${Math.floor(m!.economy.data.resources.mana)}</p>${this.training.scenario >= 0 ? `<p>훈련 ${this.training.scenario + 1} · ${MAGIC_LESSONS[this.training.scenario]} · ${this.training.complete ? "목표 달성" : "진행 중"}</p><button data-action="magic:exit">훈련 종료 · 원래 세션 복귀</button>` : ""}`,
    );
  }
  dispose() {
    this.abort.abort();
    this.training.exit();
  }
}
