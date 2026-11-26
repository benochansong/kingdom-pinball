import type { UIManager } from "./UIManager";
import type { GameStateManager } from "../core/GameStateManager";
import { BUILDINGS, buildingConfig } from "../config/buildings";
import {
  DEFAULT_WAR,
  DIFFICULTIES,
  ENEMIES,
  PHASE_NAMES,
  THREATS,
  WAR_ORDERS,
  WAR_COMBOS,
  WAR_TUTORIAL,
} from "../config/war";
import { RESOURCE_IDS, RESOURCES, type Cost } from "../config/economy";
import type { WarOptions, WarOrder, Lane, WarResult } from "../war/types";
const esc = (x: unknown) =>
  String(x).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const cost = (x: Cost) =>
  RESOURCE_IDS.filter((k) => x[k])
    .map((k) => `${RESOURCES[k].name} ${x[k]}`)
    .join(" · ") || "없음";
export class WarUI {
  private disposeState: () => void;
  private tab = "overview";
  private message = "";
  private last = "";
  constructor(
    private ui: UIManager,
    private game: GameStateManager,
  ) {
    ui.root
      .querySelector('[data-action="new-kingdom"]')!
      .insertAdjacentHTML(
        "beforebegin",
        '<button class="primary start-button" data-action="war:setup">왕국 전쟁 <small>KINGDOM WAR</small></button><button class="continue-button" data-action="war:continue">전쟁 이어하기 <small>CONTINUE WAR</small></button>',
      );
    ui.root
      .querySelector(".menu-links")!
      .insertAdjacentHTML(
        "beforeend",
        '<button data-action="war:history">전쟁 기록 <small>WAR RECORDS</small></button>',
      );
    ui.root.querySelector(".edition-note")!.innerHTML =
      "PHASE 05 <span>KINGDOM WAR</span>";
    ui.root.querySelector(".edition")!.innerHTML =
      "THE GREENWOOD CHRONICLES <span>·</span> CHAPTER V";
    ui.root
      .querySelector("#army-hud")!
      .insertAdjacentHTML(
        "afterend",
        '<section id="war-hud" class="war-only" aria-label="왕국 전쟁 상태"></section>',
      );
    ui.root.querySelector(".table-section")!.insertAdjacentHTML(
      "beforeend",
      `<nav class="war-only war-commands" aria-label="전쟁 지휘">${Object.entries(
        WAR_ORDERS,
      )
        .map(
          ([id, name]) =>
            `<button data-action="war:order:${id}">${name}</button>`,
        )
        .join(
          "",
        )}<button data-action="war:panel:repair">수리</button><button data-action="war:panel:build">빠른 건설</button><button data-action="war:panel:overview">전쟁 현황 V</button></nav>`,
    );
    ui.root
      .querySelector(".left-panel")!
      .insertAdjacentHTML(
        "afterbegin",
        '<section class="war-only" id="war-left"></section>',
      );
    ui.root
      .querySelector(".right-panel")!
      .insertAdjacentHTML(
        "afterbegin",
        '<section class="war-only" id="war-right"></section>',
      );
    const action = ui.onAction,
      render = ui.onRender;
    ui.onAction = (a) => this.action(a) || action?.(a) || false;
    ui.onRender = () => {
      render?.();
      this.render();
    };
    this.disposeState = game.events.on("state", ({ state }) => {
      if (game.war && state === "over") this.result(game.war.data.result!);
      this.render();
    });
  }
  handleKey(e: KeyboardEvent) {
    if (
      !this.game.war ||
      this.game.builder?.active ||
      this.ui.dialog.open ||
      (e.target as HTMLElement).matches("input,select,textarea")
    )
      return false;
    if (/^Digit[1-7]$/.test(e.code)) {
      e.preventDefault();
      if (!e.repeat)
        this.action(
          `war:order:${Object.keys(WAR_ORDERS)[Number(e.code.slice(-1)) - 1]}`,
        );
      return true;
    }
    if (e.code === "KeyV") {
      e.preventDefault();
      if (!e.repeat) this.action("war:panel:overview");
      return true;
    }
    return false;
  }
  private setup() {
    const o = DEFAULT_WAR;
    this.ui.open(
      "KINGDOM WAR · 전쟁 준비",
      `<p>발전 모드와 분리된 전쟁입니다. 양쪽은 같은 비용 규칙과 초기 자원을 사용합니다. 기본 병영 비용은 시작 자원에서 지불합니다.</p><label>왕국 이름<input id="war-name" maxlength="24" value="GREENWOOD"></label><div class="war-form"><label>문장<select id="war-crest"><option value="crown">왕관</option><option value="tree">나무</option><option value="shield">방패</option></select></label><label>상대 왕국<select id="war-enemy">${Object.entries(
        ENEMIES,
      )
        .map(([id, e]) => `<option value="${id}">${e.name}</option>`)
        .join(
          "",
        )}</select></label><label>난이도<select id="war-difficulty">${Object.entries(
        DIFFICULTIES,
      )
        .map(
          ([id, d]) =>
            `<option value="${id}" ${id === o.difficulty ? "selected" : ""}>${d.name} · AI ${Math.round(d.production * 100)}% · 준비 ${d.prep}초</option>`,
        )
        .join(
          "",
        )}</select></label><label>전쟁 유형<select id="war-type"><option value="conquest">STANDARD CONQUEST · 정복전</option><option value="defense">DEFEND THE THRONE · 15분 방어전</option><option value="siege">SIEGE CHALLENGE · 공성 도전</option></select></label><label>초기 자원<select id="war-resources"><option value="standard">표준</option><option value="scarce">75% 제한</option></select></label><label>준비 시간<select id="war-preparation"><option value="0">난이도 기본값</option><option value="180">180초</option><option value="120">120초</option><option value="60">60초</option></select></label><label>시간 제한<select id="war-limit"><option value="0">없음 (방어전은 15분)</option><option value="600">10분</option><option value="1200">20분</option><option value="1800">30분</option></select></label></div><label><input type="checkbox" id="war-tutorial" checked> 단계별 전쟁 안내</label>${Object.values(
        ENEMIES,
      )
        .map((e) => `<p class="tiny"><b>${e.name}</b> · ${e.description}</p>`)
        .join(
          "",
        )}<p>공성 도전은 양쪽 등급 5, 적 Lv.3 요새, 제한된 공성 부대로 시작합니다. 새 전쟁은 진행 중인 전쟁 저장을 교체합니다.</p><button class="primary" data-action="war:start">선택한 전쟁 시작</button><button data-action="war:quick">QUICK WAR · 기본 정복전</button><button data-action="close">취소</button>`,
    );
  }
  action(action: string): boolean {
    const w = this.game.war;
    if (w && action === "build:toggle" && !w.preparing) {
      this.tab = "build";
      this.panel();
      return true;
    }
    if (w && ["restart", "restart-confirm"].includes(action)) {
      this.setup();
      return true;
    }
    if (w && (action === "army:training" || action.startsWith("army:start"))) {
      this.ui.message("군사 훈련은 왕국 발전 모드에서 이용하세요.");
      return true;
    }
    if (
      w &&
      w.data.result &&
      ![
        "sound",
        "settings",
        "home",
        "home-confirm",
        "close",
        "start",
        "new-kingdom",
        "continue-kingdom",
      ].includes(action) &&
      !action.startsWith("war:")
    )
      return true;
    if (w && action.startsWith("army:command:")) {
      const c = action.split(":")[2];
      w.command(
        c === "attack" ? "frontline" : c === "retreat" ? "retreat" : "defend",
      );
      return true;
    }
    if (!action.startsWith("war:")) return false;
    const [, cmd, id, extra] = action.split(":");
    if (cmd === "setup") {
      this.setup();
      return true;
    }
    if (cmd === "start" || cmd === "quick") {
      const field = (id: string) =>
        (
          this.ui.dialog.querySelector(`#war-${id}`) as
            HTMLInputElement | HTMLSelectElement
        ).value;
      const o: Partial<WarOptions> =
        cmd === "quick"
          ? { ...DEFAULT_WAR }
          : {
              name: field("name"),
              crest: field("crest"),
              enemy: field("enemy") as WarOptions["enemy"],
              difficulty: field("difficulty") as WarOptions["difficulty"],
              type: field("type") as WarOptions["type"],
              resources: field("resources") as WarOptions["resources"],
              limit: Number(field("limit")),
              tutorial: (
                this.ui.dialog.querySelector(
                  "#war-tutorial",
                ) as HTMLInputElement
              ).checked,
            };
      o.preparation =
        cmd === "quick"
          ? 120
          : Number(field("preparation")) || DIFFICULTIES[o.difficulty!].prep;
      this.ui.close(false);
      this.game.startWar(o);
      return true;
    }
    if (cmd === "continue") {
      this.ui.close(false);
      if (!this.game.startWar())
        this.ui.open(
          "전쟁 저장 없음",
          '<p>저장된 전쟁이 없거나 읽을 수 없습니다.</p><button data-action="war:setup">새 전쟁</button>',
        );
      return true;
    }
    if (cmd === "history") {
      const rows = this.game.warSave.records();
      this.ui.open(
        "전쟁 기록과 업적",
        `${rows.map((r) => `<article class="war-card"><b>${esc(r.name)} · ${esc(r.outcome)} · ${esc(r.grade)}</b><p>${esc(r.difficulty)} · ${Math.round(r.seconds / 60)}분</p><small>${(r.achievements ?? []).map(esc).join(" · ")}</small></article>`).join("") || "<p>완료된 전쟁이 없습니다.</p>"}<button data-action="close">닫기</button>`,
      );
      return true;
    }
    if (!w || this.game.saveConflict) return true;
    if (
      w.data.result &&
      [
        "order",
        "lane",
        "repair",
        "build",
        "castle",
        "scout",
        "energy",
        "relaunch",
        "recover",
      ].includes(cmd)
    )
      return true;
    if (cmd === "panel") {
      this.tab = id;
      this.panel();
    }
    if (cmd === "order") {
      if (Object.hasOwn(WAR_ORDERS, id)) w.command(id as WarOrder);
    }
    if (cmd === "lane") {
      if (["left", "center", "right"].includes(id))
        w.command(w.data.order, id as Lane);
    }
    if (cmd === "repair") {
      this.message =
        w.repair(id, extra === "urgent") ?? "수리 등록 · 자원을 지불했습니다.";
      this.panel();
    }
    if (cmd === "castle") {
      this.message =
        w.upgradeCastle() ?? "왕궁 강화 완료 · 기존 체력 비율 유지";
      this.panel();
    }
    if (cmd === "scout") {
      const u = w.army.living.find(
        (u) => u.kind === "knight" || u.kind === "swordsman",
      );
      if (u) {
        w.command("frontline", w.data.lane);
        this.message =
          "정찰을 위해 전진합니다. 적 진영에 도달하면 정보를 갱신합니다.";
      } else this.message = "검병이나 기병을 먼저 생산하세요.";
      this.panel();
    }
    if (cmd === "build") {
      const read = (k: string) =>
        Number(
          (this.ui.dialog.querySelector(`#quick-${k}`) as HTMLInputElement)
            .value,
        );
      const type = (
        this.ui.dialog.querySelector("#quick-type") as HTMLSelectElement
      ).value;
      this.message =
        w.queueBuild("ally", type, { x: read("x"), y: read("y") }) ??
        "건설 등록 · 12초, 적군 접근 시 대기";
      this.panel();
    }
    if (cmd === "energy") {
      this.message = w.emergencyEnergy()
        ? "긴급 에너지 +20"
        : "긴급 충전 조건을 확인하세요.";
      this.ui.message(this.message);
    }
    if (cmd === "recover") {
      this.game.economy?.recoverEnergy(id as "gold" | "mana");
      this.game.checkpoint();
    }
    if (cmd === "relaunch") this.game.relaunch();
    if (cmd === "surrender")
      this.ui.open(
        "왕국을 항복할까요?",
        '<p>현재 전쟁은 패배로 기록됩니다.</p><button data-action="war:surrender-confirm">항복 확정</button><button data-action="close">계속 전투</button>',
      );
    if (cmd === "surrender-confirm") {
      this.ui.close(false);
      w.finish("defeat", "플레이어 항복");
    }
    if (cmd === "tutorial") {
      w.data.tutorialDone = id === "skip";
      w.checkpoint();
    }
    if (cmd === "menu") {
      this.ui.close(false);
      this.game.menu();
    }
    return true;
  }
  private panel() {
    const w = this.game.war!,
      d = w.data;
    let body = "";
    if (this.tab === "overview") {
      const intel = d.intel;
      body = `<p>${PHASE_NAMES[d.phase]} · ${Math.floor(w.now / 1000)}초 · ${w.finalOffensive ? "FINAL OFFENSIVE · 양쪽 공성 +20%, 왕궁 수리 감소" : ""}</p><p>${ENEMIES[d.options.enemy].description}</p><p>적 정보: ${intel ? `${Math.floor((w.now - intel.at) / 1000)}초 전 확인 · 당시 ${intel.count}기 / 군사력 ${intel.power} / 방어시설 ${intel.defenses}개` : "미확인 · 정찰이나 적 생산시설 타격으로 확인하세요."}</p><button data-action="war:scout">정찰 전진</button><p>공격로 ${(["left", "center", "right"] as const).map((l, i) => `<button data-action="war:lane:${l}" class="${d.lane === l ? "selected" : ""}">${["왼쪽", "중앙", "오른쪽"][i]}</button>`).join("")}</p><h3>전쟁 콤보 · 최대 3개 / 재사용 30초</h3>${WAR_COMBOS.map((c) => `<p><b>${c[1]}</b><br>${c[2]}</p>`).join("")}<button data-action="war:tutorial:replay">전쟁 안내 다시 보기</button><button data-action="war:surrender">항복</button>`;
    }
    if (this.tab === "repair")
      body = `<p>왕궁은 최대 체력의 20%까지만 수리하며 60초 재사용 제한이 있습니다. 공격받는 작업은 35% 속도로 진행합니다. 재건은 기본 건설비의 75%, 레벨은 유지됩니다.</p>${d.structures
        .filter((s) => s.side === "ally")
        .map(
          (s) =>
            `<article class="war-card"><b>${s.castle ? "왕궁" : buildingConfig(s.type)!.name} Lv.${s.level}</b><p>${Math.ceil(s.hp)} / ${s.maxHp} · ${cost(w.repairQuote(s.id))}</p><button data-action="war:repair:${s.id}" ${s.hp >= s.maxHp ? "disabled" : ""}>${s.hp ? "일반 수리" : "재건"}</button><button data-action="war:repair:${s.id}:urgent" ${s.hp >= s.maxHp ? "disabled" : ""}>긴급 · ${cost(w.repairQuote(s.id, true))}</button>${s.castle ? '<button data-action="war:castle">왕궁 강화</button>' : ""}</article>`,
        )
        .join("")}`;
    if (this.tab === "build")
      body = `<p>전시에는 하단 Y 400~690에서 12초 건설을 진행합니다. 적군 100px 이내, 다른 시설과 겹치는 위치는 금지됩니다. 준비 기간에는 B로 자유 배치할 수 있습니다.</p><label>건물<select id="quick-type">${BUILDINGS.filter(
        (b) => b.rank <= w.player.data.rank,
      )
        .map(
          (b) => `<option value="${b.id}">${b.name} · ${cost(b.cost)}</option>`,
        )
        .join(
          "",
        )}</select></label><div class="war-form"><label>X<input type="number" id="quick-x" value="300" min="70" max="510" step="10"></label><label>Y<input type="number" id="quick-y" value="510" min="400" max="690" step="10"></label></div><button class="primary" data-action="war:build">비용 지불 후 건설 등록</button>`;
    if (this.tab === "log")
      body = d.logs
        .map((l) => `<p>${Math.floor(l.time / 1000)}초 · ${esc(l.text)}</p>`)
        .join("");
    this.ui.open(
      "WAR COUNCIL · 전쟁 지휘소",
      `<nav class="army-tabs">${[
        ["overview", "전황·정찰"],
        ["repair", "수리·재건"],
        ["build", "빠른 건설"],
        ["log", "전투 기록"],
      ]
        .map(
          ([id, name]) =>
            `<button data-action="war:panel:${id}">${name}</button>`,
        )
        .join(
          "",
        )}</nav><p role="status">${esc(this.message)}</p>${body}<p>진행 작업: ${
        d.work
          .filter((x) => x.side === "ally")
          .map(
            (x) =>
              `${buildingConfig(x.type)!.name} ${Math.ceil(x.remaining)}초`,
          )
          .join(" · ") || "없음"
      }</p><button class="primary" data-action="close">지휘소 닫기 · 전쟁 재개</button>`,
    );
  }
  private result(r: WarResult) {
    if (!r) return;
    this.ui.close(false);
    this.ui.open(
      `${r.outcome.toUpperCase()} · 전쟁 성과 ${r.grade}`,
      `<p>${esc(r.name)} / ${ENEMIES[r.enemy].name} · ${r.difficulty} · ${r.type}</p><p>${esc(r.reason)} · ${Math.floor(r.seconds / 60)}분 ${r.seconds % 60}초</p><div class="results-grid"><div>아군 왕궁<b>${Math.ceil(r.castle)}</b></div><div>적 왕궁<b>${Math.ceil(r.enemyCastle)}</b></div><div>생산 / 생존 / 손실<b>${r.units} / ${r.survivors} / ${r.losses}</b></div><div>적 처치 / 건물 파괴<b>${r.stats.kills} / ${r.stats.destroyed}</b></div><div>스피어 병력 / 건물 피해<b>${Math.round(r.stats.sphereUnits)} / ${Math.round(r.stats.sphereBuildings)}</b></div><div>전쟁 콤보 / 연구<b>${r.stats.combos} / ${r.research}</b></div></div><p>생산 자원: ${cost(r.produced)}<br>소비 자원: ${cost(r.spent)}<br>수리 비용: ${cost(r.stats.repairs)}</p><p>건설 ${r.stats.built} · 강화 ${r.stats.upgrades} · 손실 시설 ${r.stats.lostBuildings} · 성벽 파괴 ${r.stats.walls}<br>유효 타격 ${r.hits} · 최대 콤보 ${r.combo} · 공 손실 ${r.lossesBall} · 평균 생존 ${r.survival.toFixed(1)}초<br>최대 군사력 ${r.stats.maxPower} · 발전 등급 ${r.rank} · 최종 전략 ${WAR_ORDERS[r.style as WarOrder] ?? esc(r.style)}</p><p>${r.achievements.map(esc).join(" · ") || "획득 업적 없음"}</p><button class="primary" data-action="war:setup">새로운 전쟁</button><button data-action="war:history">전쟁 기록</button><button data-action="war:menu">메인 메뉴</button>`,
    );
  }
  render() {
    const w = this.game.war;
    this.ui.root.classList.toggle("war-mode", !!w);
    const cont = this.ui.root.querySelector<HTMLButtonElement>(
      '[data-action="war:continue"]',
    )!;
    if (this.game.state === "menu") cont.hidden = !this.game.warSave.exists();
    if (!w) return;
    const d = w.data,
      ally = w.castle("ally"),
      enemy = w.castle("enemy");
    const key = JSON.stringify([
      d.id,
      Math.floor(w.now / 1000),
      ally.hp,
      enemy.hp,
      w.threat,
      this.game.state,
      d.order,
      d.lane,
      d.tutorial,
      d.tutorialDone,
      d.result,
    ]);
    if (key === this.last) return;
    this.last = key;
    const castle = (
      name: string,
      hp: number,
      max: number,
      side: "ally" | "enemy",
    ) =>
      `<div class="castle-meter ${side}"><span>${name} · 보호 ${Math.round(w.protection(side) * 100)}%</span><b>${Math.ceil(hp)} / ${max}</b><progress max="${max}" value="${hp}"></progress></div>`;
    this.ui.root.querySelector("#war-hud")!.innerHTML =
      `${castle(esc(d.options.name), ally.hp, ally.maxHp, "ally")}<div class="war-phase"><b>${PHASE_NAMES[d.phase]}</b><span>${w.preparing ? `보호 ${Math.ceil(d.options.preparation - w.now / 1000)}초` : THREATS[w.threat - 1]} · ${Math.floor(w.now / 60000)}:${String(Math.floor(w.now / 1000) % 60).padStart(2, "0")}</span></div>${castle(ENEMIES[d.options.enemy].name, enemy.hp, enemy.maxHp, "enemy")}${this.game.state === "relaunch" ? `<div class="war-mobile-energy"><span>공 손실 · 전투 계속</span><button data-action="war:relaunch" ${d.player.resources.energy < 20 ? "disabled" : ""}>20 에너지 재발사</button><button data-action="war:energy" ${d.emergencyCharges >= 2 ? "disabled" : ""}>긴급 충전 ${2 - d.emergencyCharges}</button><button data-action="war:recover:gold">금화 충전</button><button data-action="war:recover:mana">마력 충전</button></div>` : ""}`;
    this.ui.root.querySelector("#war-left")!.innerHTML =
      `<div class="section-heading">KINGDOM WAR</div><p>${WAR_ORDERS[d.order]} · ${d.lane}</p>${d.work
        .filter((w) => w.side === "ally")
        .map(
          (w) =>
            `<p>${buildingConfig(w.type)!.name} · ${Math.ceil(w.remaining)}초</p>`,
        )
        .join(
          "",
        )}<button data-action="war:panel:repair">왕국 수리</button><button data-action="war:panel:overview">전쟁 지휘소 V</button>${!d.tutorialDone ? `<aside class="army-help"><b>전쟁 안내 ${d.tutorial + 1}/9</b><p>${WAR_TUTORIAL[d.tutorial]}</p><button data-action="war:tutorial:skip">건너뛰기</button></aside>` : ""}`;
    this.ui.root.querySelector("#war-right")!.innerHTML =
      `<div class="section-heading">${THREATS[w.threat - 1]}</div><p>${d.ai.warningAt ? `침공까지 ${Math.max(0, Math.ceil((d.ai.warningAt - w.now) / 1000))}초 · ${d.ai.lane}` : `확인된 전장 적 ${w.activeEnemies.length}기`}</p><p>${d.intel ? `${Math.floor((w.now - d.intel.at) / 1000)}초 전 정찰 · 당시 ${d.intel.count}기` : "적 예비대 · 미확인"}</p>${d.ai.commanderId ? `<p>${ENEMIES[d.options.enemy].title}${d.ai.abilityWarning ? " · 능력 발동 경고" : ""}</p>` : ""}${Object.entries(
        d.buffs,
      )
        .filter(([, t]) => t > w.now)
        .map(([id, t]) => `<p>${id} · ${Math.ceil((t - w.now) / 1000)}초</p>`)
        .join(
          "",
        )}<button data-action="war:panel:log">전투 기록</button>${this.game.state === "relaunch" ? `<aside class="war-energy"><b>스피어 재발사 대기</b><p>전투는 계속됩니다. 손실 직후 3초 유예.</p><button data-action="war:relaunch" ${w.player.data.resources.energy < 20 ? "disabled" : ""}>에너지 20 재발사</button><button data-action="war:recover:gold">금화 30로 충전</button><button data-action="war:recover:mana">마력석 8로 충전</button><button data-action="war:energy" ${d.emergencyCharges >= 2 ? "disabled" : ""}>긴급 충전 ${2 - d.emergencyCharges}/2</button><button data-action="war:surrender">항복</button></aside>` : ""}`;
  }
  dispose() {
    this.disposeState();
  }
}
