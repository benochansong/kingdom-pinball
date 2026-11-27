import { GENERALS, EQUIPMENT } from "../config/campaignGrowth";
import { ELEMENTS } from "../config/magic";
import { sanitizeOptions } from "../modes/ModeSaveManager";
import {
  COSMETICS,
  COSMETIC_CATEGORIES,
  cosmeticColor,
} from "../config/profile";
import { PUZZLES } from "../config/puzzles";
import { ROGUE_UPGRADES, RELICS } from "../config/roguelike";
import { challenge } from "../modes/ChallengeManager";
import type { UIManager } from "./UIManager";
import type { GameModeManager } from "../modes/GameModeManager";
import type { ModeId, PhysicsSettings, SandboxSettings } from "../modes/types";
import {
  MODE_CATALOG,
  STARTS,
  MODE_REWARDS,
  defaultModeOptions,
  PHYSICS_LIMITS,
  RUSH_VARIANTS,
  WAR_VARIANTS,
} from "../config/modes";
import { REGIONS } from "../config/campaign";
import { UNITS } from "../config/army";
import { BUILDINGS } from "../config/buildings";
import { patchHTML } from "./patchHTML";
export const escapeHTML = (v: unknown) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const button = (a: string, text: string, cls = "") =>
  `<button class="${cls}" data-action="mode:${a}">${text}</button>`;
const select = (
  id: string,
  items: { id: string; name: string }[],
  value = "",
) =>
  `<select id="mode-${id}">${items.map((i) => `<option value="${escapeHTML(i.id)}" ${i.id === value ? "selected" : ""}>${escapeHTML(i.name)}</option>`).join("")}</select>`;
export class ModeUI {
  private hud: HTMLElement;
  private next = 0;
  private abort = new AbortController();
  private notified = "";
  constructor(
    readonly ui: UIManager,
    readonly manager: GameModeManager,
  ) {
    ui.root.querySelector(".edition-note")!.innerHTML =
      "PHASE 08 <span>ONE KINGDOM · ENDLESS PLAY</span>";
    ui.root.querySelector(".edition")!.textContent =
      "CHOOSE YOUR NEXT CHALLENGE";
    for (const action of ["campaign:new", "new-kingdom", "start"]) {
      const b = ui.root.querySelector<HTMLElement>(
        '[data-action="' + action + '"]',
      );
      if (b) b.hidden = true;
    }
    ui.root
      .querySelector(".menu-links")!
      .insertAdjacentHTML(
        "beforebegin",
        `<div class="mode-launch">${button("hub", "모드 선택 <small>GAME MODES</small>", "primary")}${button("setup:survival", "생존 · SURVIVAL")}${button("setup:sandbox", "샌드박스 · SANDBOX")}${button("profile", "내 프로필 · PROFILE")}</div>`,
      );
    ui.root
      .querySelector("#war-hud")!
      .insertAdjacentHTML(
        "afterend",
        '<section id="mode-hud" hidden aria-label="현재 게임 모드"></section>',
      );
    this.hud = ui.root.querySelector("#mode-hud")!;
    const action = ui.onAction,
      render = ui.onRender;
    ui.onAction = (a) => this.action(a) || action?.(a) || false;
    ui.onRender = () => {
      render?.();
      this.render();
    };
    manager.onChange = () => {
      this.render(true);
      this.notify();
    };
    ui.dialog.addEventListener(
      "change",
      (e) => {
        const t = e.target as HTMLInputElement;
        if (t.dataset.physics && manager.sandbox) {
          manager.sandbox.physics.set(
            t.dataset.physics as keyof PhysicsSettings,
            +t.value,
          );
          manager.persist();
        }
        if (t.dataset.sandbox && manager.sandbox) {
          const key = t.dataset.sandbox as keyof SandboxSettings;
          const candidate = structuredClone(manager.session.options);
          (candidate.sandbox as any)[key] =
            t.type === "checkbox" ? t.checked : +t.value;
          Object.assign(
            manager.sandbox.settings,
            sanitizeOptions(candidate).sandbox,
          );
          if (key === "rescueShots") {
            const d = manager.game.rescue;
            d.total = manager.sandbox.settings.rescueShots;
            d.used = Math.min(d.used, d.total);
            manager.game.checkpoint();
          }
          manager.sandbox.applyMagic();
          manager.persist();
        }
      },
      { signal: this.abort.signal },
    );
  }
  private value(id: string) {
    return (
      (this.ui.dialog.querySelector(`#mode-${id}`) as HTMLInputElement)
        ?.value ?? ""
    );
  }
  action(a: string) {
    if (
      this.manager.active &&
      this.manager.session.kind === "spectator" &&
      /^(war|army|build|magic|economy):/.test(a)
    ) {
      this.ui.message(
        "AI 관전 중입니다. 일시정지·속도·메뉴를 사용할 수 있습니다.",
        "gold",
      );
      return true;
    }
    if (!a.startsWith("mode:")) return false;
    const [, cmd, arg, extra] = a.split(":");
    const m = this.manager;
    switch (cmd) {
      case "hub":
        this.hub();
        break;
      case "setup":
        this.setup(arg as ModeId);
        break;
      case "start": {
        const o = defaultModeOptions();
        o.region = this.value("region") || o.region;
        o.difficulty = (this.value("difficulty") || o.difficulty) as any;
        o.start = (this.value("start") || o.start) as any;
        o.variant = this.value("variant") || "standard";
        o.preparation = +(this.value("preparation") || 60);
        o.seed = +(this.value("seed") || Date.now()) >>> 0;
        o.general = this.value("general") || "guardian";
        o.equipment = this.value("equipment");
        o.magic = [this.value("magic1"), this.value("magic2")].filter(Boolean);
        if (arg === "customWar" || arg === "spectator") {
          o.enemy = this.value("enemy") as any;
          o.allyFaction = this.value("allyFaction") as any;
          o.allyDifficulty = this.value("allyDifficulty") as any;
          o.warType = this.value("warType") as any;
          for (const key of [
            "castleLevel",
            "resources",
            "units",
            "population",
            "buildingLimit",
            "limit",
          ] as const)
            o[key] = +this.value(key);
          for (const key of [
            "magicEnabled",
            "multiEnabled",
            "stormEnabled",
          ] as const)
            o[key] = (
              this.ui.dialog.querySelector("#mode-" + key) as HTMLInputElement
            ).checked;
        }
        if (arg === "sandbox") {
          o.population = 100;
          o.buildingLimit = 30;
        }
        this.ui.close(false);
        m.start(arg as ModeId, o);
        break;
      }
      case "resume":
        this.ui.close(false);
        if (!m.resume(arg as ModeId))
          this.ui.open("저장 없음", "<p>이어 할 도전이 없습니다.</p>");
        break;
      case "next":
        m.survival?.startNext();
        break;
      case "rewards":
        this.notified = "";
        this.notify();
        break;
      case "reward":
        this.ui.close(false);
        m.chooseReward(arg);
        break;
      case "lab":
        this.sandbox();
        break;
      case "build":
        m.battle.build(this.value("building"), true);
        this.sandbox();
        break;
      case "spawn":
        m.sandbox?.spawn({
          side: this.value("side") as any,
          kind: this.value("unit") as any,
          count: +this.value("count"),
          rank: +this.value("rank"),
          research: +this.value("research"),
          formation: this.value("formation") as any,
        });
        this.sandbox();
        break;
      case "boss":
        m.battle.clearBoss();
        m.battle.summonBoss(this.value("boss"));
        this.ui.close();
        break;
      case "labLaunch":
        m.speed = 1;
        m.game.physics.spawn();
        this.ui.close();
        break;
      case "balls":
        m.sandbox?.physics.balls();
        this.ui.close();
        break;
      case "resetPhysics":
        m.sandbox?.physics.reset();
        this.sandbox();
        break;
      case "projectSave": {
        const slot = +this.value("slot"),
          name = this.value("name");
        if (m.saves.hasProject(slot))
          this.ui.open(
            "프로젝트 덮어쓰기",
            `<p>${slot + 1}번 프로젝트를 현재 상태로 바꿉니다.</p><input id="mode-name" value="${escapeHTML(name)}">${button(`overwrite:${slot}`, "덮어쓰기")}`,
          );
        else {
          const error = m.saveProject(slot, name);
          this.ui.message(error ?? "프로젝트를 저장했습니다.", "gold");
        }
        break;
      }
      case "overwrite":
        this.ui.message(
          m.saveProject(+arg, this.value("name"), true) ??
            "프로젝트를 저장했습니다.",
          "gold",
        );
        this.sandbox();
        break;
      case "projectLoad": {
        const slot = +this.value("slot");
        this.ui.close(false);
        if (!m.loadProject(slot))
          this.ui.open("빈 프로젝트", "저장한 프로젝트가 없습니다.");
        break;
      }
      case "leave":
        this.ui.close(false);
        m.leave();
        this.hub();
        break;
      case "end":
        this.ui.open(
          "도전 종료",
          `<p>현재 진행을 결과로 기록하고 종료합니다.</p>${button("confirmEnd", "도전 종료")}`,
        );
        break;
      case "confirmEnd":
        this.ui.close(false);
        m.abandon();
        break;
      case "history":
        this.history(arg as ModeId);
        break;
      case "profile":
        this.profile();
        break;
      case "profileSave":
        m.profile.name =
          this.value("profileName").replace(/[<>]/g, "").slice(0, 40) ||
          "ROYAL PIONEER";
        m.profile.crest = this.value("crest") || "♛";
        m.saves.saveProfile(m.profile);
        this.profile();
        break;
      case "equip": {
        const c = COSMETICS.find((c) => c.id === arg);
        if (c && m.profile.cosmetics.includes(c.id)) {
          m.profile.equipped[c.category] = c.id;
          m.saves.saveProfile(m.profile);
        }
        this.profile();
        break;
      }
      case "title":
        if (m.profile.titles.includes(decodeURIComponent(arg))) {
          m.profile.title = decodeURIComponent(arg);
          m.saves.saveProfile(m.profile);
          this.profile();
        }
        break;
      case "puzzles":
        this.puzzles();
        break;
      case "puzzle": {
        this.ui.close(false);
        const o = defaultModeOptions();
        o.puzzle = +arg;
        o.variant = "puzzle-" + arg;
        o.preparation = 0;
        o.magicEnabled = true;
        m.start("puzzle", o);
        break;
      }
      case "hint":
        this.ui.message(m.puzzle?.hint() ?? "", "gold");
        break;
      case "reflector":
        m.puzzle?.place(+arg);
        break;
      case "route":
        this.route();
        break;
      case "node":
        this.ui.close(false);
        m.rogue?.choose(arg);
        if (
          m.session.status === "playing" &&
          m.rogue?.current &&
          !["battle", "elite", "boss", "puzzle"].includes(m.rogue.current.kind)
        )
          this.route();
        break;
      case "event":
        this.ui.close(false);
        if (!m.rogue?.event(arg as any)) this.route();
        break;
      case "challenge": {
        const c = challenge(arg as "daily" | "weekly");
        this.ui.close(false);
        m.start(arg as ModeId, c.options);
        break;
      }
      case "speed":
        m.speed = +arg === 2 ? 2 : +arg === 4 ? 4 : 1;
        if (m.speed === 4 && m.sandbox) {
          m.game.magic?.endMulti();
          m.game.physics.removeBall();
          m.game.economy!.data.launchState = "ready";
        }
        if (m.sandbox) this.sandbox();
        break;
      default:
        void extra;
        return false;
    }
    return true;
  }
  hub() {
    const m = this.manager;
    this.ui.open(
      "ONE KINGDOM · ENDLESS PLAY",
      `<p>최근 모드 ${escapeHTML(m.profile.lastMode || "아직 없음")} · 추천 ${escapeHTML(
        MODE_CATALOG.find(
          (c) =>
            c.id ===
            Object.entries(m.profile.styles)
              .filter(([id]) => MODE_CATALOG.some((c) => c.id === id))
              .sort((a, b) => b[1] - a[1])[0]?.[0],
        )?.name ?? "SURVIVAL",
      )}</p><p>캠페인과 각 도전은 별도로 저장됩니다. 자유 실험은 경쟁 기록에 포함되지 않습니다.</p><div class="mode-grid">${MODE_CATALOG.map(
        (c, i) => {
          const saved =
              m.active && m.session.kind === c.id
                ? m.bucket
                : m.saves.load(c.id),
            resume =
              saved.session &&
              ["playing", "reward", "route"].includes(saved.session.status),
            record = saved.records[0];
          return `<article class="mode-card"><svg class="mode-art" viewBox="0 0 220 55" aria-hidden="true"><path d="M15 48H205M30 48V24h8V14h12v10h8V48M162 48V24h8V14h12v10h8V48" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="110" cy="28" r="${12 + (i % 3) * 3}" fill="none" stroke="currentColor"/><path d="m100 28 10-12 10 12-10 12Z" fill="currentColor" opacity=".45"/></svg><span class="eyebrow">${c.group}</span><h3>${c.crest} ${c.name}</h3><p>${c.description}</p><small>${c.minutes} · 난이도 ${c.difficulty}</small><p class="tiny">${record ? `최근 ${escapeHTML(record.grade)} · ${record.score.toLocaleString()}점` : "첫 기록에 도전하세요."}</p>${button(`setup:${c.id}`, "시작", "primary")}<button data-action="mode:resume:${c.id}" ${resume ? "" : 'disabled title="저장된 진행이 없습니다"'}>${resume ? "계속" : "저장 없음"}</button>${button(`history:${c.id}`, "기록")}</article>`;
        },
      ).join(
        "",
      )}</div><div class="mode-links"><button data-action="campaign:slots">캠페인 계속</button><button data-action="campaign:new">새 캠페인 / NG+</button><button data-action="new-kingdom">왕국 발전</button><button data-action="war:setup">왕국 전쟁</button><button data-action="start">클래식 핀볼</button><button data-action="tutorial">기본 훈련</button><button data-action="army:training">군사 훈련</button><button data-action="magic:training">마법 훈련</button>${button("profile", `프로필 · ${escapeHTML(m.profile.name)}`)}</div>`,
    );
  }
  setup(kind: ModeId) {
    if (kind === "customTable") {
      this.ui.action("creator:open");
      return;
    }
    if (kind === "puzzle") {
      this.puzzles();
      return;
    }
    if (kind === "daily" || kind === "weekly") {
      const c = challenge(kind);
      this.ui.open(
        kind === "daily" ? "DAILY CHALLENGE" : "WEEKLY CHALLENGE",
        `<p>${c.period} · 로컬 도전 · ${c.options.region}</p><h3>${c.description}</h3><p>제한 ${c.options.limit / 60}분 · 다음 갱신 ${c.next.toLocaleString()} (UTC 기준)</p>${button("challenge:" + kind, "도전 시작", "primary")}${button("resume:" + kind, "이어하기")}`,
      );
      return;
    }
    const c = MODE_CATALOG.find((c) => c.id === kind)!;
    this.ui.open(
      c.name,
      `<p>${c.description}</p><div class="mode-form"><label>지역 ${select("region", REGIONS)}</label><label>난이도 ${select(
        "difficulty",
        ["beginner", "normal", "hard", "expert", "legendary"].map((id) => ({
          id,
          name: id,
        })),
        "normal",
      )}</label><label>시작 왕국 ${select(
        "start",
        Object.entries(STARTS).map(([id, s]) => ({
          id,
          name: s.name + " · " + s.description,
        })),
      )}</label>${
        ["survival", "bossRush"].includes(kind)
          ? `<label>장군 ${select("general", GENERALS)}</label><label>장비 ${select("equipment", [{ id: "", name: "없음" }, ...EQUIPMENT])}</label><label>특수 공 1 ${select(
              "magic1",
              ELEMENTS.filter((e) => e.id !== "steel"),
              "fire",
            )}</label><label>특수 공 2 ${select(
              "magic2",
              ELEMENTS.filter((e) => e.id !== "steel"),
              "ice",
            )}</label>`
          : ""
      }<label>준비 시간 (초)<input id="mode-preparation" type="number" min="0" max="300" value="60"></label><label>SEED <input id="mode-seed" type="number" value="${Date.now() >>> 0}"></label>${["customWar", "spectator"].includes(kind) ? this.warForm() : ""}${
        kind === "bossRush"
          ? `<label>도전 유형 ${select(
              "variant",
              RUSH_VARIANTS.map((id) => ({ id, name: id })),
            )}</label>`
          : ""
      }</div>${button(`start:${kind}`, "새로운 도전 시작", "primary")}${button(`resume:${kind}`, "이전 도전 계속")}`,
    );
  }
  private warForm() {
    return `<label>규칙 변형 ${select(
      "variant",
      WAR_VARIANTS.map((id) => ({ id, name: id })),
    )}</label><label>적 진영 ${select(
      "enemy",
      ["iron", "crimson", "golden", "arcane", "shadow"].map((id) => ({
        id,
        name: id,
      })),
      "crimson",
    )}</label><label>아군 AI 진영 ${select(
      "allyFaction",
      ["iron", "crimson", "golden", "arcane", "shadow"].map((id) => ({
        id,
        name: id,
      })),
    )}</label><label>아군 AI 난이도 ${select(
      "allyDifficulty",
      ["beginner", "normal", "hard", "expert", "legendary"].map((id) => ({
        id,
        name: id,
      })),
      "normal",
    )}</label><label>승리 규칙 ${select(
      "warType",
      ["conquest", "defense", "siege"].map((id) => ({ id, name: id })),
    )}</label>${[
      ["castleLevel", 2, 1, 5],
      ["resources", 300, 0, 4000],
      ["units", 3, 0, 100],
      ["population", 60, 10, 100],
      ["buildingLimit", 20, 1, 30],
      ["limit", 900, 60, 3600],
    ]
      .map(
        ([key, value, min, max]) =>
          `<label>${key}<input id="mode-${key}" type="number" min="${min}" max="${max}" value="${value}"></label>`,
      )
      .join(
        "",
      )}${["magicEnabled", "multiEnabled", "stormEnabled"].map((key) => `<label>${key}<input id="mode-${key}" type="checkbox" checked></label>`).join("")}`;
  }
  private notify() {
    const m = this.manager,
      s = m.session;
    if (!m.active || !s || s.status === "playing") return;
    const key = s.id + s.status + s.rewardId + s.node;
    if (key === this.notified) return;
    this.notified = key;
    if (s.status === "reward")
      this.ui.open(
        "CHOOSE YOUR REWARD",
        `<p>선택 중에는 시간이 멈춥니다. 한 가지 보상만 받을 수 있습니다.</p><div class="mode-grid">${s.rewards
          .map((id) => {
            const r = [...MODE_REWARDS, ...ROGUE_UPGRADES, ...RELICS].find(
              (x) => x.id === id,
            )!;
            return `<article class="mode-card"><h3>${r.name}</h3><p>${r.description}</p>${button(`reward:${id}`, "선택", "primary")}</article>`;
          })
          .join("")}</div>`,
        false,
      );
    else if (s.status === "route") this.route();
    else
      this.ui.open(
        s.status === "complete" ? "VICTORY" : "RUN COMPLETE",
        `<p>${escapeHTML(s.reason)}</p><div class="results-grid"><div>시간<b>${Math.floor(s.time / 1000)}s</b></div><div>웨이브<b>${s.wave.number}</b></div><div>보스<b>${s.stats.bosses}</b></div><div>처치<b>${s.stats.kills}</b></div><div>최대 군사력<b>${Math.round(s.stats.maxPower)}</b></div><div>왕궁 피해<b>${Math.round(s.stats.damage)}</b></div></div>${button(`history:${s.kind}`, "기록 보기")}${button("leave", "모드 선택")}`,
        false,
      );
  }
  render(force = false) {
    const m = this.manager;
    this.hud.hidden = !m.active;
    if (!m.active) return;
    if (!force && performance.now() < this.next) return;
    this.next = performance.now() + 200;
    const s = m.session;
    patchHTML(
      this.hud,
      `<b>${escapeHTML(s.name)}</b>${m.saves.lastError ? `<small role="status">${escapeHTML(m.saves.lastError)}</small>` : ""}${s.status === "reward" ? button("rewards", "보상 선택") : ""}<span>${Math.floor(s.time / 60000)}:${String(Math.floor(s.time / 1000) % 60).padStart(2, "0")} · ${escapeHTML(s.options.region)}</span>${s.kind === "survival" ? `<strong>WAVE ${s.wave.number} · ${s.wave.phase === "preparation" ? `다음까지 ${Math.max(0, Math.ceil((s.wave.readyAt - m.game.time) / 1000))}초` : s.wave.phase === "reward" ? "보상 선택" : `남은 병력 ${m.game.war!.enemyArmy.living.length + s.wave.pending.length}`}</strong>${s.wave.phase === "preparation" ? button("next", "지금 시작") : ""}` : ""}${s.kind === "bossRush" ? `<strong>BOSS ${Math.min(8, s.bossIndex + 1)} / 8</strong>` : ""}${s.kind === "customTable" ? `<strong>${Math.floor(s.flags.progress ?? 0)}/${s.goal}</strong><button data-action="creator:open">테이블 편집</button>` : ""}${s.kind === "puzzle" ? `<strong>${s.flags.progress ?? 0}/${s.goal} · ${m.puzzle!.board.definition.seconds - Math.floor(s.time / 1000)}초 · 공 ${s.stats.balls}/${m.puzzle!.board.definition.balls}</strong>${button("hint", "힌트")}${button("puzzle:" + s.options.puzzle, "초기화")}${m.puzzle!.board.definition.kind === "builder" ? [-30, 0, 30].map((a) => button("reflector:" + a, "반사판 " + a + "°")).join("") : ""}` : ""}${s.kind === "spectator" ? `<strong>아군 ${m.game.war!.army.living.length} · 적군 ${m.game.war!.enemyArmy.living.length} · ${m.speed}×</strong>${button("speed:1", "1×")}${button("speed:2", "2×")}${button("speed:4", "4×")}` : ""}${s.kind === "roguelike" ? button("route", "원정 경로") : ""}${["daily", "weekly"].includes(s.kind) ? `<strong>${escapeHTML(s.reason)} · ${Math.floor(s.flags.progress ?? 0)}/${s.goal}</strong>` : ""}${s.kind === "sandbox" ? button("lab", "실험실 설정") : button("end", "도전 종료")}${button("leave", "저장 후 메뉴")}`,
    );
    this.notify();
  }
  sandbox() {
    const m = this.manager;
    if (!m.sandbox) return;
    const s = m.session.options.sandbox,
      p = m.session.options.physics;
    this.ui.open(
      "SANDBOX LAB",
      `<p>자유 실험 · 기록/성장 보상 없음 · 시뮬레이션 속도 ${m.speed}× · 4×는 공을 제거한 군사 실험용입니다.</p><details open><summary>건설 · 부대 · 보스</summary><div class="mode-form"><label>시설 ${select(
        "building",
        BUILDINGS.map((b) => ({ id: b.id, name: b.name })),
      )}</label>${button("build", "무료 건설")}<label>진영 ${select("side", [
        { id: "ally", name: "아군" },
        { id: "enemy", name: "적군" },
      ])}</label><label>병종 ${select("unit", UNITS)}</label><label>수량<input id="mode-count" type="number" min="1" max="60" value="10"></label><label>등급<input id="mode-rank" type="number" min="1" max="5" value="1"></label><label>연구<input id="mode-research" type="number" min="0" max="5" value="0"></label><label>진형 ${select(
        "formation",
        ["standard", "shield", "spear", "assault", "ranged", "siege"].map(
          (id) => ({ id, name: id }),
        ),
      )}</label>${button("spawn", "부대 생성")}<label>보스 ${select(
        "boss",
        REGIONS.map((r) => ({ id: r.id, name: r.boss })),
      )}</label>${button("boss", "보스 소환")}</div></details><details><summary>경제 · 전투 규칙</summary><div class="mode-form">${Object.entries(
        s,
      )
        .map(
          ([key, value]) =>
            `<label>${key}<input data-sandbox="${key}" ${typeof value === "boolean" ? `type="checkbox" ${value ? "checked" : ""}` : `type="number" min="${key === "rescueShots" ? 0 : key === "population" ? 10 : key === "cost" ? 0 : 0.25}" max="${key === "rescueShots" ? 10 : key === "population" ? 100 : key === "production" ? 3 : key === "cost" ? 2 : 4}" step="${key === "population" || key === "rescueShots" ? 1 : 0.25}" value="${value}"`}></label>`,
        )
        .join(
          "",
        )}</div></details><details><summary>물리 설정 · 안전 범위 적용</summary><div class="mode-form">${Object.entries(
        PHYSICS_LIMITS,
      )
        .map(
          ([key, [min, max]]) =>
            `<label>${key}<input data-physics="${key}" type="number" min="${min}" max="${max}" step="${key === "wind" ? 0.00001 : key === "balls" || key === "maxSpeed" ? 1 : 0.05}" value="${p[key as keyof PhysicsSettings]}"></label>`,
        )
        .join(
          "",
        )}</div>${button("balls", "발사한 공 개수 적용")}${button("labLaunch", "공 준비 · 1× 복귀")}${button("resetPhysics", "물리 초기화")}</details><details><summary>프로젝트 · 10개 로컬 슬롯</summary><label>슬롯 ${select(
        "slot",
        Array.from({ length: 10 }, (_, i) => ({
          id: String(i),
          name: `${i + 1} · ${m.saves.hasProject(i) ? "저장됨" : "비어 있음"}`,
        })),
      )}</label><input id="mode-name" maxlength="40" placeholder="프로젝트 이름" value="MY KINGDOM">${button("projectSave", "저장")}${button("projectLoad", "불러오기")}</details><p>속도: ${button("speed:1", "1×")}${button("speed:2", "2×")}${button("speed:4", "4×")}</p>`,
    );
  }
  puzzles() {
    const records =
      this.manager.session?.kind === "puzzle"
        ? this.manager.bucket.records
        : this.manager.saves.load("puzzle").records;
    this.ui.open(
      "PINBALL PUZZLES",
      `<p>30개의 독립 퍼즐 · 3단계 힌트 · 실제 타격과 제한된 공으로 해결하세요.</p><div class="mode-grid">${PUZZLES.map((p) => `<article class="mode-card"><small>${p.tier} · ${p.kind}</small><h3>${p.id + 1}. ${p.name}</h3><p>${p.seconds}초 · 공 ${p.balls}개 · 목표 ${p.hits}회</p>${button("puzzle:" + p.id, "도전", "primary")}<small>완료 기록 ${records.filter((r) => r.variant === "puzzle-" + p.id && r.won).length}회</small></article>`).join("")}</div>`,
    );
  }
  route() {
    const r = this.manager.rogue;
    if (!r) return;
    const n = r.current;
    if (
      n &&
      !n.complete &&
      !["battle", "elite", "boss", "puzzle"].includes(n.kind)
    ) {
      const text =
        n.kind === "resource"
          ? "자원 보급: 목재100/석재80/금화100/식량120"
          : n.kind === "market"
            ? "금화120 지불 → 목재100/석재80/식량100/마력20 (Merchant Seal 25% 할인)"
            : n.kind === "repair"
              ? "왕궁 최대 체력 35% 복구"
              : n.kind === "shrine"
                ? "왕궁 최대 체력 15% 희생 → 유물 선택"
                : "유물 보물함";
      this.ui.open(
        "EXPEDITION EVENT",
        `<h3>${n.kind.toUpperCase()}</h3><p>${text}</p>${button("event:accept", "받기", "primary")}${button("event:skip", "지나가기")}`,
      );
      return;
    }
    this.ui.open(
      "ROGUELIKE · THREE ACTS",
      `<p>현재 경로에 연결된 노드만 선택할 수 있습니다. 강화와 유물은 이번 원정에만 적용됩니다.</p><p>강화 ${
        Object.entries(r.s.upgrades)
          .map(([id, n]) => escapeHTML(id) + " ×" + n)
          .join(" · ") || "없음"
      }<br>유물 ${r.s.relics.map(escapeHTML).join(" · ") || "없음"}</p><div class="mode-grid">${r.s.nodes.map((x) => `<article class="mode-card"><small>ACT ${x.act} · ${x.row + 1}</small><b>${x.kind.toUpperCase()} · ${escapeHTML(x.region)}</b><p>${x.risk === "elite" ? "위험: 적 병력 증가 · 아군 받는 피해 +15%" : x.risk === "cursed" ? "저주: 생산 −20% · 왕궁 희생 선택" : "안전 경로"}</p>${x.complete ? "✓ 완료" : r.available.includes(x.id) ? button("node:" + x.id, "진행", "primary") : "잠김"}</article>`).join("")}</div>`,
      r.s.status !== "route",
    );
  }
  history(kind: ModeId) {
    const records =
      this.manager.session?.kind === kind
        ? this.manager.bucket.records
        : this.manager.saves.load(kind).records;
    this.ui.open(
      "LOCAL RECORDS",
      `<p>브라우저 로컬 기록 · ${escapeHTML(kind)} · 조건이 다른 기록은 합산하지 않습니다.</p>${
        records
          .slice()
          .reverse()
          .map(
            (r) =>
              `<article class="mode-card"><b>${escapeHTML(r.grade)} ${r.won ? "완료" : "종료"}</b><p>${escapeHTML(r.region)} · ${escapeHTML(r.difficulty)} · ${escapeHTML(r.variant)}<br>웨이브 ${r.wave} · 보스 ${r.bosses} · ${r.seconds}s · ${r.score.toLocaleString()}점</p><small>${escapeHTML(r.at.slice(0, 10))} · ${r.competitive ? "도전 기록" : "자유 규칙"}</small></article>`,
          )
          .join("") || "<p>아직 기록이 없습니다.</p>"
      }${button("hub", "모드 선택")}`,
    );
  }
  profile() {
    const p = this.manager.profile;
    this.ui.root.style.setProperty(
      "--profile-border",
      "#" + cosmeticColor(p.equipped, "border").toString(16).padStart(6, "0"),
    );
    this.ui.root.style.setProperty(
      "--profile-result",
      "#" + cosmeticColor(p.equipped, "result").toString(16).padStart(6, "0"),
    );
    this.ui.open(
      "ROYAL PROFILE",
      `<h3>${escapeHTML(p.crest)} ${escapeHTML(p.name)}</h3><p>${escapeHTML(p.title)} · 완료한 도전 ${p.runs}회 · ${Math.floor(p.seconds / 60)}분</p><label>프로필 이름<input id="mode-profileName" maxlength="40" value="${escapeHTML(p.name)}"></label><label>문장 ${select(
        "crest",
        ["♛", "⚑", "✦", "◇"].map((id) => ({ id, name: id })),
        p.crest,
      )}</label>${button("profileSave", "프로필 저장")}<h4>칭호</h4>${p.titles.map((t) => button(`title:${encodeURIComponent(t)}`, escapeHTML(t))).join("")}<h4>달성한 업적</h4><p>${p.achievements.map(escapeHTML).join(" · ") || "도전을 완료해 첫 업적을 획득하세요."}</p><h4>외형 · 능력치 변화 없음</h4>${COSMETIC_CATEGORIES.map(
        (cat) =>
          `<details><summary>${cat}</summary>${COSMETICS.filter(
            (c) => c.category === cat,
          )
            .map((c) =>
              p.cosmetics.includes(c.id)
                ? button(
                    "equip:" + c.id,
                    (p.equipped[cat] === c.id ? "✓ " : "") + c.name,
                  )
                : `<span>🔒 ${c.name} · 업적 ${c.required}개 </span>`,
            )
            .join("")}</details>`,
      ).join("")}${button("hub", "모드 선택")}`,
    );
  }
  dispose() {
    this.abort.abort();
    this.hud.remove();
  }
}
