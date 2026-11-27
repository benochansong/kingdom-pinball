import type { UIManager } from "./UIManager";
import type { CampaignManager } from "../campaign/CampaignManager";
import {
  REGIONS,
  STAGES,
  region,
  stage,
  CAMPAIGN_DIFFICULTIES,
  PRESTIGE_RANKS,
  prestigeRank,
  MISSION_NAMES,
} from "../config/campaign";
import { regionLocked, stageLocked } from "../campaign/CampaignProgression";
import type { CampaignDifficulty } from "../campaign/types";
import { patchHTML } from "./patchHTML";
import {
  CAMPAIGN_RESEARCH,
  GENERALS,
  EQUIPMENT,
  TERRITORY_FACILITIES,
  REGION_MAGIC,
} from "../config/campaignGrowth";
import { ELEMENTS, SPELLS, MULTI_TYPES, STORMS } from "../config/magic";
import type { Element as MagicElement, Spell } from "../magic/types";
import { CampaignRenderer } from "../campaign/CampaignRenderer";
const esc = (v: unknown) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export class CampaignUI {
  private map: HTMLElement;
  private hud: HTMLElement;
  private selected = "greenwood";
  private message = "";
  private next = 0;
  private zoom = 1;
  private pan = { x: 0, y: 0 };
  private drag?: { x: number; y: number; px: number; py: number };
  private abort = new AbortController();
  constructor(
    private ui: UIManager,
    readonly manager: CampaignManager,
  ) {
    ui.root.querySelector(".edition-note")!.innerHTML =
      "PHASE 07 <span>CAMPAIGN WORLD</span>";
    ui.root.querySelector(".edition")!.textContent =
      "EIGHT REALMS · ONE EMPIRE";
    ui.root
      .querySelector('[data-action="war:setup"]')!
      .insertAdjacentHTML(
        "beforebegin",
        '<button class="primary start-button" data-action="campaign:slots">캠페인 계속 <small>CONTINUE CAMPAIGN</small></button><button class="continue-button" data-action="campaign:new">새 캠페인 <small>NEW CAMPAIGN</small></button>',
      );
    ui.root.insertAdjacentHTML(
      "beforeend",
      '<section class="campaign-map" hidden aria-label="아스테리온 대륙 월드맵"></section>',
    );
    this.map = ui.root.querySelector(".campaign-map")!;
    ui.root
      .querySelector("#war-hud")!
      .insertAdjacentHTML(
        "afterend",
        '<section id="campaign-hud" hidden aria-label="캠페인 목표"></section>',
      );
    this.hud = ui.root.querySelector("#campaign-hud")!;
    const action = ui.onAction,
      render = ui.onRender;
    ui.onAction = (a) => this.action(a) || action?.(a) || false;
    ui.onRender = () => {
      render?.();
      this.render();
    };
    manager.onChange = () => {
      if (manager.session?.settled && manager.active) this.result();
      this.render();
    };
    this.map.addEventListener(
      "pointerdown",
      (e) => {
        if (
          (e.target as Element).closest("[data-action]") ||
          !(e.target as Element).closest(".world-viewport")
        )
          return;
        this.drag = {
          x: e.clientX,
          y: e.clientY,
          px: this.pan.x,
          py: this.pan.y,
        };
        this.map.setPointerCapture(e.pointerId);
      },
      { signal: this.abort.signal },
    );
    this.map.addEventListener(
      "pointermove",
      (e) => {
        if (!this.drag) return;
        this.pan = {
          x: Math.max(
            -350,
            Math.min(350, this.drag.px + (e.clientX - this.drag.x) / this.zoom),
          ),
          y: Math.max(
            -250,
            Math.min(250, this.drag.py + (e.clientY - this.drag.y) / this.zoom),
          ),
        };
        this.transform();
      },
      { signal: this.abort.signal },
    );
    this.map.addEventListener("pointerup", () => (this.drag = undefined), {
      signal: this.abort.signal,
    });
    this.map.addEventListener(
      "keydown",
      (e) => {
        const target = (e.target as Element).closest<HTMLElement>(
          "[data-action]",
        );
        if (
          target &&
          target.tagName.toLowerCase() === "g" &&
          ["Enter", " "].includes(e.key)
        ) {
          e.preventDefault();
          this.action(target.dataset.action!);
        }
      },
      { signal: this.abort.signal },
    );
  }
  private transform() {
    this.map
      .querySelector("#world-regions")
      ?.setAttribute(
        "transform",
        `translate(${this.pan.x} ${this.pan.y}) scale(${this.zoom})`,
      );
  }
  private hideMap() {
    this.map.hidden = true;
    this.ui.root.classList.remove("campaign-open");
  }
  private slots(create = false) {
    const rows = [0, 1, 2].map((i) => this.manager.save.load(i, false));
    this.ui.open(
      create ? "새 캠페인 · 3개 저장 슬롯" : "캠페인 계속",
      `<p>${esc(this.message)}</p>${rows.map((p, i) => `<article class="campaign-slot"><b>SLOT ${i + 1} · ${p ? esc(p.name) : "빈 슬롯"}</b><p>${p ? `${p.cores.length}/8 영토 · ${Object.values(p.records).reduce((n, r) => n + r.stars, 0)}/72 별 · ${p.difficulty}` : "새로운 왕국을 시작하세요."}</p><button data-action="campaign:${create ? "create-form" : "load"}:${i}" ${!create && !p ? "disabled" : ""}>${create ? (p ? "새 캠페인으로 덮어쓰기" : "새 캠페인 생성") : "이어하기"}</button></article>`).join("")}<button data-action="close">돌아가기</button>`,
    );
  }
  private createForm(slot: number) {
    this.ui.open(
      "새 왕국의 깃발",
      `<p>${this.manager.save.occupied(slot) ? "이 슬롯에 기존 캠페인이 있습니다. 아래 확인 버튼을 누르면 해당 슬롯의 진행을 새로 시작합니다." : "빈 슬롯에 새 캠페인을 만듭니다."}</p><label>왕국 이름<input id="campaign-name" maxlength="40" value="GREENWOOD"></label><label>난이도<select id="campaign-difficulty">${Object.entries(
        CAMPAIGN_DIFFICULTIES,
      )
        .map(
          ([id, d]) =>
            `<option value="${id}" ${id === "normal" ? "selected" : ""}>${d.name}</option>`,
        )
        .join(
          "",
        )}</select></label><button class="primary" data-action="campaign:create-confirm:${slot}">${this.manager.save.occupied(slot) ? "이 슬롯 덮어쓰기 확인" : "새 캠페인 시작"}</button><button data-action="campaign:new">취소</button>`,
    );
  }
  private action(a: string) {
    if (!a.startsWith("campaign:")) return false;
    const [, id, arg] = a.split(":"),
      c = this.manager;
    if (id === "new" || id === "slots") this.slots(id === "new");
    if (id === "create-form") this.createForm(Number(arg));
    if (id === "create-confirm") {
      const name =
          this.ui.dialog.querySelector<HTMLInputElement>(
            "#campaign-name",
          )!.value,
        d = this.ui.dialog.querySelector<HTMLSelectElement>(
          "#campaign-difficulty",
        )!.value as CampaignDifficulty;
      const error = c.create(Number(arg), name, d, true);
      if (error) {
        this.message = error;
        this.slots(true);
      } else {
        this.ui.close(false);
        this.showMap();
      }
    }
    if (id === "load") {
      if (c.load(Number(arg))) {
        this.ui.close(false);
        this.showMap();
      } else {
        this.message = c.save.lastError;
        this.slots();
      }
    }
    if (id === "region") {
      this.selected = arg;
      this.showMap();
    }
    if (id === "prepare") this.prepare(arg);
    if (id === "retry") {
      c.leave();
      this.showMap();
      this.prepare(c.session!.stage);
    }
    if (id === "launch") {
      const d = this.ui.dialog.querySelector<HTMLSelectElement>(
        "#battle-difficulty",
      )!.value as CampaignDifficulty;
      this.ui.close(false);
      this.hideMap();
      const error = c.begin(arg, d);
      if (error) {
        this.message = error;
        this.showMap();
      }
    }
    if (id === "resume") {
      this.ui.close(false);
      this.hideMap();
      c.resume();
    }
    if (id === "map") {
      this.ui.close(false);
      c.leave();
      this.showMap();
    }
    if (id === "return") {
      this.ui.open(
        "월드맵으로 돌아갈까요?",
        '<p>현재 전투를 체크포인트로 보존합니다. 같은 전투를 이어서 플레이하거나 다른 스테이지를 선택할 수 있습니다.</p><button data-action="campaign:map">저장하고 월드맵으로</button><button data-action="close">계속 플레이</button>',
      );
    }
    if (id === "menu") {
      this.hideMap();
      this.ui.close(false);
      c.leave();
      this.manager.game.menu();
    }
    if (id === "zoom") {
      this.zoom = Math.max(
        0.75,
        Math.min(1.8, this.zoom + (arg === "in" ? 0.15 : -0.15)),
      );
      this.transform();
    }
    if (id === "story") {
      const r = region(arg);
      this.ui.open(
        r.name,
        `<p>${r.story}</p><button data-action="close">건너뛰기 · 지도 계속</button>`,
      );
    }
    if (id === "manage") this.manage(arg);
    if (id === "research") {
      this.message = c.growth.research(arg) ?? "영구 연구 완료";
      this.manage("research");
    }
    if (id === "develop") {
      const [region, facility] = arg.split("/");
      this.message =
        c.growth.develop(region, facility) ?? "영토 시설 발전 완료";
      this.manage("territories");
    }
    if (id === "general") {
      this.message = c.growth.general(arg) ?? "장군 선택 완료";
      this.manage("generals");
    }
    if (id === "equip") {
      this.message = c.growth.equip(arg) ?? "장비 구성 변경";
      this.manage("equipment");
    }
    if (id === "trade") {
      const from =
          this.ui.dialog.querySelector<HTMLSelectElement>("#trade-from")!.value,
        to =
          this.ui.dialog.querySelector<HTMLSelectElement>("#trade-to")!.value;
      this.message =
        c.growth.trade(from, to, arg === "auto") ?? "교역 처리 완료";
      this.manage("trade");
    }
    if (id === "magic-save") {
      const d = this.ui.dialog,
        unlocked = c.profile!.cores.flatMap((r) => REGION_MAGIC[r] ?? []),
        balls = Array.from(
          d.querySelectorAll<HTMLSelectElement>("[data-campaign-ball]"),
        )
          .map((x) => x.value)
          .filter(
            (x) => x === "steel" || unlocked.includes(x),
          ) as MagicElement[],
        spells = Array.from(
          d.querySelectorAll<HTMLSelectElement>("[data-campaign-spell]"),
        )
          .map((x) => x.value)
          .filter((x) => unlocked.includes(x)) as Spell[];
      c.profile!.magicLoadout = {
        balls,
        spells,
        multi: d.querySelector<HTMLSelectElement>("#campaign-multi")!.value,
        storm: d.querySelector<HTMLSelectElement>("#campaign-storm")!.value,
        autoAim: true,
      };
      c.persist();
      this.message =
        "다음 전투의 마법 편성을 저장했습니다. 실제 시설과 발전 등급도 필요합니다.";
      this.manage("magic");
    }
    if (id === "event") {
      this.ui.close(false);
      this.hideMap();
      this.message = c.startEvent(arg) ?? "";
      if (this.message) this.showMap();
    }
    if (id === "elite") {
      this.ui.close(false);
      this.hideMap();
      this.message = c.begin(arg, "legendary", true) ?? "";
      if (this.message) this.showMap();
    }
    if (id === "plus") {
      this.message =
        c.newGamePlus(Number(arg)) ?? "새 슬롯에 NEW GAME PLUS를 만들었습니다.";
      this.ui.close(false);
      this.showMap();
    }
    return true;
  }
  private manage(tab: string) {
    const c = this.manager,
      p = c.profile!;
    let body = "";
    if (tab === "research")
      body = `<p>연구 포인트 ${p.points} · 전투 사이에만 연구합니다. 각 단계 비용은 증가하며 최대 3단계입니다.</p>${[
        "ECONOMY",
        "MILITARY",
        "DEFENSE",
        "PINBALL",
        "MAGIC",
      ]
        .map(
          (branch) =>
            `<details ${branch === "ECONOMY" ? "open" : ""}><summary>${branch}</summary>${CAMPAIGN_RESEARCH.filter(
              (r) => r.branch === branch,
            )
              .map((r) => {
                const level = (p.research[r.id] ?? 0) + 1;
                return `<article class="growth-row"><div><b>${r.name} ${level - 1}/3</b><p>${r.effect}<br>${region(r.region).name} 정복 · 포인트 ${r.points * level} / 특산물 ${r.specialty * level}</p></div><button data-action="campaign:research:${r.id}" ${level > 3 || !p.cores.includes(r.region) ? "disabled" : ""}>연구</button></article>`;
              })
              .join("")}</details>`,
        )
        .join("")}`;
    if (tab === "territories")
      body = p.cores.length
        ? p.cores
            .map(
              (id) =>
                `<details open><summary>${region(id).name} Lv.${p.territories[id].level} · 특산물 ${p.specialties[id] ?? 0}</summary>${Object.entries(
                  TERRITORY_FACILITIES,
                )
                  .map(([f, n]) => {
                    const next = (p.territories[id].facilities[f] ?? 0) + 1;
                    return `<div class="growth-row"><span>${n} ${next - 1}/5 · 특산물 ${next * 10}, 포인트 ${next}</span><button data-action="campaign:develop:${id}/${f}" ${next > 5 ? "disabled" : ""}>발전</button></div>`;
                  })
                  .join(
                    "",
                  )}<p>행정: 발전 등급 · 생산: 새 목표 완료 시 특산물 · 주둔: 방어 이벤트 왕궁 보너스 · 교역: 다음 전투 비축 자원 · 연구: 새 목표 완료 시 연구 포인트</p></details>`,
            )
            .join("")
        : "<p>지역 보스를 물리치면 영토를 관리할 수 있습니다.</p>";
    if (tab === "generals")
      body = GENERALS.map(
        (g) =>
          `<article class="growth-row"><div><b>${g.name}${p.general === g.id ? " · 선택됨" : ""}</b><p>${g.effect}<br>${region(g.region).name} 정복으로 해금</p></div><button data-action="campaign:general:${g.id}" ${!p.generals.includes(g.id) ? "disabled" : ""}>선택</button></article>`,
      ).join("");
    if (tab === "equipment")
      body = `<p>CORE SHELL · CORE GEM · ROYAL EMBLEM · ENERGY MODULE 각 1개. 선택한 장비를 다시 누르면 해제합니다.</p>${EQUIPMENT.map((e) => `<article class="growth-row"><div><b>${e.name}${p.loadout[e.slot] === e.id ? " · 장착됨" : ""}</b><p>${e.slot.toUpperCase()} · ${e.effect}<br>${region(e.region).name} 정복</p></div><button data-action="campaign:equip:${e.id}" ${!p.equipment.includes(e.id) ? "disabled" : ""}>장착 / 해제</button></article>`).join("")}`;
    if (tab === "trade") {
      const options = p.cores
        .map(
          (id) =>
            `<option value="${id}">${region(id).name} (${p.specialties[id] ?? 0})</option>`,
        )
        .join("");
      body = `<p>특산물 5개 → 다른 영토 특산물 2~3개. 교역로당 캠페인 턴 3회까지. 스테이지별 첫 20승과 별 개선으로 턴이 진행하며 자동 교역은 그때 한 번만 정산합니다.</p><label>보낼 영토<select id="trade-from">${options}</select></label><label>받을 영토<select id="trade-to">${options}</select></label><button data-action="campaign:trade:manual" ${p.cores.length < 2 ? "disabled" : ""}>교역 실행</button><button data-action="campaign:trade:auto" ${p.cores.length < 2 ? "disabled" : ""}>자동 교역 켜기/끄기</button><p>${p.trade.map((t) => `${region(t.from).name} → ${region(t.to).name} · 자동 ${t.automatic ? "ON" : "OFF"} · 이번 턴 ${t.turn === p.turn ? t.used : 0}/3`).join("<br>") || "교역로 없음"}</p><p>비축: ${
        Object.entries(p.stock)
          .map(([k, v]) => `${k} ${v}`)
          .join(" / ") || "없음"
      } · 다음 전투당 자원별 최대 100만 가져갑니다.</p>`;
    }
    if (tab === "magic") {
      const unlocked = p.cores.flatMap((r) => REGION_MAGIC[r] ?? []),
        load = p.magicLoadout;
      const options = (
        list: typeof ELEMENTS | typeof SPELLS,
        current?: string,
      ) =>
        '<option value="">빈 슬롯</option>' +
        list
          .filter((e) => e.id === "steel" || unlocked.includes(e.id))
          .map(
            (e) =>
              `<option value="${e.id}" ${e.id === current ? "selected" : ""}>${e.name}</option>`,
          )
          .join("");
      body = `<p>정복으로 얻은 영구 마법을 편성합니다. 전투에서 시설을 건설하고 왕국 등급을 충족해야 사용할 수 있습니다. 전투 중 새 연구도 가능합니다.</p><div class="magic-grid">${[0, 1, 2, 3].map((i) => `<label>${"ZXCV"[i]} 스피어<select data-campaign-ball>${options(ELEMENTS, load?.balls[i])}</select></label>`).join("")}${[0, 1].map((i) => `<label>${"GH"[i]} 주문<select data-campaign-spell>${options(SPELLS, load?.spells[i])}</select></label>`).join("")}<label>분열<select id="campaign-multi">${Object.entries(
        MULTI_TYPES,
      )
        .filter(([, v]) =>
          v.elements.every((e) => e === "steel" || unlocked.includes(e)),
        )
        .map(
          ([id, v]) =>
            `<option value="${id}" ${id === load?.multi ? "selected" : ""}>${v.name}</option>`,
        )
        .join(
          "",
        )}</select></label><label>궁극기<select id="campaign-storm">${Object.entries(
        STORMS,
      )
        .filter(
          ([id, v]) =>
            id === "core" ||
            ((p.research.storm ?? 0) >= 2 &&
              v.elements.every((e) => unlocked.includes(e))),
        )
        .map(
          ([id, v]) =>
            `<option value="${id}" ${id === load?.storm ? "selected" : ""}>${v.name}</option>`,
        )
        .join(
          "",
        )}</select></label></div><button data-action="campaign:magic-save">다음 전투 편성 저장</button>`;
    }
    if (tab === "achievements")
      body = `<p>${p.achievements.map(esc).join("<br>") || "첫 영토 정복으로 시작하세요."}</p><p>전투 시간 ${Math.floor(p.stats.seconds / 60)}분 · 승리 ${p.stats.wins} · 생산 병력 ${p.stats.units}<br>최대 콤보 ${p.stats.combo} · 멀티볼 ${p.stats.multiballs} · STORM ${p.stats.storms}<br>특산물 ${p.stats.specialties} · 명성 ${p.prestige}</p><p>영구 연구 ${CAMPAIGN_RESEARCH.reduce((n, r) => n + Math.min(r.max, p.research[r.id] ?? 0), 0)}/${CAMPAIGN_RESEARCH.length * 3} 단계 · 메인 완료 ${p.completed ? "완료" : "진행 중"} · 별 수집 ${c.progress.stars}/72</p>`;
    if (tab === "endgame")
      body = p.completed
        ? `<p>THE CONTINENT IS UNITED.<br>THE WORLD CORE IS RESTORED.<br>A NEW EMPIRE HAS RISEN.</p><p>빈 슬롯에서 일부 연구(1단계)·장군·장비를 유지한 NEW GAME PLUS를 시작합니다. 현재 완료 캠페인은 보존됩니다.</p>${[0, 1, 2].map((i) => `<button data-action="campaign:plus:${i}" ${c.save.occupied(i) ? "disabled" : ""}>SLOT ${i + 1} · NEW GAME PLUS</button>`).join("")}<h3>ELITE REMATCH</h3>${STAGES.filter(
            (s) => s.index === 2,
          )
            .map(
              (s) =>
                `<button data-action="campaign:elite:${s.id}">${s.name}</button>`,
            )
            .join(
              "",
            )}<p>PERFECT CONQUEST · 별 72개 / LEGENDARY CAMPAIGN · 모든 보스 최고 난이도 기록에 도전하세요.</p>`
        : "<p>8개 코어를 모두 모으면 엔딩과 정예 재전, 별도 슬롯 NEW GAME PLUS가 해금됩니다.</p>";
    this.showMap();
    this.ui.open(
      tab.toUpperCase(),
      `<p class="campaign-message">${esc(this.message)}</p>${body}<button data-action="close">지도 계속</button>`,
    );
    this.ui.dialog.classList.add("wide");
  }
  showMap() {
    const c = this.manager,
      p = c.profile;
    if (!p) return;
    this.hideMap();
    this.map.hidden = false;
    this.ui.root.classList.add("campaign-open");
    const selected = region(this.selected),
      progress = c.progress;
    this.map.innerHTML = `<header><div><small>ASTERION CONTINENT</small><h1>${esc(p.name)}</h1><p>${PRESTIGE_RANKS[prestigeRank(p.prestige)]} · 명성 ${p.prestige} · 연구 포인트 ${p.points}</p></div><button data-action="campaign:menu">메인 메뉴</button></header><div class="campaign-progress"><span>영토 ${progress.territories}/8</span><span>스테이지 ${progress.stages}/24</span><span>WORLD CORE ${p.cores.length}/8</span><span>별 ${progress.stars}/72</span></div><nav class="campaign-nav" aria-label="캠페인 관리">${[
      ["territories", "KINGDOM"],
      ["research", "RESEARCH"],
      ["generals", "GENERALS"],
      ["equipment", "EQUIPMENT"],
      ["magic", "MAGIC LOADOUT"],
      ["trade", "TRADE"],
      ["achievements", "ACHIEVEMENTS"],
      ["endgame", "ENDGAME"],
    ]
      .map(
        ([id, name]) =>
          `<button data-action="campaign:manage:${id}">${name}</button>`,
      )
      .join(
        "",
      )}</nav><p class="campaign-message" role="status">${esc(this.message)}</p>${p.session && !p.session.settled ? `<aside>진행 중인 전투 ${esc(stage(p.session.stage).name)} <button data-action="campaign:resume">전투 이어하기</button></aside>` : ""}${p.events
      .filter((e) => !e.done && e.expires >= p.turn)
      .map(
        (e) =>
          `<aside class="campaign-event">⚑ ${region(e.region).name} · 선택 방어전 3분 / 보상 특산물 8 <button data-action="campaign:event:${e.id}">반격 방어</button><small>무시해도 영토를 잃지 않습니다.</small></aside>`,
      )
      .join(
        "",
      )}<div class="campaign-map-grid"><div><div class="world-controls"><span>지도를 드래그해서 이동</span><button aria-label="지도 축소" data-action="campaign:zoom:out">−</button><button aria-label="지도 확대" data-action="campaign:zoom:in">＋</button></div><svg class="world-viewport" viewBox="0 0 900 650" aria-label="여덟 왕국 지도"><defs><pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#799589" stroke-opacity=".13"/></pattern><radialGradient id="land"><stop stop-color="#435a48"/><stop offset="1" stop-color="#1e3433"/></radialGradient></defs><rect width="900" height="650" fill="#10272b"/><rect width="900" height="650" fill="url(#map-grid)"/><g id="world-regions"><path d="M 105 125 L 180 65 330 90 420 40 570 65 700 40 820 175 805 340 850 510 695 600 545 570 415 625 265 590 130 620 55 450 100 310 55 205Z" fill="url(#land)" stroke="#a5b49b" stroke-opacity=".4" stroke-width="3"/><path d="M 210 530 L155 345 390 235 160 145 625 100 730 270 645 485 430 475 210 530 M155 345 L645 485 M430 475 L390 235 M390 235 L730 270" fill="none" stroke="#d5bc77" stroke-opacity=".32" stroke-dasharray="7 8"/>${REGIONS.map(
      (r) => {
        const locked = regionLocked(p, r.id),
          t = p.territories[r.id],
          stars = STAGES.filter((s) => s.region === r.id).reduce(
            (n, s) => n + (p.records[s.id]?.stars ?? 0),
            0,
          );
        return `<g role="button" tabindex="0" aria-label="${r.name} ${locked ? "잠김" : t ? "정복 완료" : "도전 가능"}" data-action="campaign:region:${r.id}" class="world-region ${r.id === selected.id ? "selected" : ""}"><circle cx="${r.x}" cy="${r.y}" r="52" fill="${locked ? "#263536" : r.color}" fill-opacity="${t ? 0.8 : 0.3}" stroke="${r.id === selected.id ? "#f7db9a" : r.color}" stroke-width="${r.id === selected.id ? 3 : 1}"/><text x="${r.x}" y="${r.y + 7}" text-anchor="middle" class="region-crest">${locked ? "⌑" : t ? "⚑" : r.crest}</text><text x="${r.x}" y="${r.y + 75}" text-anchor="middle">${r.name}</text><text class="region-score" x="${r.x}" y="${r.y + 92}" text-anchor="middle">${t ? `Lv.${t.level} · ` : ""}★ ${stars}/9</text></g>`;
      },
    ).join(
      "",
    )}<g transform="translate(465 330)"><circle r="49" fill="#12272c" stroke="#c4ab78"/>${REGIONS.map((r, i) => `<circle cx="${Math.cos((i * Math.PI) / 4) * 34}" cy="${Math.sin((i * Math.PI) / 4) * 34}" r="7" fill="${p.cores.includes(r.id) ? r.color : "#3c4b4e"}"/>`).join("")}<text text-anchor="middle" y="4" class="core-label">WORLD CORE</text></g></g></svg></div><aside class="region-detail"><small>${selected.english}</small><h2>${selected.crest} ${selected.name}</h2><p>${selected.terrain}</p><p>${selected.strategy}</p><p>특산물 ${selected.specialty}<br>보스 ${selected.boss}<br>보유 특산물 ${p.specialties[selected.id] ?? 0}</p><button data-action="campaign:story:${selected.id}">지역 이야기</button>${STAGES.filter(
      (s) => s.region === selected.id,
    )
      .map((s) => {
        const lock = stageLocked(p, s.id);
        return `<article><small>${s.id} · ${s.mission.toUpperCase()}</small><h3>${s.name}</h3><p>${MISSION_NAMES[s.mission]} · 권장 군사력 ${s.recommended}</p><p>${"★".repeat(p.records[s.id]?.stars ?? 0)}${"☆".repeat(3 - (p.records[s.id]?.stars ?? 0))}</p><button data-action="campaign:prepare:${s.id}" ${lock ? "disabled" : ""}>${lock ?? (p.records[s.id]?.wins ? "다시 도전" : "전투 준비")}</button></article>`;
      })
      .join("")}</aside></div>`;
    this.transform();
  }
  private prepare(id: string) {
    const c = this.manager,
      p = c.profile!,
      s = stage(id),
      r = region(s.region);
    this.ui.open(
      `${s.id} · ${s.name}`,
      `<p>${r.story}</p><p><b>목표</b> ${MISSION_NAMES[s.mission]} ${["defense", "survival"].includes(s.mission) ? `${s.seconds / 60}분` : s.mission === "resource" ? `${s.resource} ${s.goal}` : ""}<br><b>패배</b> 왕궁 파괴 또는 ${s.limit / 60}분 제한 시간 초과</p><p>★ 기본 목표 달성<br>★ ${s.star2}<br>★ ${s.star3}</p><p>${r.terrain}<br>${r.strategy}</p><p>시작 자원: 목재 ${s.initial.wood} · 석재 ${s.initial.stone} · 금화 ${s.initial.gold} · 식량 ${s.initial.food} · 마력석 ${s.initial.mana} (기본 병영 비용 차감)<br>최초 보상: ${r.specialty} ${s.reward} · 연구 포인트 ${s.points}</p><p>해금 병종: ${c.growth.unlockedUnits.join(" · ")}<br>저장한 설계도: ${p.blueprints?.length ?? 0}개 (지역 충돌·통로·자원 재검증)</p><p>장군 ${esc(p.general)} · ${c.growth.description}</p><div class="campaign-nav"><button data-action="campaign:manage:generals">장군 선택</button><button data-action="campaign:manage:equipment">코어 장비</button><button data-action="campaign:manage:magic">마법 편성</button><button data-action="campaign:manage:research">왕국 연구</button></div><label>전투 난이도<select id="battle-difficulty">${Object.entries(
        CAMPAIGN_DIFFICULTIES,
      )
        .map(
          ([id, d]) =>
            `<option value="${id}" ${id === p.difficulty ? "selected" : ""}>${d.name}</option>`,
        )
        .join(
          "",
        )}</select></label>${p.session && !p.session.settled ? '<p class="campaign-message">다른 전투를 시작하면 현재 미완료 전투의 체크포인트를 대체합니다. 영구 성장은 유지됩니다.</p>' : ""}<button class="primary" data-action="campaign:launch:${id}">START BATTLE · 전투 시작</button><button data-action="close">지도 계속</button>`,
    );
  }
  private result() {
    const c = this.manager,
      s = c.session!;
    this.ui.open(
      s.war.result?.outcome === "victory"
        ? "왕국의 깃발이 올랐습니다"
        : "원정을 다시 준비하세요",
      `<h3>${stage(s.stage).name}</h3><p class="campaign-stars">${s.stars.map((v) => (v ? "★" : "☆")).join(" ")}</p><ul>${s.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul><p>${esc(s.reward)}</p><p>${c.advice()}</p>${c.profile!.completed ? '<ol class="core-ending"><li>암흑 황제 패배</li><li>마지막 파편 획득</li><li>여덟 파편 결합</li><li>WORLD CORE 복원</li><li>대륙에 빛 확산</li><li>왕국 깃발 상승</li><li>황제 즉위</li><li>THE CONTINENT IS UNITED.<br>THE WORLD CORE IS RESTORED.<br>A NEW EMPIRE HAS RISEN.</li></ol>' : ""}<button data-action="campaign:retry">같은 스테이지 재도전</button><button class="primary" data-action="campaign:map">WORLD MAP · 월드맵으로</button>`,
      false,
    );
  }
  render() {
    if (performance.now() < this.next) return;
    this.next = performance.now() + 180;
    const c = this.manager,
      g = c.game;
    const continuation = this.ui.root.querySelector<HTMLButtonElement>(
      '[data-action="campaign:slots"]',
    );
    if (continuation)
      continuation.disabled = ![0, 1, 2].some((i) => c.save.occupied(i));
    const heading = this.ui.root.querySelector(".table-heading h2");
    if (heading)
      heading.textContent = c.active
        ? region(stage(c.session!.stage).region).english
        : "GREENWOOD KINGDOM";
    this.hud.hidden = !c.active || g.state === "menu";
    if (this.hud.hidden) return;
    const s = c.session!,
      config = stage(s.stage),
      b = s.mission.boss;
    patchHTML(
      this.hud,
      `<div><small>${region(config.region).name} · ${config.id}</small><b>${config.name}</b><span>${MISSION_NAMES[config.mission]} · ${Math.max(0, Math.ceil(config.limit - (g.time / 1000 - s.war.options.preparation)))}초</span></div>${b ? `<div class="campaign-boss"><b>${region(config.region).boss} · PHASE ${b.phase}</b><progress max="${b.maxHp}" value="${b.hp}"></progress><span>${Math.ceil(b.hp)} / ${b.maxHp} · ${CampaignRenderer.bossHint(c)}</span></div>` : ""}<button data-action="campaign:return">월드맵 · 저장</button>`,
    );
  }
  dispose() {
    this.abort.abort();
    this.manager.dispose();
  }
}
