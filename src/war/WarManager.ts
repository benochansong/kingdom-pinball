import { EconomyManager } from "../economy/EconomyManager";
import {
  EconomySaveManager,
  freshEconomy,
} from "../economy/EconomySaveManager";
import { ArmyManager } from "../army/ArmyManager";
import {
  freshBuildings,
  freshProduction,
  type BuildingEntity,
  type BlueprintItem,
} from "../building/types";
import { BuildingManager, scaleCost } from "../building/BuildingManager";
import { buildingConfig, BUILD_LIMITS } from "../config/buildings";
import { FACILITIES, RESOURCE_IDS } from "../config/economy";
import { unitConfig } from "../config/army";
import {
  fixedBlocked,
  validatePlacement,
} from "../building/PlacementValidator";
import { maxHp, attackPower, awardXp } from "../army/DamageCalculator";
import type { UnitEntity, Projectile } from "../army/types";
import {
  CASTLE_HP,
  CASTLE_COST,
  BUILDING_HEALTH,
  DEFAULT_WAR,
  DIFFICULTIES,
  SIEGE_MULTIPLIER,
  WAR_TARGETS,
} from "../config/war";
import { WarSaveManager, warOptions, freshStats } from "./WarSaveManager";
import type {
  WarData,
  WarOptions,
  Side,
  Structure,
  WarOrder,
  Lane,
  Intel,
} from "./types";
import { EnemyAI } from "./EnemyAI";
const noStorage = { getItem: () => null, setItem: () => {} };
const laneX = (l: Lane) => (l === "left" ? 130 : l === "right" ? 455 : 300);
export function freshWar(options: Partial<WarOptions> = {}): WarData {
  const o = warOptions({ ...DEFAULT_WAR, ...options }),
    player = freshEconomy(),
    enemy = freshEconomy();
  for (const [index, d] of [player, enemy].entries()) {
    d.id = `${d.id}-${index ? "enemy" : "ally"}`;
    d.building = freshBuildings();
    d.building.territories = ["central", "west", "east", "north", "outer"];
    d.building.tutorialDone = true;
    d.tutorialDone = true;
    d.resources = {
      wood: 200,
      stone: 160,
      gold: 150,
      food: 120,
      mana: 0,
      energy: 100,
    };
    if (o.resources === "scarce")
      for (const k of ["wood", "stone", "gold", "food"] as const)
        d.resources[k] = Math.floor(d.resources[k] * 0.75);
    d.building.nextId = index ? 1010 : 1;
  }
  const w: WarData = {
    version: 1,
    id: `war-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    options: o,
    time: 0,
    phase: "preparation",
    player,
    enemy,
    structures: [],
    work: [],
    nextId: 2000,
    order: "defend",
    lane: "center",
    ai: {
      strategy: "economy",
      since: 0,
      nextThink: 0,
      nextHarvest: 3000,
      harvestIndex: 0,
      nextAttack: o.preparation * 1000 + 60000,
      wave: 0,
      lane: "center",
      warningAt: 0,
      lastStand: false,
      abilityAt: 0,
      abilityWarning: 0,
      intel: null,
    },
    intel: null,
    projectiles: [],
    nextProjectile: 1,
    comboHits: [],
    buffs: {},
    cooldowns: {},
    logs: [],
    tutorial: 0,
    tutorialDone: !o.tutorial,
    emergencyCharges: 0,
    relaunchGrace: 0,
    stats: freshStats(),
    result: null,
  };
  const make = (
    side: Side,
    id: string,
    type: string,
    x: number,
    y: number,
    fixed?: string,
    castle = false,
  ) => {
    const b = BUILDING_HEALTH[type] ?? [350, 10],
      hp = castle ? 1000 : b[0];
    w.structures.push({
      id,
      side,
      type,
      x,
      y,
      angle: 0,
      level: 1,
      hp,
      maxHp: hp,
      armor: castle ? 10 : b[1],
      lastDamage: -10000,
      lastSphere: -10000,
      repairReady: 0,
      fixed,
      castle,
      defense: type === "wall" || type === "archerTower",
    });
  };
  make("ally", "building-90001", "warCastle", 110, 660, undefined, true);
  make("enemy", "building-90002", "warCastle", 300, 115, undefined, true);
  const positions = [
    [170, 190],
    [230, 190],
    [370, 190],
    [430, 190],
    [210, 115],
    [390, 115],
  ];
  FACILITIES.forEach((f, i) => {
    const t = WAR_TARGETS.find((t) => t.id === f.target)!;
    make("ally", `fixed-${f.id}`, f.id, t.x, t.y, f.target);
    make(
      "enemy",
      `building-${1000 + i}`,
      f.id,
      positions[i][0],
      positions[i][1],
      f.target,
    );
  });
  for (const side of ["ally", "enemy"] as const) {
    const d = side === "ally" ? player : enemy;
    const e = new EconomyManager(d, new EconomySaveManager(noStorage));
    const cost = buildingConfig("barracks")!.cost;
    if (e.resources.transact(cost))
      d.building!.buildings.push({
        id: `building-${side === "ally" ? d.building!.nextId++ : 1007}`,
        type: "barracks",
        x: 300,
        y: side === "ally" ? 340 : 210,
        angle: 0,
        level: 1,
        paid: { ...cost },
        production: freshProduction(),
        charge: 0,
        lastHit: -10000,
        readyAt: 0,
        owner: side,
      });
    make(
      side,
      `building-${side === "ally" ? 91001 : 92001}`,
      "wall",
      240,
      side === "ally" ? 580 : 265,
    );
    make(
      side,
      `building-${side === "ally" ? 91002 : 92002}`,
      "wall",
      side === "ally" ? 430 : 360,
      side === "ally" ? 580 : 265,
    );
  }
  if (o.type === "siege") {
    player.rank = 5;
    enemy.rank = 5;
    player.storageLevel = 3;
    player.resources = {
      wood: 500,
      stone: 400,
      gold: 600,
      food: 300,
      mana: 30,
      energy: 100,
    };
    w.structures
      .filter((s) => s.side === "enemy")
      .forEach((s) => {
        s.level = 3;
        s.maxHp = s.castle ? 2200 : s.maxHp * 1.7;
        s.hp = s.maxHp;
        s.armor += 6;
      });
  }
  return w;
}
export class WarManager {
  objectiveControlled = false;
  environmentRule?: (item: BlueprintItem) => string | null;
  readonly player: EconomyManager;
  readonly enemy: EconomyManager;
  readonly army: ArmyManager;
  readonly enemyArmy: ArmyManager;
  readonly builder: BuildingManager;
  readonly ai: EnemyAI;
  onNotice: (text: string) => void = () => {};
  onLayout: () => void = () => {};
  onEnd: () => void = () => {};
  onSound: (kind: string) => void = () => {};
  onHarvest: (target: string) => void = () => {};
  damageFilter: (s: Structure, amount: number) => number = (_s, amount) =>
    amount;
  canMaterialize: (x: number, y: number, type: string) => boolean = () => true;
  private accumulator = 0;
  private nextSave = 0;
  private nextLayout = "";
  private towerAt = new Map<string, number>();
  private warningAt = new Map<string, number>();
  private saving = false;
  constructor(
    readonly data: WarData,
    readonly save = new WarSaveManager(),
  ) {
    this.player = new EconomyManager(
      data.player,
      new EconomySaveManager(noStorage),
    );
    this.enemy = new EconomyManager(
      data.enemy,
      new EconomySaveManager(noStorage),
    );
    this.army = new ArmyManager(this.player);
    this.army.data.command =
      data.order === "defend"
        ? "defend"
        : data.order === "retreat"
          ? "retreat"
          : "attack";
    this.enemyArmy = new ArmyManager(this.enemy);
    this.enemyArmy.side = "enemy";
    this.enemyArmy.data.ownedSide = "enemy";
    this.builder = new BuildingManager(this.player);
    this.ai = new EnemyAI(this);
    for (const [side, e, a] of [
      ["ally", this.player, this.army],
      ["enemy", this.enemy, this.enemyArmy],
    ] as const) {
      e.checkpoint = () => this.checkpoint();
      e.onNotice = (message) => {
        if (side === "ally") this.notice("economy", message);
      };
      e.facilityFactor = (id) => this.facilityFactor(side, id);
      a.externalCombat = true;
      a.worldBuildings = () => this.navigationBuildings;
      a.navigation.terrain = (p) => fixedBlocked(p, 8, []);
      a.productionFactor = (b) =>
        this.structureFactor(this.structure(b.id)) *
        (side === "ally" && data.buffs.economy > data.time ? 1.2 : 1);
      a.spawnOverride = (b) => this.spawnAt(side, b);
      a.onNotice = (msg) => {
        if (side === "ally") this.notice("troop", msg);
      };
      for (const u of a.data.units) {
        u.side = side;
        u.kingdomId = e.data.id;
        if (
          side === "enemy" &&
          !["reserve", "deployed", "commander", "scout"].includes(u.squad)
        )
          u.squad = "reserve";
      }
    }
    this.army.data.battle = {
      mode: "challenge",
      scenario: 0,
      time: 0,
      wave: 0,
      initial: [],
      enemies: [],
      projectiles: data.projectiles,
      nextProjectile: data.nextProjectile,
      sphereDamage: 0,
      combos: 0,
      xp: 0,
      rewardEligible: true,
      contributions: {},
    };
    this.army.combat.opponentData = this.enemyArmy.data;
    this.army.combat.enabled = () =>
      !this.data.result &&
      this.data.time >= this.data.options.preparation * 1000;
    this.army.combat.controlUnit = (u, dt, now, all) =>
      this.control(u, dt, now, all);
    this.army.combat.onDamage = (u, amount, sphere) => {
      if (sphere) {
        data.stats.sphereUnits += amount;
        this.comboHit(u.id, "enemyUnit");
      }
      if (u.hp <= 0 && u.side === "enemy") data.stats.kills++;
    };
    this.army.combat.onSound = (kind) => this.onSound(kind);
    this.army.combat.onProjectileImpact = (p) => {
      const s = this.structure(p.target);
      if (!s) return false;
      this.damageStructure(s.id, p.damage, "unit", p.side);
      return true;
    };
    this.builder.placementRule = (item, ignore) =>
      this.placementRule(item, ignore);
    this.builder.onChange = () => {
      this.syncStructures();
      this.layout();
    };
    this.syncStructures();
    this.layout();
    this.bridge();
    if (
      data.options.type === "siege" &&
      !data.player.army!.units.length &&
      !data.time
    ) {
      for (const kind of [
        "catapult",
        "catapult",
        "guard",
        "guard",
        "swordsman",
        "swordsman",
      ] as const) {
        const p = this.army.navigation.closest({
          x: 260 + this.army.living.length * 18,
          y: 650,
        })!;
        this.army.data.units.push(this.army.createUnit(kind, "ally", p));
      }
    }
    if (data.result) this.save.record(data.result);
  }
  get now() {
    return this.data.time;
  }
  get preparing() {
    return this.now < this.data.options.preparation * 1000;
  }
  get finalOffensive() {
    return this.now >= 1200000;
  }
  get activeEnemies() {
    return this.enemyArmy.living.filter((u) => u.squad !== "reserve");
  }
  economy(side: Side) {
    return side === "ally" ? this.player : this.enemy;
  }
  troops(side: Side) {
    return side === "ally" ? this.army : this.enemyArmy;
  }
  castle(side: Side) {
    return this.data.structures.find((s) => s.castle && s.side === side)!;
  }
  structure(id: string) {
    return this.data.structures.find((s) => s.id === id);
  }
  protection(side: Side) {
    const defenses = this.data.structures.filter(
      (s) => s.side === side && s.defense,
    );
    const living = defenses.filter((s) => s.hp > 0).length;
    return living === 0 ? 0 : living === defenses.length ? 0.8 : 0.4;
  }
  structureFactor(s: Structure | undefined) {
    return !s
      ? 1
      : s.hp <= 0
        ? 0
        : s.hp / s.maxHp < 0.25
          ? 0.4
          : s.hp / s.maxHp < 0.5
            ? 0.7
            : 1;
  }
  facilityFactor(side: Side, id: string) {
    const s = this.data.structures.find(
      (s) => s.side === side && (s.id === id || s.fixed === id),
    );
    return (
      this.structureFactor(s) *
      (side === "ally" && this.data.buffs.economy > this.now ? 1.2 : 1)
    );
  }
  private entity(s: Structure): BuildingEntity {
    return {
      id: s.id,
      type: s.type,
      x: s.x,
      y: s.y,
      angle: s.angle,
      level: s.level,
      owner: s.side,
      disabled: s.hp <= 0,
      paid: {},
      production: freshProduction(),
      charge: 0,
      lastHit: -10000,
      readyAt: 0,
    };
  }
  get navigationBuildings() {
    return this.data.structures
      .filter((s) => s.hp > 0)
      .map((s) => this.entity(s));
  }
  get physicsBuildings() {
    return this.data.structures
      .filter((s) => s.hp > 0 && !(s.side === "ally" && s.fixed))
      .map((s) => this.entity(s));
  }
  syncStructures() {
    for (const s of this.data.structures.filter((s) => s.fixed)) {
      const level =
        this.economy(s.side).data.facilities[s.type]?.level ?? s.level;
      if (level !== s.level) {
        const ratio = s.hp / s.maxHp;
        s.level = level;
        s.maxHp =
          (BUILDING_HEALTH[s.type]?.[0] ?? 350) * (1 + (level - 1) * 0.35);
        s.hp = ratio * s.maxHp;
      }
    }
    for (const side of ["ally", "enemy"] as const) {
      const d = this.economy(side).data;
      for (const b of d.building!.buildings) {
        b.owner = side;
        let s = this.structure(b.id);
        if (!s) {
          const [hp, armor] = BUILDING_HEALTH[b.type] ?? [350, 10];
          s = {
            id: b.id,
            type: b.type,
            side,
            x: b.x,
            y: b.y,
            angle: b.angle,
            level: b.level,
            maxHp: hp * (1 + (b.level - 1) * 0.35),
            hp: hp * (1 + (b.level - 1) * 0.35),
            armor: armor + (b.level - 1) * 3,
            lastDamage: -10000,
            lastSphere: -10000,
            repairReady: 0,
            defense: ["wall", "archerTower"].includes(b.type),
          };
          this.data.structures.push(s);
        }
        if (s.level !== b.level) {
          const ratio = s.hp / s.maxHp;
          s.level = b.level;
          s.maxHp =
            (BUILDING_HEALTH[s.type]?.[0] ?? 350) * (1 + (b.level - 1) * 0.35);
          s.hp = s.maxHp * ratio;
          s.armor = (BUILDING_HEALTH[s.type]?.[1] ?? 10) + (b.level - 1) * 3;
        }
        s.x = b.x;
        s.y = b.y;
        s.angle = b.angle;
        b.disabled = s.hp <= 0;
      }
      this.data.structures = this.data.structures.filter(
        (s) =>
          s.side !== side ||
          s.castle ||
          s.fixed ||
          Number(s.id.split("-")[1]) >= 90000 ||
          d.building!.buildings.some((b) => b.id === s.id),
      );
    }
  }
  layout() {
    const signature = JSON.stringify(
      this.data.structures.map((s) => [
        s.id,
        s.x,
        s.y,
        s.angle,
        s.hp > 0,
        s.level,
      ]),
    );
    if (signature === this.nextLayout) return;
    this.nextLayout = signature;
    this.army.navigation.rebuild(this.navigationBuildings);
    this.enemyArmy.navigation.rebuild(this.navigationBuildings);
    this.onLayout();
  }
  private bridge() {
    const b = this.army.data.battle!;
    b.enemies = this.activeEnemies;
    b.time = this.now / 1000;
    this.data.projectiles = b.projectiles;
    this.data.nextProjectile = b.nextProjectile;
  }
  checkpoint() {
    if (this.saving) return;
    this.saving = true;
    this.bridge();
    this.save.save(this.data);
    this.saving = false;
    if (this.save.lastError) this.notice("save", this.save.lastError);
  }
  notice(kind: string, text: string) {
    if (this.now < (this.warningAt.get(kind) ?? -1)) return;
    this.warningAt.set(kind, this.now + 4000);
    this.data.logs.unshift({ time: this.now, text });
    this.data.logs = this.data.logs.slice(0, 30);
    this.onNotice(text);
  }
  private spawnAt(side: Side, b: BuildingEntity) {
    const a = this.troops(side);
    for (let r = 40; r <= 85; r += 15)
      for (let i = 0; i < 12; i++) {
        const angle = (i * Math.PI) / 6,
          p = { x: b.x + Math.cos(angle) * r, y: b.y + Math.sin(angle) * r };
        if (
          a.navigation.free(p) &&
          !a.living.some((u) => Math.hypot(u.x - p.x, u.y - p.y) < 12)
        )
          return p;
      }
    return null;
  }
  placementRule(item: BlueprintItem, ignore?: string) {
    const environmentError = this.environmentRule?.(item);
    if (environmentError) return environmentError;
    if (this.data.result) return "종료된 전쟁입니다.";
    if (item.y < 300) return "적 왕국의 건설 구역입니다.";
    if (!this.preparing)
      return "전투 중에는 전쟁 패널의 시간제 빠른 건설을 사용하세요.";
    if (ignore && this.structure(ignore)?.hp === 0)
      return "파괴된 건물은 재건해야 합니다.";
    return null;
  }
  command(order: WarOrder, lane = this.data.lane) {
    if (this.data.result) return;
    this.data.order = order;
    this.data.lane = lane;
    this.army.command(
      order === "defend"
        ? "defend"
        : order === "retreat"
          ? "retreat"
          : "attack",
    );
    for (const u of this.army.living) {
      u.target = undefined;
      u.pathAt = 0;
    }
    this.checkpoint();
  }
  damageStructure(
    id: string,
    raw: number,
    source: "sphere" | "unit",
    attacker: Side,
  ) {
    const s = this.structure(id);
    if (
      !s ||
      s.side === attacker ||
      s.hp <= 0 ||
      this.preparing ||
      this.data.result ||
      !Number.isFinite(raw) ||
      raw <= 0
    )
      return 0;
    let damage = (raw * 100) / (100 + s.armor * 2);
    if (s.castle) damage *= 1 - this.protection(s.side);
    if (this.finalOffensive) damage *= 1.2;
    const actual = Math.min(
      s.hp,
      Math.max(1, Math.round(this.damageFilter(s, damage))),
    );
    s.hp -= actual;
    s.lastDamage = this.now;
    if (source === "sphere") this.data.stats.sphereBuildings += actual;
    this.army.combat.effect({
      x: s.x,
      y: s.y,
      type: "hit",
      text: `−${Math.round(actual)}`,
      side: s.side,
    });
    if (s.castle) {
      this.notice(
        `castle-${s.side}`,
        s.side === "ally"
          ? "아군 왕궁이 공격받고 있습니다!"
          : "적 왕궁을 타격했습니다.",
      );
      this.onSound("castle");
    }
    if (s.hp === 0) {
      if (s.side === "enemy") {
        this.data.stats.destroyed++;
        if (s.type === "wall") this.data.stats.walls++;
      } else this.data.stats.lostBuildings++;
      this.notice(
        `destroy-${s.id}`,
        `${s.side === "ally" ? "아군" : "적"} ${s.castle ? "왕궁" : buildingConfig(s.type)!.name} 파괴!`,
      );
      this.onSound("collapse");
      const b = this.economy(s.side).data.building!.buildings.find(
        (b) => b.id === s.id,
      );
      if (b) b.disabled = true;
      this.army.combat.effect({
        x: s.x,
        y: s.y,
        type: "death",
        text: "✦",
        side: s.side,
      });
      this.layout();
    }
    this.checkpoint();
    return actual;
  }
  sphereBuilding(id: string, speed: number, valid: boolean, factor = 1) {
    const s = this.structure(id);
    if (
      !valid ||
      !s ||
      s.side !== "enemy" ||
      speed <= 40 ||
      this.now - s.lastSphere < 550 ||
      this.preparing ||
      this.data.result
    )
      return;
    s.lastSphere = this.now;
    let raw =
      speed < 180
        ? 5
        : speed < 420
          ? 15
          : speed < 700
            ? 30
            : speed < 1000
              ? 50
              : 80;
    if (s.type === "wall" && this.data.buffs.wallBreaker > this.now) {
      raw *= 1.5;
      this.data.buffs.wallBreaker = 0;
    }
    if (this.damageStructure(id, raw * factor, "sphere", "ally")) {
      this.comboHit(
        id,
        s.type === "wall"
          ? "wall"
          : s.defense
            ? "enemyDefense"
            : "enemyBuilding",
      );
      if (s.fixed) this.scout("ally");
    }
  }
  friendlyHit(id: string) {
    const s =
      this.structure(id) ||
      this.data.structures.find((s) => s.side === "ally" && s.fixed === id);
    if (!s || s.hp <= 0) return;
    this.comboHit(
      s.id,
      s.defense
        ? "defense"
        : s.type === "siegeWorkshop"
          ? "workshop"
          : buildingConfig(s.type)?.category === "military"
            ? "military"
            : "economy",
    );
    if (s.type === "watchtower") this.scout("ally");
  }
  comboHit(id: string, kind: string) {
    if (this.preparing || this.data.result) return;
    const d = this.data;
    d.comboHits.push({ id, kind, time: this.now });
    d.comboHits = d.comboHits
      .filter((h) => this.now - h.time <= 15000)
      .slice(-40);
    const h = d.comboHits,
      last = h
        .slice(-4)
        .map((h) => h.kind)
        .join(",");
    const conditions: Record<string, boolean> = {
      wallBreaker:
        h.filter((x) => x.kind === "wall" && this.now - x.time < 10000)
          .length >= 4,
      royalDefense:
        h
          .slice(-2)
          .map((h) => h.kind)
          .join(",") === "defense,enemyUnit",
      counter:
        this.activeEnemies.length > 0 &&
        h.filter((h) => h.kind === "enemyUnit" && this.now - h.time < 12000)
          .length >= 4,
      economy:
        last === "economy,military,economy,military" ||
        last === "military,economy,military,economy",
      siegeMaster: last === "workshop,wall,workshop,wall",
      breaker:
        new Set(
          h
            .filter((h) => ["wall", "enemyDefense"].includes(h.kind))
            .map((h) => h.id),
        ).size >= 3,
    };
    for (const [key, ready] of Object.entries(conditions)) {
      if (
        !ready ||
        this.now < (d.cooldowns[key] ?? 0) ||
        Object.values(d.buffs).filter((t) => t > this.now).length >= 3
      )
        continue;
      d.cooldowns[key] = this.now + 30000;
      d.buffs[key] =
        this.now + (["economy", "siegeMaster"].includes(key) ? 15000 : 10000);
      d.stats.combos++;
      if (key === "royalDefense")
        this.army.data.buffs.shield = this.now + 10000;
      if (key === "counter") this.army.data.buffs.iron = this.now + 10000;
      if (key === "breaker") {
        this.enemyArmy.data.morale = Math.max(
          0,
          this.enemyArmy.data.morale - 10,
        );
        this.army.data.morale = Math.min(100, this.army.data.morale + 10);
      }
      this.notice("warCombo", `전쟁 콤보 · ${key}`);
      this.onSound("magic");
    }
  }
  scout(side: Side): Intel {
    const opponent = side === "ally" ? "enemy" : "ally",
      army = this.troops(opponent),
      structures = this.data.structures.filter((s) => s.side === opponent);
    const kinds: Intel["kinds"] = {};
    for (const u of army.living) kinds[u.kind] = (kinds[u.kind] ?? 0) + 1;
    const intel: Intel = {
      at: this.now,
      count: army.living.length,
      power: army.power,
      kinds,
      defenses: structures.filter((s) => s.defense && s.hp > 0).length,
      lane: side === "ally" ? this.data.ai.lane : this.data.lane,
      damage: 1 - this.castle(opponent).hp / this.castle(opponent).maxHp,
      castleLevel: this.castle(opponent).level,
    };
    if (side === "ally") this.data.intel = intel;
    else this.data.ai.intel = intel;
    return intel;
  }
  get threat() {
    if (
      this.castle("ally").hp / this.castle("ally").maxHp < 0.25 ||
      this.now - this.castle("ally").lastDamage < 5000
    )
      return 5;
    if (this.activeEnemies.some((u) => u.y > 530)) return 4;
    if (this.activeEnemies.some((u) => u.y > 340)) return 3;
    return this.data.ai.warningAt || this.activeEnemies.length ? 2 : 1;
  }
  repairQuote(id: string, emergency = false) {
    const s = this.structure(id);
    if (!s) return {};
    const factor =
      s.hp <= 0 ? 0.75 : (1 - s.hp / s.maxHp) * 0.5 * (emergency ? 2 : 1);
    return scaleCost(
      s.castle ? CASTLE_COST : buildingConfig(s.type)!.cost,
      factor,
    );
  }
  repair(id: string, emergency = false, side: Side = "ally"): string | null {
    const s = this.structure(id);
    if (this.data.result || !s || s.side !== side || s.hp >= s.maxHp)
      return "수리할 대상이 없습니다.";
    if (this.data.work.some((w) => w.target === id) || this.now < s.repairReady)
      return "이미 작업 중이거나 수리 대기시간입니다.";
    if (s.castle && s.hp <= 0) return "무너진 왕궁은 수리할 수 없습니다.";
    const paid = this.repairQuote(id, emergency);
    if (!this.economy(side).resources.transact(paid))
      return "수리 자원이 부족합니다.";
    const heal = s.castle
      ? Math.min(
          s.maxHp - s.hp,
          s.maxHp * 0.2 * (this.finalOffensive ? 0.5 : 1),
        )
      : s.maxHp - s.hp;
    this.data.work.push({
      id: `work-${this.data.nextId++}`,
      side,
      kind: s.hp <= 0 ? "rebuild" : "repair",
      target: id,
      type: s.type,
      x: s.x,
      y: s.y,
      angle: s.angle,
      remaining: emergency ? 4 : s.hp <= 0 ? 20 : 12,
      paid,
      heal,
      emergency,
    });
    if (s.castle) s.repairReady = this.now + 60000;
    if (side === "ally")
      for (const r of RESOURCE_IDS)
        this.data.stats.repairs[r] =
          (this.data.stats.repairs[r] ?? 0) + (paid[r] ?? 0);
    this.checkpoint();
    return null;
  }
  upgradeCastle(side: Side = "ally"): string | null {
    const s = this.castle(side);
    if (this.data.result || s.level >= 5 || s.hp <= 0)
      return "왕궁을 강화할 수 없습니다.";
    if (this.now - s.lastDamage < 10000)
      return "공격받는 왕궁은 강화할 수 없습니다.";
    if (!this.economy(side).resources.transact(scaleCost(CASTLE_COST, s.level)))
      return "강화 자원이 부족합니다.";
    const ratio = s.hp / s.maxHp;
    s.level++;
    s.maxHp = CASTLE_HP[s.level - 1] * (s.castleMultiplier ?? 1);
    s.hp = s.maxHp * ratio;
    s.armor += 3;
    if (side === "ally") this.data.stats.upgrades++;
    this.layout();
    this.checkpoint();
    return null;
  }
  queueBuild(
    side: Side,
    type: string,
    p: { x: number; y: number },
    angle = 0,
  ): string | null {
    const e = this.economy(side),
      c = buildingConfig(type);
    if (this.data.result || !c || type === "warCastle" || e.data.rank < c.rank)
      return "건설 해금 조건을 확인하세요.";
    const buildings = e.data.building!.buildings,
      queued = this.data.work.filter(
        (w) => w.side === side && w.kind === "build",
      );
    if (
      buildings.length + queued.length >= BUILD_LIMITS[e.data.rank - 1] ||
      buildings.filter((b) => b.type === type).length +
        queued.filter((w) => w.type === type).length >=
        c.limit
    )
      return "건설 한도입니다.";
    if (
      this.data.work.some(
        (w) => w.kind === "build" && Math.hypot(w.x - p.x, w.y - p.y) < 60,
      )
    )
      return "다른 건설이 진행 중입니다.";
    if (side === "ally") {
      if (p.y < 400 || p.y > 690)
        return "전시 건설은 하단 보호 구역(Y 400~690)에서 가능합니다.";
      const error = validatePlacement(
        { type, ...p, angle, level: 1 },
        this.physicsBuildings,
        e.data.building!.territories,
      );
      if (error) return error;
      if (
        this.activeEnemies.some((u) => Math.hypot(u.x - p.x, u.y - p.y) < 100)
      )
        return "적군과 가까워 건설할 수 없습니다.";
    } else if (
      p.y > 300 ||
      p.y < 100 ||
      p.x < 90 ||
      p.x > 500 ||
      this.data.structures.some(
        (s) => s.hp > 0 && Math.hypot(s.x - p.x, s.y - p.y) < 44,
      )
    )
      return "적 건설 영역 또는 통로가 부족합니다.";
    const paid = scaleCost(
      c.cost,
      1 + 0.25 * buildings.filter((b) => b.type === type).length,
    );
    if (!e.resources.transact(paid)) return "건설 자원이 부족합니다.";
    this.data.work.push({
      id: `work-${this.data.nextId++}`,
      side,
      kind: "build",
      target: "",
      type,
      ...p,
      angle,
      remaining: 12,
      paid,
      heal: 0,
      emergency: false,
    });
    this.checkpoint();
    return null;
  }
  emergencyEnergy(): boolean {
    if (
      this.data.result ||
      this.data.emergencyCharges >= 2 ||
      this.player.data.resources.energy >= 20
    )
      return false;
    this.data.emergencyCharges++;
    this.player.resources.grant("energy", 20);
    this.checkpoint();
    return true;
  }
  private work(dt: number) {
    for (const w of this.data.work) {
      const s = this.structure(w.target);
      if (
        w.kind === "build" &&
        this.troops(w.side === "ally" ? "enemy" : "ally").living.some(
          (u) => Math.hypot(u.x - w.x, u.y - w.y) < 65,
        )
      )
        continue;
      w.remaining -= dt * (s && this.now - s.lastDamage < 5000 ? 0.35 : 1);
      if (w.remaining > 0) continue;
      if (
        (w.kind === "build" || w.kind === "rebuild") &&
        (!this.canMaterialize(w.x, w.y, w.type) ||
          [...this.army.living, ...this.enemyArmy.living].some(
            (u) =>
              Math.hypot(u.x - w.x, u.y - w.y) <
              Math.max(
                buildingConfig(w.type)!.width,
                buildingConfig(w.type)!.height,
              ) /
                2 +
                12,
          ))
      ) {
        w.remaining = 0.1;
        continue;
      }
      if (w.kind === "build") {
        const d = this.economy(w.side).data;
        d.building!.buildings.push({
          id: `building-${d.building!.nextId++}`,
          type: w.type,
          x: w.x,
          y: w.y,
          angle: w.angle,
          level: 1,
          paid: w.paid,
          production: freshProduction(),
          charge: 0,
          lastHit: -10000,
          readyAt: 0,
          owner: w.side,
        });
        if (w.side === "ally") this.data.stats.built++;
      } else if (s) {
        if (
          w.kind === "rebuild" &&
          this.troops(w.side === "ally" ? "enemy" : "ally").living.some(
            (u) => Math.hypot(u.x - s.x, u.y - s.y) < 65,
          )
        ) {
          w.remaining = 0.1;
          continue;
        }
        s.hp = Math.min(s.maxHp, s.hp + w.heal);
        const b = this.economy(w.side).data.building!.buildings.find(
          (b) => b.id === s.id,
        );
        if (b) b.disabled = false;
      }
    }
    this.data.work = this.data.work.filter((w) => w.remaining > 0);
    this.syncStructures();
    this.layout();
  }
  private control(
    u: UnitEntity,
    dt: number,
    now: number,
    all: UnitEntity[],
  ): boolean {
    const allied = u.side === "ally",
      order = allied
        ? this.data.order
        : this.data.ai.strategy === "emergency"
          ? "defend"
          : this.data.ai.strategy === "recovery"
            ? "retreat"
            : this.data.options.enemy === "shadow"
              ? "economy"
              : this.data.ai.strategy === "siege"
                ? "siege"
                : "frontline";
    const engagement =
      order === "frontline" ? 170 : order === "defend" ? 190 : 70;
    const close = all.some(
      (t) =>
        t.side !== u.side &&
        t.hp > 0 &&
        (t.x - u.x) ** 2 + (t.y - u.y) ** 2 < engagement * engagement,
    );
    if (
      u.kind === "healer" &&
      all.some(
        (t) =>
          t.side === u.side &&
          t.hp < maxHp(t) &&
          Math.hypot(t.x - u.x, t.y - u.y) < 150,
      )
    )
      return false;
    if (close && order !== "retreat") return false;
    const lane = allied ? this.data.lane : this.data.ai.lane,
      nav = this.army.navigation,
      combat = this.army.combat;
    if (order === "retreat" || order === "defend" || u.kind === "healer") {
      const goal = nav.closest({ x: laneX(lane), y: allied ? 625 : 175 });
      if (goal) combat.move(u, goal, dt, now);
      return true;
    }
    if (
      ((allied && u.y > 460) || (!allied && u.y < 350)) &&
      lane !== "center"
    ) {
      const waypoint = nav.closest({ x: laneX(lane), y: 405 });
      if (waypoint) {
        combat.move(u, waypoint, dt, now);
        return true;
      }
    }
    const targets = this.data.structures.filter(
      (s) => s.side !== u.side && s.hp > 0,
    );
    const category = (s: Structure) =>
      s.castle
        ? "castle"
        : s.defense
          ? "siege"
          : buildingConfig(s.type)?.category === "military"
            ? "military"
            : "economy";
    const target = targets.sort((a, b) => {
      const score = (s: Structure) =>
        Math.hypot(s.x - u.x, s.y - u.y) +
        (category(s) === order ? -100 : 0) +
        (s.castle && this.protection(s.side) > 0 && order !== "castle"
          ? 250
          : 0);
      return score(a) - score(b);
    })[0];
    if (!target) return true;
    const c = unitConfig(u.kind),
      radius = target.castle
        ? 24
        : Math.max(
            buildingConfig(target.type)!.width,
            buildingConfig(target.type)!.height,
          ) / 2;
    const angle = Math.atan2(u.y - target.y, u.x - target.x);
    const goal = nav.closest({
      x: target.x + Math.cos(angle) * (radius + 14),
      y: target.y + Math.sin(angle) * (radius + 14),
    });
    if (
      goal &&
      Math.hypot(target.x - u.x, target.y - u.y) <= c.range + radius &&
      nav.clearLine(u, goal)
    ) {
      u.state = "attacking";
      u.facing = angle + Math.PI;
      if (now < u.cooldown) return true;
      u.cooldown =
        now + c.interval * 1000 * (this.army.combat.intervalFactor?.(u) ?? 1);
      const bonus =
        u.kind === "catapult" && allied && this.data.buffs.siegeMaster > now
          ? 1.25
          : 1;
      const raw =
        attackPower({ ...u, side: "ally" }, this.troops(u.side).data, now) *
        SIEGE_MULTIPLIER[u.kind] *
        bonus;
      if (c.range > 70)
        this.fire(
          u.id,
          u.kind,
          u.side,
          u.x,
          u.y,
          target.id,
          target.x,
          target.y,
          raw,
        );
      else this.damageStructure(target.id, raw, "unit", u.side);
      if (allied) awardXp(u, Math.min(2, raw * 0.02));
      combat.effect({
        x: target.x,
        y: target.y,
        type:
          u.kind === "catapult" ? "tower" : u.kind === "mage" ? "magic" : "hit",
        text: u.kind === "catapult" ? "SIEGE" : "",
        side: target.side,
      });
      this.onSound(u.kind);
    } else if (goal)
      combat.move(
        u,
        goal,
        dt * (allied && this.data.buffs.counter > now ? 1.15 : 1),
        now,
      );
    return true;
  }
  private fire(
    from: string,
    kind: Projectile["kind"],
    side: Side,
    x: number,
    y: number,
    target: string,
    tx: number,
    ty: number,
    damage: number,
  ) {
    const b = this.army.data.battle!;
    if (b.projectiles.length >= 160) return;
    b.projectiles.push({
      id: b.nextProjectile++,
      from,
      kind,
      side,
      x,
      y,
      startX: x,
      startY: y,
      target,
      tx,
      ty,
      damage,
      age: 0,
      duration: Math.max(
        0.15,
        Math.hypot(tx - x, ty - y) / (kind === "catapult" ? 220 : 500),
      ),
      splash: 0,
      heal: false,
    });
  }
  private towers() {
    for (const s of this.data.structures.filter(
      (s) => s.type === "archerTower" && s.hp > 0,
    )) {
      if (this.now < (this.towerAt.get(s.id) ?? 0)) continue;
      const target = this.troops(s.side === "ally" ? "enemy" : "ally")
        .living.filter(
          (u) =>
            u.squad !== "reserve" && Math.hypot(u.x - s.x, u.y - s.y) < 160,
        )
        .sort((a, b) => a.hp - b.hp)[0];
      if (!target) continue;
      const muzzle = this.army.navigation.closest({
        x: s.x,
        y: s.y + (s.side === "ally" ? -28 : 28),
      });
      if (!muzzle || !this.army.navigation.clearLine(muzzle, target)) continue;
      this.towerAt.set(s.id, this.now + 1400);
      this.fire(
        s.id,
        "tower",
        s.side,
        s.x,
        s.y,
        target.id,
        target.x,
        target.y,
        (12 + s.level * 4) * this.structureFactor(s),
      );
      this.army.combat.effect({
        x: s.x,
        y: s.y,
        type: "tower",
        text: "➶",
        side: s.side,
      });
    }
  }
  tick(dt: number, now: number) {
    if (this.data.result) return;
    this.accumulator += dt;
    if (this.accumulator < 0.05) return;
    const step = this.accumulator;
    this.accumulator = 0;
    this.data.time = now;
    this.player.tick(now);
    this.enemy.tick(now);
    this.ai.update();
    this.work(step);
    this.army.tick(step, now);
    this.enemyArmy.tick(step, now);
    for (const u of this.enemyArmy.living) {
      u.side = "enemy";
      u.kingdomId = this.enemy.data.id;
      if (u.squad === "enemy") u.squad = "reserve";
    }
    for (const u of this.army.living) u.kingdomId = this.player.data.id;
    this.bridge();
    if (
      !this.preparing &&
      this.army.living.some((u) => u.y < 300) &&
      (!this.data.intel || now - this.data.intel.at > 10000)
    )
      this.scout("ally");
    if (!this.preparing) {
      this.army.combat.update(step, now);
      this.towers();
    }
    this.data.projectiles = this.army.data.battle!.projectiles;
    this.data.nextProjectile = this.army.data.battle!.nextProjectile;
    const castle = this.castle("ally"),
      enemy = this.castle("enemy");
    this.data.stats.minCastle = Math.min(
      this.data.stats.minCastle,
      castle.hp / castle.maxHp,
    );
    this.data.stats.maxPower = Math.max(
      this.data.stats.maxPower,
      this.army.power,
    );
    if (!castle.hp || (!this.objectiveControlled && !enemy.hp)) {
      this.finish(
        !castle.hp && !enemy.hp ? "draw" : !enemy.hp ? "victory" : "defeat",
        !castle.hp && !enemy.hp
          ? "동일 업데이트에서 양쪽 왕궁 파괴"
          : !enemy.hp
            ? "적 왕궁 정복"
            : "아군 왕궁 붕괴",
      );
      return;
    }
    const before = this.data.phase;
    this.data.phase = this.preparing
      ? "preparation"
      : enemy.hp / enemy.maxHp < 0.25
        ? "conquest"
        : this.protection("enemy") < 0.8 ||
            this.army.living.some((u) => u.kind === "catapult" && u.y < 400)
          ? "siege"
          : this.activeEnemies.length >= 8 || this.data.ai.wave >= 3
            ? "war"
            : this.activeEnemies.length
              ? "border"
              : "reconnaissance";
    if (before !== this.data.phase)
      this.notice("phase", `전쟁 단계 · ${this.data.phase}`);
    if (
      this.protection("enemy") === 0 &&
      this.data.order !== "retreat" &&
      this.data.order !== "defend" &&
      this.data.order !== "castle"
    ) {
      this.command("castle");
      this.notice("royalSiege", "ROYAL SIEGE · 적 왕궁 보호 해제!");
    }
    if (
      !this.objectiveControlled &&
      this.data.options.type === "defense" &&
      now >= (this.data.options.limit || 900) * 1000 &&
      !this.activeEnemies.length &&
      !this.data.ai.warningAt
    ) {
      this.finish("victory", "지정된 방어 시간과 마지막 침공을 방어했습니다.");
      return;
    }
    if (
      !this.objectiveControlled &&
      this.data.options.type !== "defense" &&
      this.data.options.limit > 0 &&
      now >= this.data.options.limit * 1000
    ) {
      const score = (side: Side) => {
        const c = this.castle(side);
        return (
          (c.hp / c.maxHp) * 0.7 +
          this.data.structures.filter(
            (s) => s.side === side && s.defense && s.hp > 0,
          ).length *
            0.05 +
          Math.min(0.15, this.troops(side).power / 20000)
        );
      };
      const delta = score("ally") - score("enemy");
      this.finish(
        Math.abs(delta) < 0.02 ? "draw" : delta > 0 ? "victory" : "defeat",
        "시간 제한 · 왕궁 체력 비율, 방어시설, 생존 군사력 평가",
      );
      return;
    }
    if (this.now > this.nextSave) {
      this.nextSave = this.now + 1000;
      this.checkpoint();
    }
    this.data.tutorial = this.preparing
      ? this.player.resources.totalProduction > 0
        ? 2
        : 1
      : this.data.stats.destroyed
        ? 8
        : this.protection("enemy") < 0.8
          ? 7
          : this.data.order !== "defend"
            ? 6
            : this.data.stats.lostBuildings || this.data.work.length
              ? 5
              : this.data.stats.sphereUnits
                ? 4
                : this.data.ai.wave
                  ? 3
                  : 2;
  }
  finish(outcome: "victory" | "defeat" | "draw", reason: string) {
    if (this.data.result) return;
    const d = this.data,
      p = this.player.data,
      a = this.army.data,
      c = this.castle("ally"),
      ec = this.castle("enemy"),
      castle = c.hp / c.maxHp;
    d.stats.built = Math.max(d.stats.built, p.building!.stats.built);
    d.stats.upgrades = Math.max(d.stats.upgrades, p.building!.stats.upgrades);
    const produced = Object.values(a.stats.produced).reduce(
        (sum, n) => sum + (n ?? 0),
        0,
      ),
      lossRate = a.stats.losses / Math.max(1, produced);
    const contribution = Math.min(
        1,
        (d.stats.sphereBuildings + d.stats.sphereUnits) / 1000,
      ),
      efficiency = Math.min(1, p.rank / 5);
    const score =
      (outcome === "victory" ? 40 : 0) +
      castle * 20 +
      (1 - Math.min(1, lossRate)) * 10 +
      contribution * 10 +
      efficiency * 10 +
      (DIFFICULTIES[d.options.difficulty].production - 0.7) * 10;
    const grade =
      outcome === "victory"
        ? score >= 85
          ? "S"
          : score >= 70
            ? "A"
            : score >= 55
              ? "B"
              : "C"
        : score >= 20
          ? "D"
          : "F";
    const achievements: string[] = [];
    if (outcome === "victory") {
      achievements.push("FIRST CONQUEST");
      if (d.options.type === "defense") achievements.push("ROYAL DEFENDER");
      if (d.stats.walls > 0 && a.stats.produced.catapult)
        achievements.push("SIEGE MASTER");
      if (p.rank >= 4 && this.player.resources.totalProduction >= 2000)
        achievements.push("ECONOMIC VICTORY");
      if (contribution >= 0.75) achievements.push("PINBALL HERO");
      if (castle >= 0.9) achievements.push("UNBROKEN KINGDOM");
      if (d.stats.minCastle <= 0.1) achievements.push("LAST STAND");
      if (d.options.difficulty === "legendary")
        achievements.push("LEGENDARY CONQUEROR");
    }
    if (a.stats.maxPopulation >= 60) achievements.push("IRON LEGION");
    if (
      this.save.records().reduce((s, r) => s + (r.stats?.walls ?? 0), 0) +
        d.stats.walls >=
      10
    )
      achievements.push("WALL BREAKER");
    if (
      outcome === "victory" &&
      d.stats.minCastle <= 0.1 &&
      p.magic &&
      p.magic.stats.storms > 0 &&
      !p.magic.achievements.includes("TURN THE TIDE")
    )
      p.magic.achievements.push("TURN THE TIDE");
    d.result = {
      magic: p.magic ? structuredClone(p.magic.stats) : undefined,
      id: d.id,
      outcome,
      reason,
      grade,
      seconds: Math.round(d.time / 1000),
      name: d.options.name,
      enemy: d.options.enemy,
      difficulty: d.options.difficulty,
      type: d.options.type,
      castle: c.hp,
      enemyCastle: ec.hp,
      stats: structuredClone(d.stats),
      produced: { ...p.produced },
      spent: { ...p.spent },
      units: produced,
      survivors: this.army.living.length,
      losses: a.stats.losses,
      research: a.stats.research,
      hits: p.totalHits,
      combo: p.scoreComboMax,
      lossesBall: p.losses,
      survival: p.losses ? p.survivalMs / p.losses / 1000 : 0,
      rank: p.rank,
      style: d.order,
      achievements,
    };
    this.checkpoint();
    this.save.record(d.result);
    this.onSound(outcome);
    this.onEnd();
  }
}
