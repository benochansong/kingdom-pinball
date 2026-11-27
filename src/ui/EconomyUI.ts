import { resourceSVG } from "./IconRegistry";
import {
  ECONOMY,
  ECONOMY_TUTORIAL,
  FACILITIES,
  PRODUCTION_EVENTS,
  RANKS,
  RANK_NAMES,
  RESOURCE_IDS,
  RESOURCES,
  SPECIALS,
  TRADES,
  type Cost,
  type ResourceId,
} from "../config/economy";
import { OBJECTIVES } from "../economy/ObjectiveManager";
import type { GameStateManager } from "../core/GameStateManager";
import { UIManager, format, duration } from "./UIManager";
import type { EconomyManager } from "../economy/EconomyManager";

const costText = (cost: Cost): string =>
  RESOURCE_IDS.filter((r) => cost[r])
    .map((r) => `${RESOURCES[r].name} ${format(cost[r]!)}`)
    .join(" · ");
const resourceIcon = (r: ResourceId): string =>
  `<span class="resource-icon" style="color:${RESOURCES[r].color}">${resourceSVG(r)}</span>`;
const statusNames = {
  READY: "준비",
  ACTIVE: "생산 중",
  BONUS: "보너스",
  OVERLOADED: "과부하",
  RECOVERING: "회복 중",
};
export class EconomyUI {
  private disposers: (() => void)[] = [];
  private log: string[] = [];
  private lastOverview = "";
  private flights = new Set<HTMLElement>();
  private marketSide: "buy" | "sell" = "sell";
  private marketQuantity: "1" | "5" | "max" = "1";
  private feedback = "";
  constructor(
    private ui: UIManager,
    private game: GameStateManager,
  ) {
    const start = ui.root.querySelector<HTMLButtonElement>(
      '[data-action="start"]',
    )!;
    start.innerHTML = "<span>클래식 핀볼</span><small>CLASSIC PINBALL</small>";
    start.classList.remove("primary");
    start.insertAdjacentHTML(
      "beforebegin",
      '<button class="primary start-button" data-action="new-kingdom"><span>왕국 발전</span><small>NEW KINGDOM</small></button><button class="continue-button" data-action="continue-kingdom">왕국 이어하기 <small>CONTINUE KINGDOM</small></button>',
    );
    ui.root.querySelector(".tagline")!.textContent =
      "Bounce, Harvest, Prosper!";
    ui.root.querySelector(".edition-note")!.innerHTML =
      "PHASE 04 <span>THE ROYAL ARMY</span>";
    ui.root.querySelector(".edition")!.innerHTML =
      "THE GREENWOOD CHRONICLES <span>·</span> CHAPTER IV";
    ui.root
      .querySelector(".menu-links")!
      .insertAdjacentHTML(
        "beforeend",
        '<button data-action="kingdom-history">왕국 발전 기록 <small>KINGDOM RECORDS</small></button>',
      );
    ui.root
      .querySelector(".game-layout")!
      .insertAdjacentHTML(
        "beforebegin",
        `<section class="resource-hud economy-only" aria-label="왕국 자원">${RESOURCE_IDS.map((r) => `<div class="resource-cell" data-resource="${r}">${resourceIcon(r)}<div><span>${RESOURCES[r].name}</span><b id="res-${r}">0 <small>/ 0</small></b><div class="resource-meter"><i id="meter-${r}" style="background:${RESOURCES[r].color}"></i></div></div><span class="storage-alert" id="alert-${r}"></span></div>`).join("")}</section>`,
      );
    ui.root
      .querySelector(".left-panel")!
      .insertAdjacentHTML(
        "afterbegin",
        '<section class="economy-only" id="economy-left"></section>',
      );
    ui.root
      .querySelector(".right-panel")!
      .insertAdjacentHTML(
        "afterbegin",
        '<section class="economy-only" id="economy-right"></section>',
      );
    ui.root
      .querySelector(".table-section")!
      .insertAdjacentHTML(
        "beforeend",
        '<nav class="economy-only economy-nav" aria-label="왕국 경제 관리"><button data-action="production">생산시설<small>PRODUCTION</small></button><button data-action="storage">창고<small>STORAGE</small></button><button data-action="market">시장<small>MARKET</small></button><button data-action="objectives">목표<small>OBJECTIVES</small></button><button data-action="statistics">통계<small>STATISTICS</small></button></nav>',
      );
    ui.root
      .querySelector(".table-heading")!
      .insertAdjacentHTML(
        "afterend",
        '<button class="mobile-kingdom-button economy-only" data-action="kingdom-overview">왕국 현황 · 생산 콤보 · 목표</button>',
      );
    ui.onAction = (action) => this.action(action);
    ui.onRender = () => this.render();
    ui.onRelaunchClose = () => {
      if (this.game.ballStatus === "recovery-required") this.relaunchPanel();
    };
    this.disposers = [
      game.events.on("state", ({ state }) => {
        if (game.mode === "kingdom" && !game.war) {
          if (state === "relaunch" && game.economy!.data.resources.energy < 20)
            this.relaunchPanel();
          if (state === "over") this.result();
        }
        if (state === "playing" && game.time === 0) this.log = [];
        this.render();
      }),
      game.events.on("production", (p) => {
        const r = RESOURCES[p.resource];
        this.log.unshift(
          `${r.name} +${p.amount}${p.overflow ? ` · 초과 ${p.overflow}` : ""}`,
        );
        this.log = this.log.slice(0, 5);
        if (p.overflow)
          ui.message(
            `${r.name} 저장 공간 부족 · ${p.overflow} 초과`,
            "warning",
          );
        else if (p.strength >= 1.25)
          ui.message(
            p.strength >= 2
              ? "PERFECT STRIKE!"
              : p.strength >= 1.5
                ? "GREAT HARVEST!"
                : "POWER HIT!",
            "gold",
          );
        if (game.save.data.settings.particles)
          this.flyResource(p.resource, p.x, p.y);
        this.lastOverview = "";
      }),
    ];
    this.render();
  }
  private get economy(): EconomyManager | undefined {
    return this.game.mode === "kingdom" ? this.game.economy : undefined;
  }
  private open(title: string, body: string, wide = true): void {
    this.ui.open(
      title,
      `${this.feedback ? `<p class="transaction-feedback" role="status">${this.feedback}</p>` : ""}${body}`,
    );
    this.ui.dialog.classList.toggle("wide", wide);
    this.feedback = "";
  }
  private action(action: string): boolean {
    const e = this.economy;
    if (
      this.game.saveConflict &&
      ![
        "continue-kingdom",
        "home-confirm",
        "start",
        "new-kingdom",
        "new-kingdom-confirm",
      ].includes(action)
    ) {
      this.showSaveConflict();
      return true;
    }
    if (action === "new-kingdom") {
      if (this.game.economySave.load())
        this.open(
          "새 왕국을 세울까요?",
          '<p>기존 왕국의 자원과 발전 상태를 새로 시작합니다.<br>클래식 최고 기록과 설정은 유지됩니다.</p><div class="dialog-actions"><button data-action="close">취소</button><button class="primary" data-action="new-kingdom-confirm">새 왕국 시작</button></div>',
          false,
        );
      else this.start(true);
      return true;
    }
    if (action === "new-kingdom-confirm") {
      this.start(true);
      return true;
    }
    if (action === "continue-kingdom") {
      this.start(false);
      return true;
    }
    if (action === "kingdom-history") {
      const history = this.game.economySave.history();
      this.open(
        "왕국 발전 기록",
        history.length
          ? `<table><thead><tr><th>설립일</th><th>등급</th><th>점수</th><th>일반 생산</th><th>시간</th></tr></thead><tbody>${history.map((d) => `<tr><td>${d.createdAt}</td><td>${RANK_NAMES[d.rank - 1]}</td><td>${format(d.score)}</td><td>${format(RESOURCE_IDS.filter((r) => r !== "energy").reduce((sum, r) => sum + d.produced[r], 0))}</td><td>${duration(d.time / 1000)}</td></tr>`).join("")}</tbody></table><button data-action="close">닫기</button>`
          : '<p>완료한 왕국 발전 기록이 없습니다.</p><button data-action="close">닫기</button>',
      );
      return true;
    }
    if (!e) return false;
    const [command, id, quantity] = action.split(":");
    switch (command) {
      case "kingdom-overview": {
        const d = e.data,
          event = d.event && PRODUCTION_EVENTS[d.event.index];
        this.open(
          "왕국 현황",
          `<div class="style-badge">LEVEL ${d.rank} · ${RANKS[d.rank - 1]}<br>${RANK_NAMES[d.rank - 1]}</div><p>생산 콤보 ${d.combo.count}회 · ×${e.multiplier}<br>점수 콤보 ${this.game.score.combo.count}회 · ×${this.game.score.combo.multiplier}<br>왕궁 타격 ${this.game.score.palaceHits % 5} / 5<br>코어 에너지 ${d.resources.energy} · 재발사 ${Math.floor(d.resources.energy / 20)}회</p><p>${event ? `${event.name} · ${event.hint}` : "활성 생산 이벤트가 없습니다."}</p><div class="pause-menu"><button data-action="objectives">경제 발전 목표 보기</button><button data-action="specials">특수 생산 콤보 진행 상황</button><button data-action="tutorial">경제 튜토리얼 다시 보기</button><button class="primary" data-action="close">계속 플레이</button></div>`,
          false,
        );
        return true;
      }
      case "production":
        this.production();
        return true;
      case "storage":
        if (e.data.tutorialStep === 6) {
          e.data.tutorialStep = 7;
          e.checkpoint();
        }
        this.storage();
        return true;
      case "market":
        this.market();
        return true;
      case "objectives":
        this.objectives();
        return true;
      case "statistics":
        this.statistics();
        return true;
      case "specials":
        this.specials();
        return true;
      case "upgrade": {
        // Each rendered button carries the reviewed level. A stale double click cannot buy the next tier.
        const ok =
          e.data.facilities[id]?.level === Number(quantity) && e.upgrade(id);
        this.feedback = ok
          ? `${FACILITIES.find((f) => f.id === id)!.name} 강화 완료`
          : "조건이 변경되었거나 자원이 부족합니다.";
        this.production();
        return true;
      }
      case "upgrade-storage": {
        const ok = e.data.storageLevel === Number(id) && e.upgradeStorage();
        this.feedback = ok
          ? "창고가 확장되었습니다."
          : "조건이 변경되었거나 자원이 부족합니다.";
        this.storage();
        return true;
      }
      case "market-side":
        this.marketSide = id === "buy" ? "buy" : "sell";
        this.market();
        return true;
      case "market-quantity":
        this.marketQuantity = id === "5" || id === "max" ? id : "1";
        this.market();
        return true;
      case "trade": {
        const batches = Number(quantity);
        const t = TRADES.find((t) => t.id === id);
        const ok = e.trade(id, batches);
        this.feedback =
          ok && t
            ? `${RESOURCES[t.from].name} −${format(e.market.price(id) * batches)} · ${RESOURCES[t.to].name} +${format(t.give * batches)}`
            : "거래할 자원 또는 저장 공간이 부족합니다.";
        this.market();
        return true;
      }
      case "claim":
        this.feedback = e.claim(id)
          ? "목표 보상을 받았습니다."
          : "아직 완료되지 않았거나 이미 받은 보상입니다.";
        this.objectives();
        return true;
      case "pay-relaunch":
        if (this.game.relaunch()) {
          this.ui.close(false);
          this.ui.message("에너지 −20 · Space로 다시 발사하세요");
        } else this.relaunchPanel();
        return true;
      case "recover-gold":
        e.recoverEnergy("gold");
        if (this.game.relaunch()) this.ui.close(false);
        else this.relaunchPanel();
        return true;
      case "recover-mana":
        e.recoverEnergy("mana");
        if (this.game.relaunch()) this.ui.close(false);
        else this.relaunchPanel();
        return true;
      case "end-kingdom":
        this.ui.close(false);
        this.game.endKingdom();
        return true;
      case "home":
        if (this.game.state !== "menu" && this.game.state !== "over") {
          this.open(
            "왕국을 저장하고 돌아갈까요?",
            '<p>자원과 발전 상태가 저장됩니다. 비행 중인 스피어는 다음에 이어할 때 손실 처리되며 재발사 비용이 필요합니다.</p><div class="dialog-actions"><button data-action="close">계속 플레이</button><button class="primary" data-action="home-confirm">저장 후 메인 메뉴</button></div>',
            false,
          );
          return true;
        }
        return false;
      case "tutorial":
        e.data.tutorialStep = 0;
        e.data.tutorialDone = false;
        e.checkpoint();
        this.ui.close();
        return true;
      case "tutorial-next":
        e.tutorialNext();
        return true;
      case "tutorial-skip":
        e.data.tutorialStep = -1;
        e.data.tutorialDone = true;
        e.checkpoint();
        return true;
      case "how":
        this.open(
          "왕국 발전 모드",
          '<p>필요한 자원을 생산하는 시설로 스피어를 조준하세요. 강한 충돌과 생산 콤보는 생산량을 높입니다. 최종 생산 배율은 최대 ×8입니다.</p><p>생산시설·창고·시장 메뉴를 열면 물리와 모든 게임 시간이 멈춥니다. 공 손실 후에는 에너지 20을 지불해 다시 발사할 수 있습니다.</p><p>여섯 시설을 고르게 타격하면 특수 생산 콤보를 얻고 과부하를 피할 수 있습니다. 목표 보상은 목표 메뉴에서 직접 수령하세요.</p><button class="primary" data-action="close">알겠습니다</button>',
          false,
        );
        return true;
    }
    return false;
  }
  private start(fresh: boolean): void {
    this.ui.close(false);
    this.log = [];
    this.lastOverview = "";
    this.game.startKingdom(fresh);
    this.render();
  }
  showSaveConflict(): void {
    this.open(
      "다른 탭에서 왕국이 변경됐습니다",
      '<p>이 탭의 진행을 멈췄습니다. 최신 저장을 불러오면 다른 탭의 거래와 자원 소비를 유지할 수 있습니다.</p><div class="dialog-actions"><button data-action="home-confirm">메인 메뉴</button><button class="primary" data-action="continue-kingdom">최신 저장 이어하기</button></div>',
      false,
    );
    this.ui.dialog.querySelector<HTMLElement>(".dialog-close")!.hidden = true;
  }
  private production(): void {
    const e = this.economy!;
    this.open(
      "생산시설 관리",
      `<p class="muted">물리와 생산 시간 일시정지 · 충돌 영역은 강화해도 유지됩니다.</p><div class="facility-grid">${FACILITIES.map(
        (f) => {
          const state = e.data.facilities[f.id],
            level = state.level,
            current = f.base * ECONOMY.levelMultipliers[level - 1];
          const cost = ECONOMY.upgradeCosts[level - 1],
            can = level < 5 && e.resources.canAfford(cost);
          const missing =
            level < 5
              ? RESOURCE_IDS.filter((r) => (cost[r] ?? 0) > e.data.resources[r])
                  .map(
                    (r) =>
                      `${RESOURCES[r].name} ${(cost[r] ?? 0) - e.data.resources[r]} 부족`,
                  )
                  .join(" · ")
              : "";
          return `<article class="facility-card"><div class="facility-title">${resourceIcon(f.resource)}<div><h3>${f.name}</h3><small>${f.english}</small></div><b>Lv.${level}</b></div><div class="level-pips">${Array.from({ length: 5 }, (_, i) => `<i class="${i < level ? "lit" : ""}"></i>`).join("")}</div><p>기본 생산 ${current.toFixed(1)} ${level < 5 ? `→ <strong>${(f.base * ECONOMY.levelMultipliers[level]).toFixed(1)}</strong>` : "· 최대 레벨"} ${RESOURCES[f.resource].name}</p><p class="tiny">${level < 2 ? "Lv.3 회복 속도 증가 · Lv.4 과부하 저항" : level === 2 ? "다음 강화: 과부하 회복 시간 20% 감소" : level === 3 ? "다음 강화: 과부하 허용 타격 +3" : "왕실 장식과 시설별 생산 효과 강화"}</p>${level < 5 ? `<p class="cost">필요 ${costText(cost)}</p><p class="tiny">보유 ${costText({ wood: e.data.resources.wood, stone: e.data.resources.stone, gold: e.data.resources.gold })}</p><button class="${can ? "primary" : ""}" data-action="upgrade:${f.id}:${level}" ${can ? "" : "disabled"}>${can ? `LEVEL ${level + 1} 강화` : missing}</button>` : '<p class="max-level">ROYAL PRODUCTION · 최대 강화</p>'}</article>`;
        },
      ).join(
        "",
      )}</div><button class="primary" data-action="close">왕국으로 돌아가기</button>`,
    );
  }
  private storage(): void {
    const e = this.economy!,
      d = e.data,
      level = d.storageLevel,
      cost = ECONOMY.storageCosts[level - 1];
    this.open(
      `왕실 창고 · LEVEL ${level}`,
      `<p>일반 자원 저장 한도 ×${ECONOMY.storageMultipliers[level - 1]}${level < 5 ? ` → ×${ECONOMY.storageMultipliers[level]}` : " · 최대 확장"}</p><div class="table-scroll"><table><thead><tr><th>자원</th><th>보유 / 한도</th><th>사용률</th><th>누적 생산</th><th>누적 소비</th></tr></thead><tbody>${RESOURCE_IDS.map((r) => `<tr><td>${resourceIcon(r)} ${RESOURCES[r].name}</td><td>${format(d.resources[r])} / ${format(e.resources.capacity(r))}</td><td>${Math.floor((d.resources[r] / e.resources.capacity(r)) * 100)}%</td><td>${format(d.produced[r])}</td><td>${format(d.spent[r])}</td></tr>`).join("")}</tbody></table></div><p class="muted">코어 에너지는 창고와 별도로 최대 100입니다. 생산량은 실제 저장한 양이며 시장 구매와 보상을 포함하지 않습니다. 넘친 자원은 별도 기록됩니다.</p>${level < 5 ? `<p class="cost">확장 비용 · ${costText(cost)}</p><button class="primary" data-action="upgrade-storage:${level}" ${e.resources.canAfford(cost) ? "" : "disabled"}>창고 LEVEL ${level + 1} 확장</button>` : "<p>왕실 최대 규모의 창고입니다.</p>"}<button data-action="close">닫기</button>`,
    );
  }
  private market(): void {
    const e = this.economy!;
    this.open(
      "ROYAL MARKET · 왕실 시장",
      `<div class="market-controls"><div><button class="${this.marketSide === "sell" ? "selected" : ""}" data-action="market-side:sell">판매</button><button class="${this.marketSide === "buy" ? "selected" : ""}" data-action="market-side:buy">구매</button></div><div>${["1", "5", "max"].map((n) => `<button class="${this.marketQuantity === n ? "selected" : ""}" data-action="market-quantity:${n}">${n === "max" ? "최대" : `${n}회`}</button>`).join("")}</div></div><p class="muted">확정 전 비용과 획득량을 확인하세요. 창고에 모두 들어가는 거래만 가능합니다.</p><div class="trade-list">${TRADES.filter(
        (t) => t.side === this.marketSide,
      )
        .map((t) => {
          const max = e.market.max(t.id),
            n =
              this.marketQuantity === "max" ? max : Number(this.marketQuantity),
            enabled = n > 0 && n <= max;
          return `<article class="trade-card"><div><b>${resourceIcon(t.from)} ${RESOURCES[t.from].name} ${e.market.price(t.id)} <span>⇄</span> ${resourceIcon(t.to)} ${RESOURCES[t.to].name} ${t.give}</b><p>보유 ${RESOURCES[t.from].name} ${format(e.data.resources[t.from])} · ${RESOURCES[t.to].name} 빈 공간 ${format(e.resources.space(t.to))}</p><small>미리 보기: −${format(e.market.price(t.id) * n)} ${RESOURCES[t.from].name} / +${format(t.give * n)} ${RESOURCES[t.to].name}</small></div><button class="primary" data-action="trade:${t.id}:${n}" ${enabled ? "" : "disabled"}>${enabled ? `${n}회 거래` : "자원·공간 부족"}</button></article>`;
        })
        .join("")}</div><button data-action="close">닫기</button>`,
    );
  }
  private objectives(): void {
    const e = this.economy!,
      d = e.data;
    this.open(
      "경제 발전 목표",
      `<p class="muted">생산량에는 시장 구매와 보상을 포함하지 않습니다. 각 목표의 보상은 한 번만 받을 수 있습니다.</p><div class="objective-list">${OBJECTIVES.map(
        (o) => {
          const value = Math.min(o.target, o.progress(d)),
            claimed = d.claimed.includes(o.id),
            complete = value >= o.target;
          return `<article><div><b>${o.name}</b><p>${format(value)} / ${format(o.target)} · 보상 ${costText(o.reward)}</p><progress value="${value}" max="${o.target}"></progress></div><button class="${complete && !claimed ? "primary" : ""}" data-action="claim:${o.id}" ${complete && !claimed ? "" : "disabled"}>${claimed ? "수령 완료" : complete ? "보상 받기" : "진행 중"}</button></article>`;
        },
      ).join("")}</div><button data-action="close">닫기</button>`,
    );
  }
  private specials(): void {
    const e = this.economy!;
    this.open(
      "특수 생산 콤보",
      `<div class="special-list">${SPECIALS.map((s) => {
        const p = e.data.specials[s.id];
        return `<article><b>${s.name}</b><p>${s.text} · ${p.count} / ${s.goal}</p><progress value="${p.count}" max="${s.goal}"></progress><p>보상 ${costText(s.reward)}<br>${p.readyAt > e.data.time ? `재사용 ${Math.ceil((p.readyAt - e.data.time) / 1000)}초` : "도전 가능"} · 달성 ${p.achievements}회</p></article>`;
      }).join(
        "",
      )}</div><p class="muted">MINING MASTER는 다른 생산시설을 끼우지 않고 교대로 4회 타격합니다. 모든 특수 콤보에는 20초 재사용 대기시간이 있습니다.</p><button data-action="close">닫기</button>`,
    );
  }
  private statistics(): void {
    const e = this.economy!,
      d = e.data;
    this.open(
      "왕국의 생산 기록",
      `<div class="style-badge">${e.style}</div><div class="results-grid"><div>누적 일반 생산<b>${format(e.resources.totalProduction)}</b></div><div>최대 생산 콤보<b>${d.combo.max}</b></div><div>왕궁 보너스<b>${d.royalCount}회</b></div><div>공 손실<b>${d.losses}회</b></div><div>평균 공 생존<b>${duration(d.losses ? d.survivalMs / d.losses / 1000 : 0)}</b></div><div>플레이 시간<b>${duration(d.time / 1000)}</b></div></div><div class="table-scroll"><table><thead><tr><th>자원</th><th>생산</th><th>소비</th><th>시장 유입</th><th>시장 유출</th><th>초과 손실</th></tr></thead><tbody>${RESOURCE_IDS.map((r) => `<tr><td>${RESOURCES[r].name}</td><td>${format(d.produced[r])}</td><td>${format(d.spent[r])}</td><td>${format(d.bought[r])}</td><td>${format(d.sold[r])}</td><td>${format(d.overflow[r])}</td></tr>`).join("")}</tbody></table></div><table><thead><tr><th>시설</th><th>타격</th><th>타격당 생산</th><th>기본 대비 효율</th></tr></thead><tbody>${FACILITIES.map(
        (f) => {
          const state = d.facilities[f.id],
            avg = state.hits ? state.yielded / state.hits : 0;
          return `<tr><td>${f.name} Lv.${state.level}</td><td>${state.hits}</td><td>${avg.toFixed(1)}</td><td>${Math.round((avg / f.base) * 100)}%</td></tr>`;
        },
      ).join(
        "",
      )}</tbody></table><p class="muted">특수 콤보 달성: ${SPECIALS.map((s) => `${s.name} ${d.specials[s.id].achievements}회`).join(" · ")}</p><p class="muted">시장 거래 ${d.tradeCount}회 · 최근 거래 ${
        d.trades
          .slice(-5)
          .reverse()
          .map((t) => {
            const trade = TRADES.find((x) => x.id === t.id);
            return trade
              ? `${RESOURCES[trade.from].name}→${RESOURCES[trade.to].name} ${t.batches}회`
              : "";
          })
          .join(" / ") || "없음"
      }</p><button data-action="close">닫기</button>`,
    );
  }
  private relaunchPanel(): void {
    const e = this.economy;
    if (!e) return;
    const r = e.data.resources;
    this.open(
      "코어 스피어를 다시 깨우세요",
      `<p>공이 왕국을 떠났습니다. 에너지는 아직 차감되지 않았습니다.</p><div class="big-record">${r.energy}<span>CORE ENERGY / 100</span></div><div class="pause-menu"><button class="primary" data-action="pay-relaunch" ${r.energy >= 20 ? "" : "disabled"}>에너지 20으로 재발사 준비</button><button data-action="recover-gold" ${r.energy < 20 && r.gold >= 30 ? "" : "disabled"}>금화 30 → 에너지 20 · 보유 ${r.gold}</button><button data-action="recover-mana" ${r.energy < 20 && r.mana >= 8 ? "" : "disabled"}>마력석 8 → 에너지 20 · 보유 ${r.mana}</button><button data-action="end-kingdom">이번 왕국 발전 종료</button></div>`,
      false,
    );
    this.ui.dialog.querySelector<HTMLElement>(".dialog-close")!.hidden = true;
  }
  private result(): void {
    const e = this.economy;
    if (!e) return;
    const d = e.data,
      top = RESOURCE_IDS.filter((r) => r !== "energy").sort(
        (a, b) => d.produced[b] - d.produced[a],
      )[0];
    const facility = [...FACILITIES].sort(
      (a, b) => d.facilities[b.id].hits - d.facilities[a.id].hits,
    )[0];
    this.open(
      "왕국 발전의 발자취",
      `<div class="style-badge">${e.style}</div><div class="big-record">${format(d.score)}<span>${RANKS[d.rank - 1]}</span></div><div class="results-grid"><div>왕국 등급<b>${RANK_NAMES[d.rank - 1]}</b></div><div>일반 자원 생산<b>${format(e.resources.totalProduction)}</b></div><div>최다 생산 자원<b>${e.resources.totalProduction ? RESOURCES[top].name : "기록 없음"}</b></div><div>최다 타격 시설<b>${d.validHits ? facility.name : "기록 없음"}</b></div><div>최대 생산 콤보<b>${d.combo.max}</b></div><div>플레이 시간<b>${duration(d.time / 1000)}</b></div></div><div class="dialog-actions"><button data-action="statistics">상세 통계</button><button data-action="home">메인 메뉴</button><button class="primary" data-action="new-kingdom">새 왕국</button></div>`,
    );
  }
  private render(): void {
    const active = this.game.mode === "kingdom" && this.game.state !== "menu";
    this.ui.root.dataset.mode = active ? "kingdom" : "classic";
    const scoreLabel = this.ui.root.querySelector(".best-score>span")!;
    if (scoreLabel.textContent !== (active ? "왕국 누적 점수" : "최고 기록"))
      scoreLabel.textContent = active ? "왕국 누적 점수" : "최고 기록";
    const sphereLabel = this.ui.root.querySelector(".launcher-bar>span")!;
    const labelNode = [...sphereLabel.childNodes].find(
      (n) => n.nodeType === Node.TEXT_NODE,
    );
    if (labelNode)
      labelNode.textContent = active ? " 재발사 " : " CORE SPHERE ";
    sphereLabel.querySelector("small")!.textContent = active
      ? "회 가능"
      : "/ 5";
    const continueButton = this.ui.root.querySelector<HTMLButtonElement>(
      '[data-action="continue-kingdom"]',
    )!;
    if (this.game.state === "menu")
      continueButton.hidden = !this.game.economySave.load();
    const e = this.economy;
    if (!active || !e) return;
    const d = e.data;
    for (const r of RESOURCE_IDS) {
      const element = this.ui.root.querySelector(`#res-${r}`)!;
      const html = `${format(d.resources[r])} <small>/ ${format(e.resources.capacity(r))}</small>`;
      if (element.innerHTML !== html) element.innerHTML = html;
      this.ui.root.querySelector<HTMLElement>(`#meter-${r}`)!.style.width =
        `${(d.resources[r] / e.resources.capacity(r)) * 100}%`;
      this.ui.text(
        `alert-${r}`,
        r !== "energy" && d.resources[r] >= e.resources.capacity(r) * 0.8
          ? d.resources[r] === e.resources.capacity(r)
            ? "가득 참"
            : "80%↑"
          : "",
      );
    }
    this.ui.text("sphere-count", `${Math.floor(d.resources.energy / 20)}`);
    this.ui.text("best", format(d.score));
    const key = JSON.stringify([
      Math.floor(d.time / 500),
      d.rank,
      d.resources,
      d.facilities,
      d.combo,
      d.claimed,
      this.log,
    ]);
    if (key !== this.lastOverview) {
      this.lastOverview = key;
      const objectives = OBJECTIVES.filter(
        (o) => !d.claimed.includes(o.id),
      ).slice(0, 3);
      const next = [
        "일반 자원 300 · 시설 1개 Lv.2",
        "일반 자원 1,000 · 시설 3개 Lv.2 · 창고 Lv.2",
        "일반 자원 3,000 · 시설 3개 Lv.3 · 창고 Lv.3",
        "일반 자원 7,000 · 시설 5개 Lv.4 · 창고 Lv.4",
      ];
      const event = d.event && PRODUCTION_EVENTS[d.event.index];
      this.ui.root.querySelector("#economy-left")!.innerHTML =
        `<div class="eyebrow">YOUR GROWING KINGDOM</div><h2 class="rank-title">${RANK_NAMES[d.rank - 1]}</h2><div class="rank-english">LEVEL ${d.rank} · ${RANKS[d.rank - 1]}</div><p class="tiny">${d.rank < 5 ? `다음 등급: ${next[d.rank - 1]}` : "왕국의 최고 발전 등급입니다."}</p><div class="section-heading">이번 원정의 목표 <button class="text-button" data-action="objectives">전체</button></div><div class="mini-objectives">${objectives.map((o) => `<button data-action="objectives"><span>${o.name}</span><small>${format(Math.min(o.target, o.progress(d)))} / ${format(o.target)}</small><progress max="${o.target}" value="${Math.min(o.target, o.progress(d))}"></progress></button>`).join("") || "<p>모든 경제 목표를 완료했습니다.</p>"}</div><div class="section-heading">왕국의 생산시설</div><div class="mini-facilities">${FACILITIES.map((f) => `<button data-action="production">${resourceIcon(f.resource)}<span>${f.name}<small>${statusNames[e.status(f.id)]}</small></span><b>Lv.${d.facilities[f.id].level}</b></button>`).join("")}</div><div class="active-event"><b>${event ? event.name : "다음 생산 이벤트"}</b><p>${event ? `${event.hint}<br>${Math.ceil((d.event!.until - d.time) / 1000)}초 남음` : `유효 생산 타격 ${Math.max(0, ECONOMY.eventEveryHits - (d.validHits - d.lastEventHit))}회 후 발생`}</p>${d.royalUntil > d.time ? `<p>ROYAL PROSPERITY +20%<br>${Math.ceil((d.royalUntil - d.time) / 1000)}초 남음</p>` : ""}</div>`;
      this.ui.root.querySelector("#economy-right")!.innerHTML =
        `<div class="eyebrow">THE ART OF PRODUCTION</div><div class="production-combo"><strong>${d.combo.count}</strong><span>생산 콤보<br><b>×${e.multiplier}</b></span></div><div class="combo-track"><i style="width:${d.combo.count ? Math.max(0, 100 - (d.time - d.combo.last) / 40) : 0}%"></i></div><p class="tiny">생산 콤보는 4초 동안 유지됩니다.</p><div class="section-heading">특수 생산 콤보 <button class="text-button" data-action="specials">보기</button></div>${SPECIALS.map((s) => `<button class="mini-special" data-action="specials"><span>${s.name}</span><b>${d.specials[s.id].count}/${s.goal}</b><progress value="${d.specials[s.id].count}" max="${s.goal}"></progress></button>`).join("")}<div class="section-heading">최근 생산 내역</div><ul class="resource-log">${this.log.map((l) => `<li>${l}</li>`).join("") || "<li>필요한 자원의 시설을 조준하세요.</li>"}</ul><div class="energy-summary">${resourceIcon("energy")} 재발사 가능 <b>${Math.floor(d.resources.energy / 20)}회</b><small>공 손실 후 에너지 20 자동 지불</small></div>`;
    }
    const tutorial = this.ui.root.querySelector<HTMLElement>("#tutorial")!;
    tutorial.hidden = d.tutorialStep < 0 || this.game.state !== "playing";
    if (d.tutorialStep >= 0) {
      tutorial.querySelector(".tutorial-index")!.textContent = String(
        d.tutorialStep + 1,
      ).padStart(2, "0");
      tutorial.querySelector("strong")!.textContent =
        ECONOMY_TUTORIAL[d.tutorialStep][0];
      tutorial.querySelector("p")!.textContent =
        ECONOMY_TUTORIAL[d.tutorialStep][1];
    }
  }
  private flyResource(resource: ResourceId, x: number, y: number): void {
    if (this.flights.size >= 12) return;
    const canvas = this.ui.root.querySelector("canvas"),
      target = this.ui.root.querySelector(`[data-resource="${resource}"]`);
    if (!canvas || !target) return;
    const from = canvas.getBoundingClientRect(),
      to = target.getBoundingClientRect();
    const icon = document.createElement("span");
    icon.className = "resource-flight";
    icon.textContent = RESOURCES[resource].icon;
    icon.style.color = RESOURCES[resource].color;
    const startX = from.left + (x / 600) * from.width,
      startY = from.top + (y / 900) * from.height;
    icon.style.left = `${startX}px`;
    icon.style.top = `${startY}px`;
    document.body.append(icon);
    this.flights.add(icon);
    const animation = icon.animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        {
          transform: `translate(${to.left + 20 - startX}px,${to.top + 20 - startY}px) scale(.6)`,
          opacity: 0.3,
        },
      ],
      { duration: 650, easing: "ease-in" },
    );
    animation.onfinish = () => {
      icon.remove();
      this.flights.delete(icon);
      target.animate(
        [
          { backgroundColor: `${RESOURCES[resource].color}66` },
          { backgroundColor: "transparent" },
        ],
        { duration: 450 },
      );
    };
  }
  dispose(): void {
    this.disposers.forEach((fn) => fn());
    this.flights.forEach((f) => f.remove());
    this.flights.clear();
  }
}
