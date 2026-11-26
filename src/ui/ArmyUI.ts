import type { UIManager } from "./UIManager";
import type { GameStateManager } from "../core/GameStateManager";
import {
  UNITS,
  unitConfig,
  COMMANDS,
  FORMATIONS,
  RESEARCH,
  researchCost,
  TRAININGS,
  MILITARY_COMBOS,
  ARMY_TUTORIAL,
} from "../config/army";
import { buildingConfig } from "../config/buildings";
import { RESOURCE_IDS, RESOURCES, type Cost } from "../config/economy";
import type { UnitKind, Command, Formation, BattleRecord } from "../army/types";
import { maxHp, attackPower } from "../army/DamageCalculator";
const costText = (cost: Cost) =>
  RESOURCE_IDS.filter((r) => cost[r])
    .map((r) => `${RESOURCES[r].name} ${cost[r]}`)
    .join(" · ") || "없음";
export class ArmyUI {
  private abort = new AbortController();
  private disposeResult: () => void;
  private tab = "production";
  private feedback = "";
  private quantity: number | "max" = 1;
  private last = "";
  constructor(
    private ui: UIManager,
    private game: GameStateManager,
  ) {
    ui.root
      .querySelector(".resource-hud")!
      .insertAdjacentHTML(
        "afterend",
        '<section id="army-hud" class="economy-only army-hud" aria-label="군대 상태"></section>',
      );
    ui.root.querySelector(".table-section")!.insertAdjacentHTML(
      "beforeend",
      `<nav class="army-commands economy-only" aria-label="군대 지휘">${Object.entries(
        COMMANDS,
      )
        .map(
          ([id, name], i) =>
            `<button data-action="army:command:${id}" title="${i + 1}">${i + 1} ${name}</button>`,
        )
        .join(
          "",
        )}<button data-action="army:formation">F 진형</button><button data-action="army:open">U 군대</button></nav>`,
    );
    ui.root
      .querySelector(".economy-nav")!
      .insertAdjacentHTML(
        "beforeend",
        '<button data-action="army:training">군사 훈련<small>TRAINING</small></button>',
      );
    ui.root
      .querySelector("#economy-left")!
      .insertAdjacentHTML(
        "afterend",
        '<section id="army-production-summary" class="economy-only"></section>',
      );
    ui.root
      .querySelector("#economy-right")!
      .insertAdjacentHTML(
        "afterend",
        '<section id="army-battle-summary" class="economy-only"></section>',
      );
    const action = ui.onAction,
      render = ui.onRender;
    ui.onAction = (a) => this.action(a) || action?.(a) || false;
    ui.onRender = () => {
      render?.();
      this.render();
    };
    this.disposeResult = game.events.on("battleResult", (r) => this.result(r));
    ui.root.addEventListener(
      "change",
      (e) => {
        const input = e.target as HTMLSelectElement;
        if (input.id === "army-formation") {
          game.army?.formation(input.value as Formation);
          this.panel();
        }
      },
      { signal: this.abort.signal },
    );
  }
  handleKey(e: KeyboardEvent): boolean {
    if (
      this.game.mode !== "kingdom" ||
      this.game.builder?.active ||
      this.ui.dialog.open ||
      (e.target as HTMLElement).matches("input,select,textarea")
    )
      return false;
    let action: string | undefined;
    if (/^Digit[1-5]$/.test(e.code))
      action = `army:command:${Object.keys(COMMANDS)[Number(e.code.slice(-1)) - 1]}`;
    if (e.code === "KeyU") action = "army:open";
    if (e.code === "KeyF") action = "army:formation";
    if (!action) return false;
    e.preventDefault();
    if (!e.repeat) this.action(action);
    return true;
  }
  action(action: string): boolean {
    if (!action.startsWith("army:")) return false;
    const a = this.game.army;
    if (!a || this.game.saveConflict) return true;
    if (this.game.builder?.active) {
      this.ui.message("건설을 완료한 뒤 군대를 관리하세요.");
      return true;
    }
    const [, cmd, id, extra] = action.split(":");
    if (cmd === "command") {
      if (Object.hasOwn(COMMANDS, id)) {
        a.command(id as Command);
        this.ui.message(`군대 명령 · ${COMMANDS[id as Command]}`);
      }
      return true;
    }
    if (cmd === "open") {
      this.tab = "production";
      this.panel();
    }
    if (cmd === "formation") {
      this.tab = "roster";
      this.panel();
    }
    if (cmd === "training") {
      this.tab = "training";
      this.panel();
    }
    if (cmd === "tab") {
      this.tab = id;
      this.panel();
    }
    if (cmd === "quantity") {
      this.quantity = id === "max" ? "max" : id === "5" ? 5 : 1;
      this.panel();
    }
    if (cmd === "produce") {
      const n = a.enqueue(id, extra as UnitKind, this.quantity);
      this.feedback = n
        ? `${n}기 훈련 등록 · 비용 지불 완료`
        : "자원·식량·인구수·시설 레벨·대기열 제한을 확인하세요.";
      this.panel();
    }
    if (cmd === "cancel") {
      this.feedback = a.cancel(id, extra)
        ? "미진행 비용의 50%를 환급했습니다."
        : "이미 처리된 훈련입니다.";
      this.panel();
    }
    if (cmd === "up") {
      a.reorder(id, extra);
      this.panel();
    }
    if (cmd === "auto") {
      const q = a.queueFor(id);
      a.auto(id, q.auto === extra ? undefined : (extra as UnitKind));
      this.panel();
    }
    if (cmd === "research") {
      this.feedback = a.startResearch(id)
        ? "연구 시작 · 시설 타격으로 가속할 수 있습니다."
        : "연구 시설·왕국 등급·비용·현재 연구를 확인하세요.";
      this.panel();
    }
    if (cmd === "confirm") {
      const i = Number(id),
        t = TRAININGS[i];
      if (!t) return true;
      this.ui.open(
        "실제 군사 도전",
        `<p><strong>${t.name}</strong></p><p>실제 병력이 사망할 수 있고 식량 유지비가 소비됩니다. 전투 상태는 저장되며 새로고침해도 손실이 복원되지 않습니다.</p><p>최초 승리 보상: ${costText(t.reward)}. 경험치는 시나리오별 첫 도전에서만, 병사당 최대 100까지 획득합니다.</p><button class="primary" data-action="army:start:${i}:challenge">손실 가능성을 이해하고 도전</button><button data-action="army:training">취소</button>`,
      );
    }
    if (cmd === "start") {
      this.ui.close(false);
      const error = this.game.startTraining(Number(id), extra === "practice");
      if (error) {
        this.feedback = error;
        this.tab = "training";
        this.panel();
      } else {
        this.ui.message(
          extra === "practice"
            ? "연습 전투 · 실제 왕국은 보존됩니다."
            : "군사 도전 · 실제 병력 손실이 적용됩니다.",
        );
      }
    }
    if (cmd === "abort") a.finish("aborted");
    if (cmd === "return") {
      this.ui.close(false);
      this.game.resume();
    }
    if (cmd === "retry") {
      const r = this.game.lastBattleResult;
      if (r)
        this.action(
          r.mode === "practice"
            ? `army:start:${r.scenario}:practice`
            : `army:confirm:${r.scenario}`,
        );
    }
    if (cmd === "detail") {
      const u = a.data.units.find((u) => u.id === id);
      if (u) {
        const c = unitConfig(u.kind);
        this.ui.open(
          `${c.name} · ${u.id}`,
          `<p>RANK ${u.rank} · 경험치 ${Math.floor(u.xp)}<br>체력 ${Math.ceil(u.hp)} / ${maxHp(u)}<br>현재 공격력 ${attackPower(u, a.data, this.game.time).toFixed(1)} · 방어 ${c.armor + (a.data.research.armor ?? 0) * 3}<br>이동 ${c.speed}/초 · 사거리 ${c.range} · 인구 ${c.population}</p><p>${c.description}</p><p>피해 기여 ${Math.round(u.damage)} · 회복 ${Math.round(u.healing)}</p><button data-action="army:tab:roster">부대로 돌아가기</button>`,
        );
      }
    }
    if (cmd === "claim") {
      a.claim(id);
      this.panel();
    }
    if (cmd === "tutorial") {
      a.data.tutorial = 0;
      a.data.tutorialDone = false;
      a.checkpoint();
    }
    if (cmd === "skip") {
      a.data.tutorialDone = true;
      a.checkpoint();
    }
    return true;
  }
  private panel() {
    const a = this.game.army!;
    const tabs = [
      ["production", "병력 생산"],
      ["roster", "군대 편성"],
      ["research", "연구"],
      ["training", "군사 훈련"],
      ["objectives", "목표·콤보"],
    ];
    let body = "";
    if (this.tab === "production")
      body = `<div class="army-tabs">${[1, 5, "max"].map((n) => `<button data-action="army:quantity:${n}" class="${this.quantity === n ? "selected" : ""}">${n === "max" ? "최대" : `${n}기`}</button>`).join("")}</div>${!a.buildings.some((b) => UNITS.some((u) => u.building === b.type)) ? '<p class="army-help">B 건설 모드에서 병영을 지으세요. 병영 비용은 목재 100 · 석재 80 · 금화 100입니다. 타격만으로 무료 병력이 생성되지는 않습니다.</p>' : ""}${a.buildings
        .filter((b) => UNITS.some((u) => u.building === b.type))
        .map((b) => {
          const q = a.queueFor(b.id);
          return `<article class="army-facility"><h3>${buildingConfig(b.type)!.name} Lv.${b.level} <small>${b.id} · ${q.entries.length}기 대기</small></h3>${UNITS.filter(
            (u) => u.building === b.type,
          )
            .map((c) => {
              const lock = a.unlock(c.id, b);
              return `<div class="unit-card"><span class="unit-icon">${c.icon}</span><div><b>${c.name}</b><p>${c.description}</p><small>${costText(c.cost)} · ${c.seconds}초 · 인구 ${c.population}</small>${lock ? `<small>🔒 ${lock}</small>` : ""}</div><button data-action="army:produce:${b.id}:${c.id}" ${lock ? "disabled" : ""}>훈련</button><button data-action="army:auto:${b.id}:${c.id}" ${lock ? "disabled" : ""}>자동 ${q.auto === c.id ? "켜짐" : "꺼짐"}</button></div>`;
            })
            .join(
              "",
            )}<ol>${q.entries.map((e, i) => `<li><b>${unitConfig(e.kind).name}</b> ${Math.floor(e.progress * 100)}% <progress max="1" value="${e.progress}"></progress><button data-action="army:up:${b.id}:${e.id}" ${i === 0 ? "disabled" : ""}>앞으로</button><button data-action="army:cancel:${b.id}:${e.id}">취소</button></li>`).join("")}</ol></article>`;
        })
        .join(
          "",
        )}<p class="muted">관리 창에서는 훈련·물리·전투·식량 시간이 모두 멈춥니다. 닫으면 훈련이 진행됩니다. 취소 환급: 미진행 비용의 50%.</p>`;
    if (this.tab === "roster")
      body = `<label>군대 진형<select id="army-formation">${Object.entries(
        FORMATIONS,
      )
        .map(
          ([id, f]) =>
            `<option value="${id}" ${a.data.formation === id ? "selected" : ""} ${a.economy.data.rank < f.rank ? "disabled" : ""}>${f.name} · 등급 ${f.rank}</option>`,
        )
        .join(
          "",
        )}</select></label><p>${FORMATIONS[a.data.formation].description}</p><p>인구 ${a.population} + 예약 ${a.reserved} / ${a.capacity} · 식량 유지비 ${a.upkeep}/30초 · 사기 ${Math.floor(a.data.morale)}</p>${UNITS.map(
        (c) => {
          const units = a.living.filter((u) => u.kind === c.id);
          return `<details ${units.length ? "open" : ""}><summary>${c.icon} ${c.name} ${units.length}기 · 체력 ${c.hp} · 공격 ${c.attack} · 방어 ${c.armor}</summary><p>${c.description}</p><div class="army-unit-list">${units.map((u) => `<button data-action="army:detail:${u.id}">${u.id} · R${u.rank} · HP ${Math.ceil(u.hp)}/${maxHp(u)}</button>`).join("")}</div></details>`;
        },
      ).join("")}`;
    if (this.tab === "research")
      body = `${a.data.researchTask ? `<p>현재 연구: ${RESEARCH.find((r) => r.id === a.data.researchTask!.id)?.name} · ${Math.floor(a.data.researchTask.progress * 100)}%</p>` : ""}${RESEARCH.map(
        (r) => {
          const level = a.data.research[r.id] ?? 0;
          return `<article class="army-facility"><h3>${r.name} ${level}/3</h3><p>${r.description}</p><small>${buildingConfig(r.building)!.name} · 왕국 등급 ${r.rank} · ${level < 3 ? costText(researchCost(level + 1)) : "최대 단계"}</small><button data-action="army:research:${r.id}" ${level >= 3 || a.data.researchTask ? "disabled" : ""}>연구 시작</button></article>`;
        },
      ).join("")}`;
    if (this.tab === "training")
      body = `<p><strong>연습</strong>은 현재 군대와 왕국의 복사본을 사용합니다. 실제 손실·소비·경험치·보상은 없습니다. <strong>군사 도전</strong>은 실제 상태에 적용됩니다. 각 전투는 최대 4분입니다.</p>${
        a.data.battle
          ? `<p>현재 ${TRAININGS[a.data.battle.scenario].name} 진행 중</p><button data-action="army:abort">${a.data.battle.mode === "practice" ? "연습 종료 · 실제 왕국 복원" : "훈련 종료 · 현재 손실 유지"}</button>`
          : TRAININGS.map(
              (t, i) =>
                `<article class="army-facility"><h3>${i + 1}. ${t.name} ${a.data.completed.includes(i) ? "✓" : ""}</h3><p>${t.waves
                  .map(
                    (w, n) =>
                      `${n + 1}차: ${Object.entries(w)
                        .map(
                          ([id, count]) =>
                            `${unitConfig(id as UnitKind).name} ${count}`,
                        )
                        .join(" · ")}`,
                  )
                  .join(
                    "<br>",
                  )}</p><small>등급 ${t.rank} · 최초 승리 ${costText(t.reward)}</small><button data-action="army:start:${i}:practice" ${a.economy.data.rank < t.rank ? "disabled" : ""}>연습 전투</button><button data-action="army:confirm:${i}" ${a.economy.data.rank < t.rank ? "disabled" : ""}>군사 도전</button></article>`,
            ).join("")
      }<h3>최근 군사 도전</h3>${a.data.history.map((r) => `<p>${TRAININGS[r.scenario].name} · ${r.outcome} · 생존 ${r.survivors}/${r.initial} · ${Math.round(r.seconds)}초</p>`).join("")}`;
    if (this.tab === "objectives")
      body = `${a.goals.map((g) => `<article class="build-goal">${g.name}<button data-action="army:claim:${g.id}" ${!g.done || a.data.claimed.includes(g.id) ? "disabled" : ""}>${a.data.claimed.includes(g.id) ? "수령 완료" : g.done ? "보상 받기" : "진행 중"}</button></article>`).join("")}<p>목표당 금화 20 · 식량 15, 일회성 보상</p><h3>군사 콤보 · 최대 동시 3개 · 개별 재사용 30초</h3>${MILITARY_COMBOS.map((c) => `<p><b>${c.name}</b><br>${c.description}</p>`).join("")}<button data-action="army:tutorial">군사 안내 다시 보기</button>`;
    this.ui.open(
      "THE ROYAL ARMY · 왕국 군대",
      `<nav class="army-tabs">${tabs.map(([id, name]) => `<button data-action="army:tab:${id}" class="${this.tab === id ? "selected" : ""}">${name}</button>`).join("")}</nav><p class="army-feedback" role="status">${this.feedback}</p>${body}<button class="primary" data-action="close">관리 완료 · 돌아가기</button>`,
    );
  }
  private result(r: BattleRecord) {
    this.ui.close(false);
    const top = Object.entries(r.damage).sort((a, b) => b[1] - a[1])[0];
    const suggestion =
      r.losses > r.initial / 2
        ? "손실이 컸습니다. 방패병 전방과 치유 지원을 시험해 보세요."
        : r.sphereDamage >
            Object.values(r.damage).reduce((s, n) => s + n, 0) * 0.3
          ? "스피어의 직접 지원이 전투에서 큰 비중을 차지했습니다."
          : "생존 병력과 공격 기여를 확인하고 다음 진형을 비교해 보세요.";
    this.ui.open(
      `${r.outcome === "victory" ? "VICTORY" : r.outcome === "aborted" ? "훈련 종료" : "DEFEAT"} · ${r.mode === "practice" ? "연습 전투" : "군사 도전"}`,
      `<p>${TRAININGS[r.scenario].name} · ${r.seconds.toFixed(1)}초</p><div class="results-grid"><div>초기 / 생존<b>${r.initial} / ${r.survivors}</b></div><div>손실<b>${r.losses}</b></div><div>적 처치<b>${r.kills}</b></div><div>스피어 피해<b>${Math.round(r.sphereDamage)}</b></div><div>군사 콤보<b>${r.combos}</b></div><div>경험치<b>${Math.round(r.xp)}</b></div></div><p>보상: ${costText(r.reward)}</p><p>${r.mode === "practice" ? "실제 왕국의 자원·병력·생산 진행률을 복원했습니다." : ""}</p><p>${suggestion}</p><p>최다 피해 기여: ${top ? `${top[0]} (${Math.round(top[1])})` : "없음"}</p><details><summary>병력별 상세 통계</summary><table><thead><tr><th>병력 ID</th><th>피해</th><th>회복</th></tr></thead><tbody>${Object.keys(
        { ...r.damage, ...r.healing },
      )
        .map(
          (id) =>
            `<tr><td>${id}</td><td>${Math.round(r.damage[id] ?? 0)}</td><td>${Math.round(r.healing[id] ?? 0)}</td></tr>`,
        )
        .join(
          "",
        )}</tbody></table></details><div class="dialog-actions"><button data-action="army:retry">다시 훈련</button><button data-action="army:open">병력 관리</button><button class="primary" data-action="army:return">왕국으로 복귀</button></div>`,
      true,
    );
  }
  render() {
    const a = this.game.mode === "kingdom" ? this.game.army : undefined;
    if (!a) return;
    const b = a.data.battle,
      now = this.game.time;
    const key = JSON.stringify([
      a.living.length,
      a.population,
      a.reserved,
      a.capacity,
      Math.floor(a.data.morale),
      a.power,
      a.data.command,
      a.data.formation,
      a.data.starvingMs > 0,
      b
        ? [
            b.enemies.filter((u) => u.hp > 0).length,
            Math.floor(b.time),
            b.scenario,
            b.mode,
          ]
        : null,
      Object.values(a.data.queues).map((q) => [
        q.buildingId,
        q.entries.map((e) => [e.kind, Math.floor(e.progress * 100)]),
      ]),
      Object.entries(a.data.buffs).map(([k, v]) => [
        k,
        Math.ceil((v - now) / 1000),
      ]),
      a.data.tutorial,
      a.data.tutorialDone,
      this.game.practicing,
    ]);
    if (key === this.last) return;
    this.last = key;
    this.ui.root.querySelector("#army-hud")!.innerHTML =
      `<span>⚑ 병력 <b>${a.living.length}기</b></span><span>인구 <b>${a.population}<small> +${a.reserved} 예약 / ${a.capacity}</small></b></span><span>군사력 <b>${a.power}</b></span><span>사기 <b>${Math.floor(a.data.morale)}</b></span><span>${COMMANDS[a.data.command]} · ${FORMATIONS[a.data.formation].name}</span><button data-action="army:open">군대 관리 U</button>${this.game.practicing ? '<strong class="practice-label">연습 · 실제 왕국 보존</strong>' : ""}${a.data.starvingMs ? '<strong class="food-warning">식량 부족 · 훈련 제한</strong>' : ""}`;
    this.ui.root.querySelector("#army-production-summary")!.innerHTML =
      `<div class="section-heading">왕국의 군대</div>${
        Object.values(a.data.queues)
          .filter((q) => q.entries.length)
          .map((q) => {
            const e = q.entries[0];
            return `<p>${unitConfig(e.kind).icon} ${unitConfig(e.kind).name} ${Math.floor(e.progress * 100)}% · 대기 ${q.entries.length}<progress max="1" value="${e.progress}"></progress></p>`;
          })
          .join("") || '<p class="muted">B로 병영 건설 · U로 병력 생산</p>'
      }<p class="tiny">식량 유지비 ${a.upkeep} / 30초</p>`;
    this.ui.root.querySelector("#army-battle-summary")!.innerHTML =
      `${b ? `<div class="section-heading">${b.mode === "practice" ? "연습 전투" : "군사 도전"}</div><p>${TRAININGS[b.scenario].name}<br>적 ${b.enemies.filter((u) => u.hp > 0).length}기 · ${Math.floor(b.time)} / 240초</p><button data-action="army:training">전투 관리</button>` : ""}${MILITARY_COMBOS.filter(
        (c) => a.data.buffs[c.id] > now,
      )
        .map(
          (c) =>
            `<p class="army-buff">${c.name}<br>${Math.ceil((a.data.buffs[c.id] - now) / 1000)}초</p>`,
        )
        .join(
          "",
        )}${!a.data.tutorialDone ? `<aside class="army-help"><b>군사 안내 ${a.data.tutorial + 1}/7</b><p>${ARMY_TUTORIAL[a.data.tutorial]}</p><button data-action="army:skip">건너뛰기</button></aside>` : ""}`;
  }
  dispose() {
    this.abort.abort();
    this.disposeResult();
  }
}
