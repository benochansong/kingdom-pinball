import { randomUUID } from "node:crypto";
import { GameStateManager } from "../src/core/GameStateManager";
import { SaveManager } from "../src/systems/SaveManager";
import { EconomySaveManager } from "../src/economy/EconomySaveManager";
import { EconomyManager } from "../src/economy/EconomyManager";
import { ArmyManager } from "../src/army/ArmyManager";
import { survivalWave } from "../src/modes/SurvivalManager";
import { BossManager } from "../src/campaign/BossManager";
import { freshMission } from "../src/campaign/CampaignSaveManager";
import { BUILDING_HEALTH } from "../src/config/war";
import { WarSaveManager } from "../src/war/WarSaveManager";
import { freshWar, WarManager } from "../src/war/WarManager";
import { PinballPhysics } from "../src/physics/PinballPhysics";
import { MagicManager } from "../src/magic/MagicManager";
import { applyBuildings } from "../src/building/BuildingPhysicsAdapter";
import {
  validatePlacement,
  distanceToBuilding,
} from "../src/building/PlacementValidator";
import { scaleCost } from "../src/building/BuildingManager";
import { freshProduction, type BuildingEntity } from "../src/building/types";
import { buildingConfig, BUILD_LIMITS } from "../src/config/buildings";

import { PHYSICS } from "../src/config/physics";
import { MAGIC_RESEARCH, ELEMENTS, SPELLS } from "../src/config/magic";
import { UNITS, FORMATIONS } from "../src/config/army";
import { maxHp } from "../src/army/DamageCalculator";
import type { Side, WarOrder, Lane } from "../src/war/types";
import type {
  RoomRules,
  GameCommand,
  Snapshot,
  MatchResult,
} from "../src/network/protocol";
import { isRecord } from "../src/network/protocol";
const noStorage = { getItem: () => null, setItem: () => {} };
import { ONLINE_TARGETS } from "../src/network/table";
const finite = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
export class ServerSimulation {
  boss?: BossManager;
  private nextWave = 0;
  private waveStarted = false;
  private cooperativeUnits = 0;
  private comboHits = [-10000, -10000];
  private comboUntil = 0;
  private comboReady = 0;
  private multiTimes = [-10000, -10000];
  private teamShield = 0;
  get cooperative() {
    return this.rules.mode !== "duel";
  }
  readonly id = randomUUID();
  readonly war: WarManager;
  readonly games: GameStateManager[] = [];
  readonly ready = [false, false];
  readonly ack = [0, 0];
  readonly hits = [0, 0];
  readonly lost = [0, 0];
  readonly support = [0, 0];
  readonly inputs = [0, 0];
  readonly respawn = [0, 0];
  readonly signals: Snapshot["signals"] = [];
  readonly lastSignal = [-10000, -10000];
  readonly work: {
    seat: number;
    b: BuildingEntity;
    remaining: number;
    upgrade?: string;
  }[] = [];
  result: MatchResult | null = null;
  time = 0;
  tick = 0;
  wave = 0;
  private supportAt = [0, 0];
  private layoutKey = "";
  private nextId = 10000;
  constructor(readonly rules: RoomRules) {
    const data = freshWar({
      preparation: rules.preparation,
      limit: 0,
      tutorial: false,
    });
    // Standard rules discard every campaign modifier and normalize both seats.
    data.structures = data.structures.filter(
      (s) => s.side === "ally" && !s.fixed,
    );
    const original = [...data.structures];
    for (const s of original) {
      s.x = s.castle ? 300 : s.x;
      s.y = s.castle ? 680 : 580;
      data.structures.push({
        ...s,
        id: `building-${100000 + Number(s.id.split("-")[1])}`,
        side: "enemy",
        y: 900 - s.y,
      });
    }
    for (const [i, e] of [data.player, data.enemy].entries()) {
      e.rank = 5;
      e.storageLevel = 3;
      e.resources = {
        wood: 350,
        stone: 300,
        gold: 350,
        food: 300,
        mana: 80,
        energy: 100,
      };
      e.building!.buildings = e.building!.buildings.map((b) => ({
        ...b,
        id: `p${i}-${b.id}`,
        x: 300,
        y: i ? 370 : 530,
      }));
      e.building!.nextId = 100000 * (i + 1);
    }
    this.war = new WarManager(data, new WarSaveManager(noStorage));
    this.war.ai.update = () => {};
    this.war.checkpoint = () => {};
    this.war.orders = {
      ally: { order: "defend", lane: "center" },
      enemy: { order: "defend", lane: "center" },
    };
    this.war.objectiveControlled = true;
    // Match results are settled once, after both physics tables and the shared combat tick.
    this.war.onEnd = () => {};
    for (let i = 0; i < 2; i++) {
      const side: Side = this.side(i);
      const g = new GameStateManager(
        new SaveManager(noStorage),
        new EconomySaveManager(noStorage),
        new WarSaveManager(noStorage),
      );
      g.physics.dispose();
      g.physics = new PinballPhysics(ONLINE_TARGETS);
      g.physics.spawn();
      g.mode = "kingdom";
      g.state = "playing";
      g.war = this.war;
      g.economy = this.war.economy(side);
      g.army = this.war.troops(side);
      g.checkpoint = () => {};
      if (this.cooperative && i === 1) {
        const own = structuredClone(data.player);
        own.id = "cooperative-player-2";
        own.army = undefined;
        own.building!.buildings = own.building!.buildings.map((b, index) => ({
          ...b,
          id: `building-${300000 + index}`,
          x: 180,
        }));
        g.economy = new EconomyManager(own, new EconomySaveManager(noStorage));
        g.economy.checkpoint = () => {};
        g.army = new ArmyManager(g.economy);
        g.army.externalCombat = true;
        g.army.spawnOverride = () =>
          this.war.army.navigation.closest({ x: 180, y: 650 });
        g.army.worldBuildings = () => this.war.navigationBuildings;
        g.army.navigation.rebuild(this.war.navigationBuildings);
      }
      g.magic = new MagicManager(g, side, true);
      for (const r of MAGIC_RESEARCH) g.magic.data.research[r.id] = 1;
      // Official online loadout has equal unlocks; payment, cooldowns and charge still apply.
      g.magic.locked = (id) =>
        id === "steel" || MAGIC_RESEARCH.some((r) => r.id === id)
          ? null
          : "알 수 없는 마법";
      g.physics.onHit = ({ target, normalSpeed, ball }) => {
        g.physics.kick(target, ball);
        if (
          !g.physics.launched ||
          g.tilt.tilted ||
          g.time < g.recovery.suppressUntil ||
          !g.magic!.balls!.valid(ball, g.time)
        )
          return;
        const score = g.score.hit(target, g.time, true);
        if (!score) return;
        this.hits[i]++;
        g.magic!.charge(0, 2, 1);
        g.economy!.harvest(
          target.id,
          normalSpeed,
          true,
          g.magic!.rewardFactor(ball, target.kind),
        );
        g.army!.hit(target.id, g.time, normalSpeed, true);
        g.magic!.validHit(target.id, target.kind, ball);
        if (target.id.startsWith("online-")) this.hitSupport(i, target.id);
      };
      g.physics.onBuildingHit = (id, speed, ball) => {
        const b = g.economy!.data.building!.buildings.find((b) => b.id === id);
        if (
          !b ||
          b.disabled ||
          speed < 40 ||
          !g.physics.launched ||
          g.tilt.tilted ||
          g.time - b.lastHit < 500 ||
          !g.magic!.balls!.valid(ball, g.time)
        )
          return;
        b.lastHit = g.time;
        this.hits[i]++;
        g.magic!.charge(0, 2, 1);
        g.army!.hit(id, g.time, speed, true);
        g.economy!.harvest(id, speed, true);
        g.magic!.validHit(id, b.type, ball);
        if (buildingConfig(b.type)?.category === "military") this.teamCombo(i);
      };
      this.games.push(g);
    }
    const combat = this.war.army.combat;
    combat.movementFactor = (u) =>
      Math.min(...this.games.map((g) => g.magic!.status.movement(u.id)));
    combat.intervalFactor = (u) =>
      Math.max(...this.games.map((g) => g.magic!.status.interval(u.id)));
    combat.damageFilter = (u, n) =>
      this.games.reduce((amount, g) => g.magic!.damageFilter(u, amount), n);
    this.war.damageFilter = (s, n) =>
      this.games.reduce((amount, g) => g.magic!.damageFilter(s, amount), n);
    if (this.cooperative) {
      this.war.army.populationFilter = (u) =>
        u.kingdomId !== "cooperative-player-2";
      this.nextWave = rules.preparation * 1000;
      this.war.orders!.enemy = { order: "frontline", lane: "center" };
      this.war.army.productionFactor = () =>
        this.time < this.comboUntil ? 1.5 : 1;
      this.games[1].army!.productionFactor = () =>
        this.time < this.comboUntil ? 1.5 : 1;
      const baseFilter = this.war.damageFilter;
      this.war.damageFilter = (s, n) =>
        baseFilter(
          s,
          s.side === "ally" && this.time < this.teamShield ? n * 0.65 : n,
        );
      this.syncPartnerBuildings();
      if (rules.mode === "raid")
        this.boss = new BossManager(this.games[0], {
          id: this.id,
          stage: "3-3",
          difficulty: "normal",
          war: data,
          mission: freshMission(),
          settled: false,
          elite: true,
          event: false,
          stars: [],
          reasons: [],
          reward: "",
        });
    }
    this.layout();
  }
  private side(seat: number): Side {
    return !this.cooperative && seat ? "enemy" : "ally";
  }
  private local(b: BuildingEntity, seat: number) {
    const mirror = !this.cooperative && seat;
    return {
      ...b,
      y: mirror ? 900 - b.y : b.y,
      angle: mirror ? -b.angle : b.angle,
    };
  }
  private syncPartnerBuildings() {
    if (!this.cooperative) return;
    for (const b of this.games[1].economy!.data.building!.buildings) {
      const old = this.war.structure(b.id);
      if (old) {
        if (old.level !== b.level) {
          const ratio = old.hp / old.maxHp;
          old.level = b.level;
          old.maxHp =
            (BUILDING_HEALTH[b.type]?.[0] ?? 350) * (1 + (b.level - 1) * 0.35);
          old.hp = ratio * old.maxHp;
        }
        b.disabled = old.hp <= 0;
        continue;
      }
      const [hp, armor] = BUILDING_HEALTH[b.type] ?? [350, 10];
      this.war.data.structures.push({
        id: b.id,
        type: b.type,
        side: "ally",
        x: b.x,
        y: b.y,
        angle: b.angle,
        level: b.level,
        hp,
        maxHp: hp,
        armor,
        lastDamage: -10000,
        lastSphere: -10000,
        repairReady: 0,
        defense: ["wall", "archerTower"].includes(b.type),
      });
    }
  }
  private teamCombo(seat: number) {
    if (!this.cooperative) return;
    this.comboHits[seat] = this.time;
    if (
      this.time >= this.comboReady &&
      Math.abs(this.comboHits[0] - this.comboHits[1]) <= 3000
    ) {
      this.comboReady = this.time + 15000;
      this.comboUntil = this.time + 5000;
      this.teamShield = this.time + 5000;
      this.signals.push({
        seat,
        signal: 10,
        x: 300,
        y: 680,
        until: this.time + 5000,
      });
    }
  }
  private cooperativeStep() {
    if (!this.cooperative) return;
    const a = this.games[1].army!;
    // The shared combat owns dead-unit pooling; producer B retains live references only.
    a.data.units = a.data.units.filter((u) => u.hp > 0);
    a.tick(1 / 30, this.time);
    for (const u of a.data.units)
      if (!this.war.army.data.units.includes(u)) {
        u.id = `coop-${this.cooperativeUnits++}`;
        u.side = "ally";
        u.squad = "deployed";
        u.kingdomId = "cooperative-player-2";
        this.war.army.data.units.push(u);
      }
    this.syncPartnerBuildings();
    if (this.war.preparing) return;
    if (this.rules.mode === "raid") {
      this.boss?.tick();
      if (this.boss && !this.boss.unit?.hp) {
        this.finish(0, "협동 IRON TITAN 격파");
        return;
      }
    }
    if (
      this.time >= this.nextWave &&
      (!this.waveStarted ||
        !this.war.enemyArmy.living.length ||
        this.rules.mode === "raid")
    ) {
      this.wave++;
      this.waveStarted = true;
      const wave = survivalWave(this.wave, 7021);
      const kinds = [
        ...wave.units,
        ...wave.units.slice(0, Math.ceil(wave.units.length / 2)),
      ];
      for (const [i, kind] of kinds.entries()) {
        if (this.war.enemyArmy.living.length >= 60) break;
        const p = this.war.enemyArmy.navigation.closest({
          x: i % 2 ? 455 : 130,
          y: 240 + (i % 3) * 18,
        });
        if (!p) continue;
        const u = this.war.enemyArmy.createUnit(kind, "enemy", p);
        u.squad = "deployed";
        u.rank = wave.rank;
        this.war.enemyArmy.data.units.push(u);
      }
      this.nextWave = this.time + (this.rules.mode === "raid" ? 45000 : 15000);
      if (this.wave > 1)
        for (const g of this.games)
          g.economy!.resources.reward({
            wood: 30,
            stone: 20,
            gold: 30,
            food: 50,
            mana: 8,
          });
    }
  }
  private layout() {
    const key = this.games
      .map((g) =>
        g
          .economy!.data.building!.buildings.map(
            (b) => `${b.id}:${b.level}:${b.disabled}`,
          )
          .join(","),
      )
      .join("|");
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    for (const [i, g] of this.games.entries())
      applyBuildings(
        g.physics,
        g.economy!.data.building!.buildings.map((b) => this.local(b, i)),
      );
  }
  private hitSupport(seat: number, id: string) {
    if (this.war.preparing || this.time < this.supportAt[seat]) return;
    this.supportAt[seat] = this.time + 1000;
    const side = this.side(seat),
      enemy: Side = side === "ally" ? "enemy" : "ally",
      g = this.games[seat],
      w = this.war;
    if (id === "online-heal") {
      const u = w
        .troops(side)
        .living.filter((u) => u.hp < maxHp(u))
        .sort((a, b) => a.hp - b.hp)[0];
      if (u) g.magic!.heal(u, 18);
      else {
        const c = w.castle(side);
        c.hp = Math.min(c.maxHp, c.hp + 3);
      }
      this.teamCombo(seat);
    } else if (id === "online-siege") {
      const s =
        w.data.structures.find(
          (s) => s.side === enemy && s.defense && s.hp > 0,
        ) ?? w.castle(enemy);
      const before = s.hp;
      w.damageStructure(s.id, 32, "sphere", side);
      this.support[seat] += before - s.hp;
      g.magic!.direct(s, before - s.hp, g.physics.ball);
    } else {
      const u = w.troops(enemy).living[0];
      if (u) {
        const before = u.hp;
        g.magic!.deal(u, 22, "steel", true);
        this.support[seat] += before - u.hp;
      }
    }
  }
  command(seat: number, raw: unknown): string | null {
    if (this.result) return "이미 종료된 경기입니다.";
    if (!isRecord(raw) || typeof raw.type !== "string")
      return "잘못된 명령입니다.";
    const c = raw as unknown as GameCommand,
      g = this.games[seat],
      e = g.economy!,
      a = g.army!,
      m = g.magic!,
      side = this.side(seat);
    switch (c.type) {
      case "input":
        if (
          typeof c.left !== "boolean" ||
          typeof c.right !== "boolean" ||
          typeof c.launch !== "boolean"
        )
          return "잘못된 입력";
        g.flipper("left", c.left);
        g.flipper("right", c.right);
        if (c.launch) g.chargeStart();
        else g.chargeRelease();
        this.inputs[seat] = this.time;
        return null;
      case "nudge":
        g.nudge();
        return null;
      case "surrender":
        this.finish(this.cooperative ? 1 : 1 - seat, "항복");
        return null;
      case "battleReady":
        this.ready[seat] = true;
        if (this.ready.every(Boolean)) {
          this.war.data.options.preparation = this.time / 1000;
          this.nextWave = Math.min(this.nextWave, this.time);
        }
        return null;
      case "build": {
        if (
          typeof c.kind !== "string" ||
          !finite(c.x, 70, 510) ||
          !finite(c.y, 400, 690) ||
          !finite(c.angle, -180, 180)
        )
          return "보호 구역 안에 배치하세요.";
        const cfg = buildingConfig(c.kind),
          bs = e.data.building!.buildings,
          queued = this.work.filter((w) => w.seat === seat);
        if (
          !cfg ||
          cfg.id === "warCastle" ||
          e.data.rank < cfg.rank ||
          bs.length + queued.length >= BUILD_LIMITS[e.data.rank - 1] ||
          bs.filter((b) => b.type === c.kind).length +
            queued.filter((w) => w.b.type === c.kind).length >=
            cfg.limit
        )
          return "건설 한도 또는 해금 조건";
        const b: BuildingEntity = {
          id: `building-${400000 + this.nextId++}`,
          type: c.kind,
          x: c.x,
          y: c.y,
          angle: c.angle,
          level: 1,
          paid: { ...cfg.cost },
          production: freshProduction(),
          charge: 0,
          lastHit: -10000,
          readyAt: 0,
          owner: side,
        };
        if (
          ONLINE_TARGETS.some((t) => distanceToBuilding(t, b) < t.radius + 30)
        )
          return "온라인 목표물의 통로를 확보하세요.";
        const err = validatePlacement(
          b,
          [...bs, ...queued.map((w) => w.b)].map((b) => this.local(b, seat)),
          e.data.building!.territories,
        );
        if (err) return err;
        const cost = scaleCost(
          cfg.cost,
          1 + 0.25 * bs.filter((b) => b.type === c.kind).length,
        );
        b.paid = cost;
        if (!e.resources.transact(cost)) return "건설 자원이 부족합니다.";
        if (seat && !this.cooperative) {
          b.y = 900 - b.y;
          b.angle = -b.angle;
        }
        this.work.push({ seat, b, remaining: 12 });
        return null;
      }
      case "upgrade": {
        if (typeof c.id !== "string" || !Number.isInteger(c.level))
          return "잘못된 강화 요청";
        const b = e.data.building!.buildings.find((b) => b.id === c.id);
        if (
          !b ||
          b.disabled ||
          b.level !== c.level ||
          b.level >= 5 ||
          this.work.some((w) => w.upgrade === b.id)
        )
          return "강화할 본인 시설을 확인하세요.";
        if (
          !e.resources.transact(
            scaleCost(buildingConfig(b.type)!.cost, 0.6 * b.level),
          )
        )
          return "강화 자원이 부족합니다.";
        this.work.push({
          seat,
          b: { ...b, level: b.level + 1 },
          remaining: 12,
          upgrade: b.id,
        });
        return null;
      }
      case "train":
        if (
          typeof c.id !== "string" ||
          !UNITS.some((u) => u.id === c.kind) ||
          !Number.isInteger(c.count) ||
          c.count < 1 ||
          c.count > 5
        )
          return "잘못된 생산 명령";
        return a.enqueue(c.id, c.kind, c.count)
          ? null
          : "시설·비용·인구·생산 대기열을 확인하세요.";
      case "order":
        if (
          ![
            "defend",
            "frontline",
            "economy",
            "military",
            "siege",
            "castle",
            "retreat",
          ].includes(c.order) ||
          !["left", "center", "right"].includes(c.lane)
        )
          return "잘못된 지휘";
        this.war.orders![side] = {
          order: c.order as WarOrder,
          lane: c.lane as Lane,
        };
        a.command(
          c.order === "defend"
            ? "defend"
            : c.order === "retreat"
              ? "retreat"
              : "attack",
        );
        for (const u of a.living) u.squad = "deployed";
        return null;
      case "formation":
        if (!Object.hasOwn(FORMATIONS, c.formation)) return "잘못된 진형";
        a.data.formation = c.formation;
        if (this.cooperative) this.war.army.data.formation = c.formation;
        return null;
      case "repair":
        if (typeof c.id !== "string" || this.war.structure(c.id)?.side !== side)
          return "본인 시설만 수리할 수 있습니다.";
        return this.war.repair(c.id, false, side, e);
      case "element":
        if (!this.rules.magic || !ELEMENTS.some((v) => v.id === c.element))
          return "허용되지 않은 속성";
        return m.activate(c.element);
      case "spell":
        if (!this.rules.magic || !SPELLS.some((v) => v.id === c.spell))
          return "허용되지 않은 주문";
        return m.cast(c.spell);
      case "multi": {
        if (
          !this.rules.magic ||
          !this.rules.multiball ||
          typeof c.storm !== "boolean"
        )
          return "멀티볼이 비활성화되었습니다.";
        const err = m.multiball(c.storm);
        if (!err && this.cooperative) {
          this.multiTimes[seat] = this.time;
          if (Math.abs(this.multiTimes[0] - this.multiTimes[1]) < 5000) {
            this.teamShield = this.time + 8000;
            this.war.army.data.morale = Math.min(
              100,
              this.war.army.data.morale + 10,
            );
          }
        }
        return err;
      }
      case "transfer": {
        if (
          !this.cooperative ||
          !["wood", "stone", "gold", "food", "mana"].includes(c.resource) ||
          !Number.isSafeInteger(c.amount) ||
          c.amount < 1 ||
          c.amount > 1000
        )
          return "잘못된 협동 자원 지원";
        const target = this.games[1 - seat].economy!.resources;
        if (
          e.data.resources[c.resource] < c.amount ||
          target.space(c.resource) < c.amount
        )
          return "보유량 또는 받는 왕국의 창고 한도를 확인하세요.";
        if (!e.resources.transact({ [c.resource]: c.amount }))
          return "자원이 부족합니다.";
        target.grant(c.resource, c.amount);
        return null;
      }
      case "research":
        if (
          typeof c.id !== "string" ||
          !MAGIC_RESEARCH.some((r) => r.id === c.id)
        )
          return "잘못된 연구";
        return m.research(c.id);
      case "ping":
        if (
          !Number.isInteger(c.signal) ||
          c.signal < 0 ||
          c.signal > 10 ||
          !finite(c.x, 0, 600) ||
          !finite(c.y, 0, 900) ||
          this.time - this.lastSignal[seat] < 2000
        )
          return "신호는 2초마다 보낼 수 있습니다.";
        this.lastSignal[seat] = this.time;
        this.signals.push({
          seat,
          signal: c.signal,
          x: c.x,
          y: c.y,
          until: this.time + 5000,
        });
        return null;
      default:
        return "허용되지 않은 명령입니다.";
    }
  }
  step() {
    if (this.result) return;
    this.tick++;
    for (let n = 0; n < 8; n++) {
      this.time += PHYSICS.stepMs;
      for (const [i, g] of this.games.entries()) {
        g.time = this.time;
        g.economy!.tick(this.time);
        g.tilt.update(PHYSICS.stepMs / 1000);
        if (this.time - this.inputs[i] > 1500) g.clearInputs();
        if (g.charging)
          g.charge = Math.min(
            1,
            g.charge + PHYSICS.stepMs / PHYSICS.launcher.chargeMs,
          );
        g.score.combo.tick(this.time);
        g.physics.step(PHYSICS.stepMs / 1000, !g.tilt.tilted);
        g.magic!.tick(PHYSICS.stepMs / 1000);
        g.magic!.balls!.recover(PHYSICS.stepMs / 1000, this.time);
        g.magic!.balls!.drain(this.time);
        const recovery = g.recovery.update(
          g.physics,
          PHYSICS.stepMs / 1000,
          this.time,
        );
        if (recovery === "return") {
          g.physics.spawn();
          g.economy!.data.launchState = "ready";
        }
        if (g.physics.ball && g.physics.ball.position.y > PHYSICS.drainY) {
          g.physics.removeBall();
          g.magic!.endMulti();
          g.clearInputs();
          g.score.combo.reset();
          this.lost[i]++;
          g.economy!.loseBall();
          this.respawn[i] = this.time + 3000;
        }
        if (!g.physics.ball && this.time >= this.respawn[i]) {
          if (g.economy!.payRelaunch()) {
            g.physics.spawn();
            g.tilt.reset();
            g.recovery.reset();
          } else {
            g.economy!.resources.grant("energy", 20);
            this.respawn[i] = this.time + 15000;
          }
        }
      }
    }
    for (const w of this.work) w.remaining -= 1 / 30;
    for (let j = this.work.length - 1; j >= 0; j--) {
      const w = this.work[j];
      if (w.remaining > 0) continue;
      const g = this.games[w.seat],
        b = this.local(w.b, w.seat),
        cfg = buildingConfig(b.type)!;
      if (
        g.physics.balls.some(
          (ball) =>
            Math.hypot(ball.position.x - b.x, ball.position.y - b.y) <
            Math.hypot(cfg.width, cfg.height) / 2 + 16,
        )
      )
        continue;
      if (w.upgrade) {
        const original = g.economy!.data.building!.buildings.find(
          (b) => b.id === w.upgrade,
        );
        if (original) original.level = w.b.level;
      } else g.economy!.data.building!.buildings.push(w.b);
      this.work.splice(j, 1);
      this.war.syncStructures();
      this.war.layout();
    }
    this.cooperativeStep();
    for (const u of this.war.enemyArmy.living)
      if (u.squad === "enemy" || u.squad === "reserve") u.squad = "deployed";
    this.war.tick(1 / 30, this.time);
    this.layout();
    const hp = [this.war.castle("ally").hp, this.war.castle("enemy").hp];
    if (hp.some((h) => h <= 0))
      this.finish(
        hp.every((h) => h <= 0) ? null : hp[0] <= 0 ? 1 : 0,
        "왕궁 파괴",
      );
    else if (this.time >= this.rules.limit * 1000) {
      const ratios = hp.map((v, i) => v / this.war.castle(this.side(i)).maxHp);
      const defenses = [0, 1].map(
        (i) =>
          this.war.data.structures.filter(
            (s) => s.side === this.side(i) && s.defense && s.hp > 0,
          ).length,
      );
      this.finish(
        ratios[0] === ratios[1]
          ? defenses[0] === defenses[1]
            ? null
            : defenses[0] > defenses[1]
              ? 0
              : 1
          : ratios[0] > ratios[1]
            ? 0
            : 1,
        "시간 종료 · 왕궁 체력 비율, 생존 방어시설 순",
      );
    }
    for (let i = this.signals.length - 1; i >= 0; i--)
      if (this.signals[i].until < this.time) this.signals.splice(i, 1);
  }
  finish(winner: number | null, reason: string) {
    if (this.result) return;
    this.result = {
      id: this.id,
      mode: this.rules.mode,
      winner,
      reason,
      seconds: this.time / 1000,
      castles: ["ally", "enemy"].map((s) => this.war.castle(s as Side).hp),
      wave: this.wave,
      stats: this.games.map((g, i) => ({
        hits: this.hits[i],
        score: g.score.score,
        combo: g.score.combo.max,
        lost: this.lost[i],
        support: this.support[i],
        produced: g.economy!.data.produced,
        army: g.army!.data.stats,
        magic: g.magic!.data.stats,
      })),
      at: new Date().toISOString(),
    };
    for (const g of this.games) g.clearInputs();
  }
  snapshot(seat: number): Snapshot {
    const g = this.games[seat],
      other = this.games[1 - seat];
    const table = (game: GameStateManager) => ({
      balls: game.physics.balls.map((b) => ({
        id: b.id,
        x: b.position.x,
        y: b.position.y,
        vx: b.velocity.x * 60,
        vy: b.velocity.y * 60,
        element: game.magic!.balls!.state(b)?.type ?? "steel",
      })),
      flippers: [game.physics.left.angle, game.physics.right.angle],
    });
    return {
      boss: this.boss
        ? {
            id: this.boss.state.id,
            hp: this.boss.unit?.hp ?? 0,
            maxHp: this.boss.state.maxHp,
            armor: this.boss.state.armor,
            phase: this.boss.state.phase,
            warning: this.boss.state.warning,
          }
        : undefined,
      type: "snapshot",
      match: this.id,
      tick: this.tick,
      ack: this.ack[seat],
      time: this.time,
      seat,
      preparation: this.war.data.options.preparation,
      wave: this.wave,
      self: {
        ...table(g),
        charge: g.charge,
        resources: { ...g.economy!.data.resources },
        buildings: g.economy!.data.building!.buildings.map((b) =>
          this.local(b, seat),
        ),
        queues: g.army!.data.queues,
        work: this.work
          .filter((w) => w.seat === seat)
          .map((w) => ({ ...this.local(w.b, seat), remaining: w.remaining })),
        magic: g.magic!.data,
        hits: this.hits[seat],
        score: g.score.score,
        energyWait: Math.max(0, this.respawn[seat] - this.time),
      },
      opponent: table(other),
      battlefield: {
        units: this.war.army.combat.units
          .filter((u) => u.hp > 0)
          .map((u) => ({
            id: u.id,
            kind: u.kind,
            side: u.side,
            x: u.x,
            y: u.y,
            hp: u.hp,
            maxHp: maxHp(u),
            state: u.state,
          })),
        structures: this.war.data.structures
          .filter((s) => s.castle || s.defense)
          .map((s) => ({
            id: s.id,
            type: s.type,
            side: s.side,
            x: s.x,
            y: s.y,
            hp: s.hp,
            maxHp: s.maxHp,
            castle: !!s.castle,
          })),
        effects: this.games.flatMap((g) =>
          g.magic!.effects.map((e) => ({ x: e.x, y: e.y, type: e.type })),
        ),
      },
      signals: [...this.signals],
      result: this.result,
    };
  }
  disconnect(seat: number) {
    this.games[seat].clearInputs();
  }
  dispose() {
    for (const g of this.games) g.dispose();
  }
}
