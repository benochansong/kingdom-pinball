import { buildingConfig } from "../config/buildings";
import { FACILITIES, type Cost } from "../config/economy";
import {
  unitConfig,
  POPULATION,
  QUEUE_LIMIT,
  TRAINING_SPEED,
  FORMATIONS,
  RESEARCH,
  researchCost,
  TRAININGS,
  MILITARY_COMBOS,
} from "../config/army";
import type { EconomyManager } from "../economy/EconomyManager";
import type { BuildingEntity } from "../building/types";
import {
  freshArmy,
  type ArmyData,
  type UnitKind,
  type UnitEntity,
  type Command,
  type Formation,
  type BattleRecord,
} from "./types";
import { CombatManager } from "./CombatManager";
import { PathfindingSystem } from "./PathfindingSystem";
import { maxHp, attackPower } from "./DamageCalculator";
import { formationPosition } from "./FormationManager";
export class ArmyManager {
  populationFilter?: (unit: UnitEntity) => boolean;
  unlockExtra?: (kind: UnitKind) => string | null;
  externalCombat = false;
  side: "ally" | "enemy" = "ally";
  spawnOverride?: (b: BuildingEntity) => { x: number; y: number } | null;
  worldBuildings?: () => BuildingEntity[];
  productionFactor: (b: BuildingEntity) => number = () => 1;
  readonly navigation = new PathfindingSystem();
  readonly combat: CombatManager;
  private accumulator = 0;
  private pool: UnitEntity[] = [];
  private nextSave = 0;
  onNotice: (text: string) => void = () => {};
  onResult: (record: BattleRecord) => void = () => {};
  constructor(readonly economy: EconomyManager) {
    economy.data.army ??= freshArmy();
    this.combat = new CombatManager(this.data, this.navigation);
    this.navigation.rebuild(this.worldBuildings?.() ?? this.buildings);
  }
  get data(): ArmyData {
    return this.economy.data.army!;
  }
  get buildings() {
    return this.economy.data.building?.buildings ?? [];
  }
  get living() {
    return this.data.units.filter((u) => u.hp > 0);
  }
  get population() {
    return this.living
      .filter((u) => this.populationFilter?.(u) ?? true)
      .reduce((n, u) => n + unitConfig(u.kind).population, 0);
  }
  get reserved() {
    return Object.values(this.data.queues).reduce(
      (n, q) =>
        n + q.entries.reduce((v, e) => v + unitConfig(e.kind).population, 0),
      0,
    );
  }
  get capacity() {
    return Math.min(
      120,
      POPULATION[this.economy.data.rank - 1] +
        this.buildings
          .filter((b) => b.type === "granary" && !b.disabled)
          .reduce((s, b) => s + b.level * 5, 0),
    );
  }
  get upkeep() {
    return this.population
      ? Math.max(1, Math.ceil((this.population / 10) * 3))
      : 0;
  }
  get power() {
    const a = this.data;
    return Math.floor(
      this.living.reduce(
        (s, u) =>
          s +
          ((unitConfig(u.kind).hp / 8 +
            attackPower(u, a, this.economy.data.time) * 1.5 +
            unitConfig(u.kind).armor) *
            u.hp) /
            maxHp(u),
        0,
      ) +
        this.buildings
          .filter((b) => ["archerTower", "watchtower"].includes(b.type))
          .reduce((s, b) => s + b.level * 20, 0),
    );
  }
  checkpoint() {
    this.economy.checkpoint();
  }
  queueFor(id: string) {
    return (this.data.queues[id] ??= {
      buildingId: id,
      entries: [],
      lastHit: -10000,
    });
  }
  unlock(kind: UnitKind, building: BuildingEntity): string | null {
    const extra = this.unlockExtra?.(kind);
    if (extra) return extra;
    const c = unitConfig(kind);
    if (building.disabled) return "파괴된 시설을 먼저 재건하세요.";
    if (building.type !== c.building)
      return "해당 시설에서 훈련할 수 없습니다.";
    if (this.economy.data.rank < c.rank) return `왕국 등급 ${c.rank} 필요`;
    if (building.level < c.level) return `시설 Lv.${c.level} 필요`;
    return null;
  }
  enqueue(id: string, kind: UnitKind, quantity: number | "max"): number {
    const b = this.buildings.find((b) => b.id === id),
      c = unitConfig(kind);
    if (!b || !c || this.unlock(kind, b) || this.data.starvingMs > 0) return 0;
    const q = this.queueFor(id);
    let count = 0;
    const limit =
      quantity === "max" ? 10 : Math.min(5, Math.max(0, Math.floor(quantity)));
    while (
      count < limit &&
      q.entries.length < QUEUE_LIMIT[b.level - 1] &&
      this.population + this.reserved + c.population <= this.capacity &&
      this.living.length +
        Object.values(this.data.queues).reduce(
          (n, q) => n + q.entries.length,
          0,
        ) <
        120
    ) {
      if (!this.economy.resources.transact(c.cost)) break;
      q.entries.push({
        id: `training-${this.data.nextId++}`,
        kind,
        progress: 0,
        paid: { ...c.cost },
      });
      count++;
    }
    if (count) {
      this.data.tutorial = Math.max(2, this.data.tutorial);
      this.checkpoint();
    }
    return count;
  }
  cancel(buildingId: string, id: string): boolean {
    const q = this.data.queues[buildingId],
      e = q?.entries.find((e) => e.id === id);
    if (!e) return false;
    q.entries = q.entries.filter((x) => x.id !== id);
    const refund: Cost = Object.fromEntries(
      Object.entries(e.paid).map(([r, n]) => [
        r,
        Math.floor(n * 0.5 * (1 - e.progress)),
      ]),
    );
    this.economy.resources.reward(refund);
    this.checkpoint();
    return true;
  }
  reorder(buildingId: string, id: string): boolean {
    const q = this.data.queues[buildingId],
      i = q?.entries.findIndex((e) => e.id === id) ?? -1;
    if (!q || i < 1) return false;
    [q.entries[i - 1], q.entries[i]] = [q.entries[i], q.entries[i - 1]];
    this.checkpoint();
    return true;
  }
  auto(id: string, kind?: UnitKind) {
    const b = this.buildings.find((b) => b.id === id);
    if (!b || (kind && this.unlock(kind, b))) return;
    this.queueFor(id).auto = kind;
    this.checkpoint();
  }
  createUnit(
    kind: UnitKind,
    side: "ally" | "enemy",
    position: { x: number; y: number },
    id?: string,
  ): UnitEntity {
    const c = unitConfig(kind),
      u = this.pool.pop() ?? ({} as UnitEntity);
    Object.assign(u, {
      id: id ?? `${side}-${this.data.nextId++}`,
      kind,
      side,
      x: position.x,
      y: position.y,
      hp: c.hp,
      xp: 0,
      rank: 1,
      squad: side,
      state: "moving",
      target: undefined,
      cooldown: 0,
      windup: 0,
      stun: 0,
      charge: true,
      nextBoost: 0,
      damage: 0,
      healing: 0,
      kills: 0,
      facing: side === "ally" ? -Math.PI / 2 : Math.PI / 2,
      spawnAt: this.economy.data.time,
      lastSphere: -10000,
      path: [],
      pathAt: 0,
      holdX: position.x,
      holdY: position.y,
    });
    return u;
  }
  spawnPosition(b: BuildingEntity): { x: number; y: number } | null {
    if (this.spawnOverride) return this.spawnOverride(b);
    const c = buildingConfig(b.type)!;
    for (let r = Math.max(c.width, c.height) / 2 + 20; r <= 80; r += 15)
      for (let i = 0; i < 12; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 6,
          p = { x: b.x + Math.cos(a) * r, y: b.y + Math.sin(a) * r };
        if (
          this.navigation.free(p) &&
          !this.living.some((u) => Math.hypot(u.x - p.x, u.y - p.y) < 13) &&
          this.navigation.path(p, { x: 290, y: 680 }).length
        )
          return p;
      }
    return null;
  }
  private complete(b: BuildingEntity) {
    const q = this.queueFor(b.id),
      e = q.entries[0];
    if (!e || e.progress < 1) return;
    const p = this.spawnPosition(b);
    if (!p) return;
    const u = this.createUnit(e.kind, this.side, p);
    this.data.units.push(u);
    q.entries.shift();
    this.data.stats.produced[e.kind] =
      (this.data.stats.produced[e.kind] ?? 0) + 1;
    this.data.morale = Math.min(100, this.data.morale + 1);
    this.data.tutorial = Math.max(3, this.data.tutorial);
    this.combat.effect({
      x: p.x,
      y: p.y,
      type: "spawn",
      text: unitConfig(e.kind).name,
      side: "ally",
    });
    this.onNotice(`${unitConfig(e.kind).name} 출격`);
    this.checkpoint();
  }
  command(command: Command) {
    this.data.command = command;
    this.data.stats.commands++;
    if (command === "defend") this.data.stats.defended = true;
    for (const u of this.living) {
      if (command === "hold" || command === "defend") {
        u.holdX = u.x;
        u.holdY = u.y;
      }
      u.pathAt = 0;
      u.target = undefined;
      u.windup = 0;
    }
    this.data.tutorial = Math.max(4, this.data.tutorial);
    this.checkpoint();
  }
  formation(formation: Formation): boolean {
    if (this.economy.data.rank < FORMATIONS[formation].rank) return false;
    this.data.formation = formation;
    if (FORMATIONS[formation].rank >= 4) this.data.stats.advanced = true;
    this.command("regroup");
    return true;
  }
  startResearch(id: string): boolean {
    const c = RESEARCH.find((r) => r.id === id),
      level = (this.data.research[id] ?? 0) + 1;
    if (
      !c ||
      level > 3 ||
      this.data.researchTask ||
      this.economy.data.rank < c.rank ||
      !this.buildings.some((b) => b.type === c.building && !b.disabled) ||
      !this.economy.resources.transact(researchCost(level))
    )
      return false;
    this.data.researchTask = { id, level, progress: 0 };
    this.checkpoint();
    return true;
  }
  hit(id: string, now: number, speed: number, valid: boolean) {
    if (!valid || speed <= 40) return;
    const b = this.buildings.find((b) => b.id === id);
    const base = FACILITIES.find((f) => f.target === id);
    const type = b?.type ?? base?.id ?? id;
    const military = buildingConfig(type)?.category === "military";
    if (b) {
      const q = this.queueFor(b.id);
      if (now - q.lastHit < 500) return;
      q.lastHit = now;
      if (military) {
        this.data.stats.hits++;
        this.data.tutorial = Math.max(3, this.data.tutorial);
      }
      if (b.disabled) return;
      const e = q.entries[0];
      if (e) {
        e.progress = Math.min(
          1,
          e.progress +
            Math.min(
              0.3,
              0.15 * (speed >= 700 ? 1.4 : 1) * (1 + (b.level - 1) * 0.05),
            ),
        );
        this.complete(b);
      }
      if (["smith", "academy", "magicSchool", "temple"].includes(type)) {
        const task = this.data.researchTask,
          c = task && RESEARCH.find((r) => r.id === task.id);
        if (task && c?.building === type)
          task.progress = Math.min(1, task.progress + 0.15);
      }
      if (
        type === "archerTower" &&
        this.data.battle?.enemies.some(
          (e) => e.hp > 0 && Math.hypot(e.x - b.x, e.y - b.y) < 180,
        )
      ) {
        b.readyAt = now + 3000;
      }
      if (type === "temple" && now > b.readyAt) {
        const wounded = this.living
          .filter((u) => u.hp < maxHp(u))
          .sort((a, b) => a.hp / maxHp(a) - b.hp / maxHp(b))[0];
        if (wounded) {
          wounded.hp = Math.min(maxHp(wounded), wounded.hp + 5);
          b.readyAt = now + 5000;
        }
      }
    }
    this.data.comboHits.push({ id: `${id}|${type}`, time: now });
    this.data.comboHits = this.data.comboHits
      .filter((h) => now - h.time <= 20000)
      .slice(-40);
    const hits = this.data.comboHits,
      types = hits.map((h) => h.id.split("|")[1]),
      recent = (t: string, window = 12000) =>
        hits.filter((h) => h.id.endsWith("|" + t) && now - h.time <= window)
          .length;
    const last = types.slice(-4),
      conditions: Record<string, boolean> = {
        recruitment:
          hits.slice(-5).length === 5 &&
          now - hits[hits.length - 5].time <= 10000 &&
          types
            .slice(-5)
            .every((t) => buildingConfig(t)?.category === "military"),
        iron:
          last.join(",") === "barracks,smith,barracks,smith" ||
          last.join(",") === "smith,barracks,smith,barracks",
        shield: ["wall", "watchtower", "archerTower"].every(
          (t) => recent(t) > 0,
        ),
        holy: recent("temple") >= 2 && recent("sanctuary") >= 2,
        cavalry: recent("stable") >= 2 && recent("bumper") >= 2,
        arcane: types.slice(-2).join(",") === "magicSchool,tower",
        offensive:
          new Set(hits.map((h) => h.id.split("|")[0])).size >= 6 &&
          types.some((t) => buildingConfig(t)?.category === "military") &&
          types.some((t) => FACILITIES.some((f) => f.id === t)),
      };
    for (const combo of MILITARY_COMBOS) {
      if (
        !conditions[combo.id] ||
        now < (this.data.comboReady[combo.id] ?? 0) ||
        Object.values(this.data.buffs).filter((t) => t > now).length >= 3
      )
        continue;
      this.data.comboReady[combo.id] = now + 30000;
      this.data.buffs[combo.id] = now + combo.duration;
      this.data.stats.combos++;
      if (this.data.battle) this.data.battle.combos++;
      this.data.morale = Math.min(100, this.data.morale + 5);
      if (combo.id === "holy")
        for (const u of this.living)
          u.hp = Math.min(maxHp(u), u.hp + maxHp(u) * 0.1);
      if (combo.id === "arcane")
        for (const u of this.living.filter((u) => u.kind === "mage"))
          u.nextBoost = 1;
      if (combo.id === "cavalry")
        for (const u of this.living.filter((u) => u.kind === "knight"))
          u.charge = true;
      this.onNotice(`${combo.name}!`);
    }
    this.checkpoint();
  }
  tick(dt: number, now: number) {
    this.accumulator += dt;
    if (this.accumulator < 0.05) return;
    const step = this.accumulator;
    this.accumulator = 0;
    this.navigation.rebuild(this.worldBuildings?.() ?? this.buildings);
    const a = this.data;
    for (const [id, q] of Object.entries(a.queues)) {
      const b = this.buildings.find((b) => b.id === id);
      if (!b) {
        for (const e of [...q.entries]) this.cancel(id, e.id);
        delete a.queues[id];
        continue;
      }
      const e = q.entries[0];
      if (e) {
        const rate = Math.min(
          3,
          TRAINING_SPEED[b.level - 1] *
            (a.buffs.recruitment > now ? 1.3 : 1) *
            (a.buffs.offensive > now ? 1.2 : 1) *
            this.productionFactor(b),
        );
        e.progress = Math.min(
          1,
          e.progress + (step / unitConfig(e.kind).seconds) * rate,
        );
        this.complete(b);
      }
      if (q.auto && q.entries.length < QUEUE_LIMIT[b.level - 1])
        this.enqueue(id, q.auto, 1);
    }
    const task = a.researchTask;
    if (task) {
      const c = RESEARCH.find((r) => r.id === task.id)!;
      const facility = this.buildings.find(
        (b) => b.type === c.building && !b.disabled,
      );
      if (facility) {
        task.progress = Math.min(
          1,
          task.progress +
            (step / (30 * task.level)) * TRAINING_SPEED[facility.level - 1],
        );
        if (task.progress >= 1) {
          a.research[task.id] = task.level;
          a.researchTask = null;
          a.stats.research++;
          this.onNotice(`${c.name} ${task.level}단계 연구 완료`);
          this.checkpoint();
        }
      }
    }
    a.upkeepMs += step * 1000;
    if (a.upkeepMs >= 30000) {
      a.upkeepMs %= 30000;
      if (
        this.upkeep &&
        !this.economy.resources.transact({ food: this.upkeep })
      ) {
        a.starvingMs = Math.max(1, a.starvingMs);
        this.onNotice("식량 부족 · 신규 훈련 제한. 농장을 타격하세요.");
      } else a.starvingMs = 0;
    }
    if (a.starvingMs) {
      if (this.economy.data.resources.food >= this.upkeep) {
        a.starvingMs = 0;
      } else {
        a.starvingMs += step * 1000;
        if (a.starvingMs > 60000)
          a.morale = Math.max(10, a.morale - step * 0.12);
      }
    }
    if (
      a.command === "retreat" &&
      !a.battle?.enemies.some(
        (e) =>
          e.hp > 0 &&
          this.living.some((u) => Math.hypot(u.x - e.x, u.y - e.y) < 100),
      )
    )
      a.morale = Math.min(75, a.morale + step * 0.5);
    if (!this.externalCombat) this.combat.update(step, now);
    if (a.battle && !this.externalCombat) {
      a.battle.time += step;
      for (const b of this.buildings) {
        if (b.type === "archerTower") {
          const p = this.navigation.closest({
            x: b.x,
            y: b.y + buildingConfig(b.type)!.height / 2 + 12,
          });
          if (p)
            this.combat.tower(b.id, p.x, p.y, b.level, now, b.readyAt > now);
        }
        if (
          b.type === "watchtower" &&
          a.battle.enemies.some(
            (u) => u.hp > 0 && Math.hypot(u.x - b.x, u.y - b.y) < 170,
          ) &&
          now > b.readyAt
        ) {
          b.readyAt = now + 10000;
          this.onNotice("감시탑: 적군 접근!");
          a.morale = Math.min(100, a.morale + 1);
        }
      }
      if (!a.battle.enemies.some((u) => u.hp > 0)) {
        if (a.battle.wave + 1 < TRAININGS[a.battle.scenario].waves.length) {
          a.battle.wave++;
          this.spawnWave();
        } else this.finish("victory");
      } else if (!this.living.length) this.finish("defeat");
      else if (a.battle.time >= 240) this.finish("defeat");
    }
    a.stats.maxPopulation = Math.max(a.stats.maxPopulation, this.population);
    a.stats.maxPower = Math.max(a.stats.maxPower, this.power);
    if (this.combat.dirty || now >= this.nextSave) {
      this.combat.dirty = false;
      this.nextSave = now + 1000;
      this.checkpoint();
    }
    // Keep bounded reusable objects; contribution records retain departed units' battle totals.
    const dead = a.units.filter((u) => u.hp <= 0);
    a.units = a.units.filter((u) => u.hp > 0);
    for (const u of dead) if (this.pool.length < 120) this.pool.push(u);
  }
  startBattle(scenario: number, mode: "practice" | "challenge"): string | null {
    const t = TRAININGS[scenario];
    if (!t || this.data.battle) return "전투를 시작할 수 없습니다.";
    if (this.economy.data.rank < t.rank)
      return `왕국 등급 ${t.rank}에서 해금됩니다.`;
    if (!this.living.length) return "먼저 병력을 생산하세요.";
    const rewardEligible =
      mode === "challenge" && !this.data.attempted.includes(scenario);
    if (mode === "challenge" && !this.data.attempted.includes(scenario))
      this.data.attempted.push(scenario);
    this.data.battle = {
      mode,
      scenario,
      time: 0,
      wave: 0,
      initial: this.living.map((u) => u.id),
      enemies: [],
      projectiles: [],
      nextProjectile: 1,
      sphereDamage: 0,
      combos: 0,
      xp: 0,
      rewardEligible,
      contributions: {},
    };
    for (const u of this.living) {
      const p = this.navigation.closest(
        formationPosition(u, this.living, this.data.formation),
      );
      if (p) {
        u.x = p.x;
        u.y = p.y;
      }
      u.charge = true;
      u.target = undefined;
      u.path = [];
      u.windup = 0;
    }
    this.data.command = "attack";
    this.data.tutorial = 5;
    this.spawnWave();
    this.checkpoint();
    return null;
  }
  private spawnWave() {
    const b = this.data.battle!;
    const wave = TRAININGS[b.scenario].waves[b.wave];
    b.enemies = [];
    let index = 0;
    for (const [kind, count] of Object.entries(wave)) {
      for (let i = 0; i < count; i++) {
        const p = this.navigation.closest({
          x: 150 + (index % 12) * 25,
          y: 120 + Math.floor(index / 12) * 24,
        });
        if (!p) continue;
        const u = this.createUnit(
          kind as UnitKind,
          "enemy",
          p,
          `enemy-${b.wave}-${index++}`,
        );
        if (b.scenario === 4 && b.wave === 1 && index === 1) {
          u.rank = 5;
          u.hp = maxHp(u) * 1.25;
          u.squad = "commander";
        }
        b.enemies.push(u);
      }
    }
    this.onNotice(
      `${TRAININGS[b.scenario].name} · 적 ${b.enemies.length}기 출현`,
    );
  }
  finish(outcome: BattleRecord["outcome"]) {
    const b = this.data.battle;
    if (!b) return;
    const reward: Cost =
      outcome === "victory" &&
      b.mode === "challenge" &&
      !this.data.completed.includes(b.scenario)
        ? { ...TRAININGS[b.scenario].reward }
        : {};
    if (outcome === "victory") {
      this.data.morale = Math.min(100, this.data.morale + 8);
      this.data.stats.victories++;
      if (b.mode === "challenge" && !this.data.completed.includes(b.scenario)) {
        this.data.completed.push(b.scenario);
        this.economy.resources.reward(reward);
      }
    }
    const survivors = this.living.filter((u) =>
      b.initial.includes(u.id),
    ).length;
    const damage = Object.fromEntries(
        Object.entries(b.contributions).map(([id, c]) => [id, c.damage]),
      ),
      healing = Object.fromEntries(
        Object.entries(b.contributions).map(([id, c]) => [id, c.healing]),
      );
    const record: BattleRecord = {
      mode: b.mode,
      scenario: b.scenario,
      outcome,
      seconds: b.time,
      initial: b.initial.length,
      survivors,
      losses: b.initial.length - survivors,
      kills:
        TRAININGS[b.scenario].waves
          .slice(0, b.wave)
          .reduce(
            (s, w) => s + Object.values(w).reduce((v, n) => v + n, 0),
            0,
          ) + b.enemies.filter((u) => u.hp <= 0).length,
      damage,
      healing,
      sphereDamage: b.sphereDamage,
      combos: b.combos,
      xp: b.mode === "practice" ? 0 : b.xp,
      reward,
    };
    this.data.lastResult = record;
    this.data.history.unshift(record);
    this.data.history = this.data.history.slice(0, 10);
    this.data.battle = null;
    this.data.tutorial = 6;
    this.data.command = "regroup";
    this.checkpoint();
    this.onResult(record);
  }
  get goals() {
    const a = this.data;
    return [
      [
        "barracks",
        "병영 건설",
        this.buildings.some((b) => b.type === "barracks"),
      ],
      ["first", "첫 검병 생산", (a.stats.produced.swordsman ?? 0) > 0],
      ["hits", "군사시설 5회 타격", a.stats.hits >= 5],
      ["basic", "기본 도전 승리", a.completed.includes(0)],
      ["command", "명령 사용", a.stats.commands > 0],
      ["pop15", "인구 15 달성", a.stats.maxPopulation >= 15],
      ["variety", "병력 3종 생산", Object.keys(a.stats.produced).length >= 3],
      ["combo", "군사 콤보", a.stats.combos > 0],
      ["research", "연구 완료", a.stats.research > 0],
      ["sphere", "스피어로 적 처치", a.stats.sphereKills > 0],
      ["defend", "방어 명령", a.stats.defended],
      ["pop40", "인구 40 달성", a.stats.maxPopulation >= 40],
      ["elite", "정예병 보유", this.living.some((u) => u.rank >= 4)],
      [
        "level5",
        "군사시설 Lv.5",
        this.buildings.some(
          (b) =>
            b.level === 5 && buildingConfig(b.type)?.category === "military",
        ),
      ],
      ["formation", "고급 진형 활용", a.stats.advanced],
      ["royal", "왕실 도전 승리", a.completed.includes(4)],
      ["power", "군사력 1,000", a.stats.maxPower >= 1000],
    ].map(([id, name, done]) => ({
      id: String(id),
      name: String(name),
      done: !!done,
    }));
  }
  claim(id: string): boolean {
    if (
      this.data.claimed.includes(id) ||
      !this.goals.find((g) => g.id === id)?.done
    )
      return false;
    this.data.claimed.push(id);
    this.economy.resources.reward({ gold: 20, food: 15 });
    this.checkpoint();
    return true;
  }
}
