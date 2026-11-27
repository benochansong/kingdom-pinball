import { freshRescue } from "../systems/RescueCannon";
import { unitConfig } from "../config/army";
import { maxHp } from "../army/DamageCalculator";
import { CASTLE_HP } from "../config/war";
import type { GameStateManager } from "../core/GameStateManager";
import { freshWar } from "../war/WarManager";
import { WarSaveManager, WAR_KEY } from "../war/WarSaveManager";
import { RegionalPhysicsSystem } from "../campaign/RegionalPhysicsSystem";
import { BossManager } from "../campaign/BossManager";
import { freshMission } from "../campaign/CampaignSaveManager";
import type { SessionExtension, CampaignSession } from "../campaign/types";
import type { ModeSession } from "./types";
import type { WarData } from "../war/types";
import type { UnitKind, UnitEntity } from "../army/types";
import { REGIONS } from "../config/campaign";
import { STARTS } from "../config/modes";
import { MAGIC_RESEARCH } from "../config/magic";
import { buildingConfig } from "../config/buildings";
import { RESOURCE_IDS } from "../config/economy";
export interface BattleHost {
  game: GameStateManager;
  session: ModeSession;
  persist(): void;
  tick(dt: number): void;
  hit(id: string): void;
  loss(): boolean;
  ended(): void;
}
/** A single engine instance and isolated checkpoint adapter shared by new modes. */
export class ModeBattle {
  terrain?: RegionalPhysicsSystem;
  boss?: BossManager;
  private extension?: SessionExtension;
  private disposers: (() => void)[] = [];
  private elapsed = 0;
  private baseBossFilter?: import("../army/CombatManager").CombatManager["damageFilter"];
  constructor(readonly host: BattleHost) {}
  get game() {
    return this.host.game;
  }
  get session() {
    return this.host.session.battle!;
  }
  get active() {
    return !!this.extension && this.game.sessionExtension === this.extension;
  }
  create(region = this.host.session.options.region) {
    const s = this.host.session,
      o = s.options,
      r = REGIONS.find((r) => r.id === region)!;
    const war = freshWar({
      name: s.name,
      crest: r.crest,
      enemy: o.enemy,
      difficulty: o.difficulty,
      type: o.warType,
      preparation: o.preparation,
      limit: 0,
      tutorial: false,
    });
    war.player.rescue = freshRescue(
      s.id,
      s.kind === "sandbox"
        ? o.sandbox.rescueShots
        : s.kind === "puzzle" || s.kind === "customTable"
          ? 0
          : 2,
    );
    const start = STARTS[o.start];
    war.player.rank = ["sandbox", "bossRush", "roguelike"].includes(s.kind)
      ? 5
      : 3;
    war.player.storageLevel = 3;
    Object.assign(war.player.resources, start.resources, { energy: 100 });
    if (["customWar", "spectator"].includes(s.kind))
      for (const key of RESOURCE_IDS)
        war.player.resources[key] =
          key === "energy"
            ? 100
            : key === "mana"
              ? Math.min(400, o.resources)
              : o.resources;
    war.enemy.rank = war.player.rank;
    war.enemy.storageLevel = 3;
    s.battle = {
      id: war.id,
      stage: `${REGIONS.indexOf(r) + 1}-3`,
      difficulty: "normal",
      war,
      mission: freshMission(),
      settled: false,
      elite: o.variant === "legendary",
      event: false,
      stars: [],
      reasons: [],
      reward: "",
    };
    return war;
  }
  open(war?: WarData) {
    const h = this.host,
      g = this.game,
      s = h.session;
    if (!s.battle) this.create();
    const data = war ?? s.battle!.war;
    s.battle!.war = data;
    const storage = new WarSaveManager({
      getItem: (key) => (key === WAR_KEY ? JSON.stringify(data) : null),
      setItem: (key, value) => {
        if (key === WAR_KEY) {
          s.battle!.war = JSON.parse(value);
          h.persist();
        }
      },
    });
    g.startWar(undefined, storage);
    const w = g.war!;
    s.battle!.war = w.data;
    w.objectiveControlled = true;
    const terrainSession = {
      ...s.battle!,
      stage: `${REGIONS.findIndex((r) => r.id === s.options.region) + 1}-1`,
    };
    this.terrain = new RegionalPhysicsSystem(g, terrainSession);
    w.environmentRule = (item) => this.terrain!.placement(item);
    for (const army of [w.army, w.enemyArmy]) {
      const base = army.navigation.terrain;
      army.navigation.terrain = (p) =>
        base(p) || (this.terrain?.blocked(p) ?? false);
      army.navigation.invalidate();
      army.navigation.rebuild(w.navigationBuildings);
    }
    const oldEnd = w.onEnd;
    w.onEnd = () => {
      h.ended();
      oldEnd();
    };
    this.disposers.push(
      g.events.on("hit", ({ id }) => {
        if (
          !this.active ||
          g.testBall ||
          g.state !== "playing" ||
          g.tilt.tilted ||
          g.time < g.recovery.suppressUntil
        )
          return;
        this.terrain?.hit(id);
        h.hit(id);
      }),
    );
    this.disposers.push(
      g.events.on("flipper", () => {
        if (this.active && g.state === "playing") s.stats.flippers++;
      }),
    );
    this.disposers.push(
      g.events.on("launch", () => {
        if (this.active) s.stats.balls++;
      }),
    );
    this.extension = {
      rescueEnabled: s.kind !== "puzzle" && s.kind !== "customTable",
      ballProtection:
        s.kind !== "puzzle" &&
        s.kind !== "customTable" &&
        s.options.variant !== "oneCore",
      canAdvance: () => s.status === "playing",
      regionId: s.options.region,
      bossPhase: () => this.boss?.state.phase ?? 0,
      onLoss: () => h.loss(),
      beforeStep: (dt) => {
        this.terrain?.beforeStep(dt);
        this.beforePhysics?.(dt);
      },
      afterStep: (dt) => {
        this.elapsed += dt;
        if (this.elapsed < 0.05) return;
        const step = this.elapsed;
        this.elapsed = 0;
        if (g.testBall || g.sandboxKind) return;
        this.boss?.tick();
        s.time += step * 1000;
        h.tick(step);
      },
      dispose: () => this.dispose(),
    };
    g.sessionExtension = this.extension;
    this.applyLimits();
    h.persist();
  }
  beforePhysics?: (dt: number) => void;
  applyLimits() {
    const g = this.game,
      s = this.host.session,
      o = s.options,
      w = g.war!;
    const population = o.population;
    Object.defineProperty(w.army, "capacity", {
      configurable: true,
      get: () => population,
    });
    const rule = w.builder.placementRule;
    w.builder.placementRule = (item, ignore) => {
      if (!ignore && w.builder.buildings.length >= o.buildingLimit)
        return "이 모드의 건설 개수 제한입니다.";
      return rule?.(item, ignore) ?? null;
    };
    const locked = g.magic!.locked.bind(g.magic);
    g.magic!.locked = (id) =>
      !o.magicEnabled
        ? "이 모드에서 마법을 사용하지 않습니다."
        : id === "multiball" && !o.multiEnabled
          ? "멀티볼 제한 규칙입니다."
          : id === "storm" && !o.stormEnabled
            ? "CORE STORM 제한 규칙입니다."
            : locked(id);
    if (!o.magicEnabled) g.enemyMagic = undefined;
  }
  initialize() {
    const s = this.host.session,
      w = this.game.war!,
      start = STARTS[s.options.start];
    for (const type of start.buildings) this.build(type, true);
    const amount = ["customWar", "spectator"].includes(s.kind)
      ? s.options.units
      : start.units;
    this.spawn("swordsman", amount, "ally");
    if (s.options.start === "magic") {
      w.player.data.magic!.research.fire = 1;
      w.player.data.magic!.loadout.balls = ["fire"];
    }
    const castle = w.castle("ally");
    castle.level = s.options.castleLevel;
    castle.maxHp = CASTLE_HP[castle.level - 1];
    castle.hp = castle.maxHp;
  }
  build(type: string, free = false) {
    const g = this.game,
      w = g.war!,
      b = w.builder,
      c = buildingConfig(type);
    if (!c) return false;
    const active = b.active;
    const oldCost = b.cost.bind(b);
    b.active = true;
    if (free) b.cost = () => ({});
    let success = false;
    for (const y of [450, 510, 570, 630]) {
      for (const x of [100, 170, 240, 330, 400, 470]) {
        if (!b.build({ type, x, y, angle: 0, level: 1 })) {
          success = true;
          break;
        }
      }
      if (success) break;
    }
    b.active = active;
    b.cost = oldCost;
    return success;
  }
  spawn(
    kind: UnitKind,
    count: number,
    side: "ally" | "enemy",
    rank = 1,
  ): UnitEntity[] {
    const w = this.game.war!,
      a = w.troops(side),
      out: UnitEntity[] = [];
    const cap =
      side === "ally"
        ? this.host.session.kind === "sandbox"
          ? a.capacity
          : this.host.session.options.population
        : 60;
    for (
      let i = 0;
      i < Math.min(100, count) &&
      a.population + unitConfig(kind).population <= cap &&
      w.army.living.length + w.enemyArmy.living.length < 150;
      i++
    ) {
      const index = a.living.length,
        position = a.navigation.closest({
          x: 110 + (index % 17) * 22,
          y:
            side === "ally"
              ? 580 + Math.floor(index / 17) * 15
              : 200 + Math.floor(index / 17) * 15,
        });
      if (!position) break;
      const u = a.createUnit(kind, side, position);
      u.rank = Math.max(1, Math.min(5, rank));
      u.hp = maxHp(u);
      u.squad = "deployed";
      a.data.units.push(u);
      out.push(u);
    }
    return out;
  }
  magicKit(all = false) {
    const g = this.game,
      w = g.war!;
    for (const type of [
      ...new Set(
        MAGIC_RESEARCH.filter(
          (r) => all || ["fire", "ice", "multiball"].includes(r.id),
        ).map((r) => r.facility),
      ),
    ])
      this.build(type, true);
    for (const r of MAGIC_RESEARCH)
      if (all || ["fire", "ice", "multiball"].includes(r.id))
        w.player.data.magic!.research[r.id] = all ? 3 : 1;
    w.player.data.magic!.loadout.balls = ["fire", "ice", "thunder", "cannon"];
    w.player.data.magic!.loadout.spells = ["fireStorm", "frostField"];
  }
  summonBoss(region: string) {
    if (this.baseBossFilter)
      this.game.war!.army.combat.damageFilter = this.baseBossFilter;
    else this.baseBossFilter = this.game.war!.army.combat.damageFilter;
    const s = this.host.session;
    const session = {
      ...s.battle!,
      stage: `${REGIONS.findIndex((r) => r.id === region) + 1}-3`,
    } as CampaignSession;
    session.mission.boss = null;
    this.boss = new BossManager(this.game, session);
    s.battle!.mission = session.mission;
    s.wave.bossRegion = region;
    return this.boss;
  }
  restoreBoss() {
    this.baseBossFilter = this.game.war!.army.combat.damageFilter;
    const s = this.host.session;
    if (!s.battle?.mission.boss) return;
    const session = {
      ...s.battle,
      stage: `${REGIONS.findIndex((r) => r.id === (s.wave.bossRegion || s.options.region)) + 1}-3`,
    };
    this.boss = new BossManager(this.game, session);
  }
  setRegion(region: string) {
    const s = this.host.session,
      w = this.game.war!,
      index = REGIONS.findIndex((r) => r.id === region);
    if (index < 0) return;
    this.terrain?.dispose();
    s.options.region = region;
    s.battle!.stage = `${index + 1}-3`;
    s.battle!.mission.deviceHealth = {};
    s.battle!.mission.deviceCooldowns = {};
    this.terrain = new RegionalPhysicsSystem(this.game, s.battle!);
    if (this.extension) this.extension.regionId = region;
    const b = w.builder,
      active = b.active,
      pay = w.player.resources.transact.bind(w.player.resources);
    b.active = true;
    w.player.resources.transact = () => true;
    try {
      for (const item of [...b.buildings]) {
        if (!this.terrain.placement(item)) continue;
        let moved = false;
        for (const y of [430, 490, 550, 610, 670]) {
          for (const x of [100, 170, 240, 330, 400, 470])
            if (!b.move(item.id, { ...item, x, y })) {
              moved = true;
              break;
            }
          if (moved) break;
        }
        if (!moved) {
          w.player.resources.reward(item.paid);
          b.data.buildings = b.buildings.filter((x) => x.id !== item.id);
          w.onNotice("지역 장치와 겹친 시설을 자원으로 돌려받았습니다.");
        }
      }
    } finally {
      b.active = active;
      w.player.resources.transact = pay;
    }
    w.syncStructures();
    w.layout();
    for (const a of [w.army, w.enemyArmy]) {
      a.navigation.invalidate();
      a.navigation.rebuild(w.navigationBuildings);
      for (const u of a.living) {
        const p = a.navigation.closest(u);
        if (p) {
          u.x = p.x;
          u.y = p.y;
          u.path = [];
        }
      }
    }
  }
  clearBoss() {
    if (this.baseBossFilter)
      this.game.war!.army.combat.damageFilter = this.baseBossFilter;
    if (this.session.mission.boss) {
      const id = this.session.mission.boss.unitId;
      this.game.war!.enemyArmy.data.units =
        this.game.war!.enemyArmy.data.units.filter((u) => u.id !== id);
    }
    this.session.mission.boss = null;
    this.boss = undefined;
  }
  preserve() {
    const w = this.game.war!;
    this.game.checkpoint();
    return structuredClone(w.data);
  }
  dispose() {
    this.disposers.splice(0).forEach((off) => off());
    this.terrain?.dispose();
    this.terrain = undefined;
    this.boss = undefined;
    this.extension = undefined;
  }
}
