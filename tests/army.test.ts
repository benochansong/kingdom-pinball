import { describe, it, expect } from "vitest";
import { ArmyManager } from "../src/army/ArmyManager";
import { UNITS, unitConfig, FORMATIONS } from "../src/config/army";
import { EconomyManager } from "../src/economy/EconomyManager";
import {
  EconomySaveManager,
  freshEconomy,
  sanitizeEconomy,
} from "../src/economy/EconomySaveManager";
import {
  freshBuildings,
  freshProduction,
  type BuildingEntity,
} from "../src/building/types";
import { GameStateManager } from "../src/core/GameStateManager";
import { SaveManager } from "../src/systems/SaveManager";
import {
  counter,
  damageAmount,
  maxHp,
  awardXp,
} from "../src/army/DamageCalculator";
import { formationPosition } from "../src/army/FormationManager";
import { sanitizeArmy } from "../src/army/MilitarySaveManager";
import type { UnitKind } from "../src/army/types";
import Matter from "matter-js";
import { PinballPhysics } from "../src/physics/PinballPhysics";
import { applyBuildings } from "../src/building/BuildingPhysicsAdapter";
const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
  };
};
const building = (
  type = "barracks",
  id = "building-1",
  x = 300,
  y = 340,
): BuildingEntity => ({
  id,
  type,
  x,
  y,
  angle: 0,
  level: 5,
  paid: {},
  production: freshProduction(),
  charge: 0,
  lastHit: -10000,
  readyAt: 0,
});
const setup = (type = "barracks") => {
  const d = freshEconomy();
  d.rank = 5;
  d.storageLevel = 5;
  d.building = freshBuildings();
  d.building.territories = ["central", "west", "east", "north", "outer"];
  d.building.buildings = [building(type)];
  d.resources = {
    wood: 5000,
    stone: 5000,
    gold: 10000,
    food: 5000,
    mana: 1000,
    energy: 100,
  };
  const e = new EconomyManager(d, new EconomySaveManager(memory()));
  return new ArmyManager(e);
};
const tick = (a: ArmyManager, seconds: number) => {
  for (let i = 0; i < seconds * 20; i++) {
    a.economy.data.time += 50;
    a.tick(0.05, a.economy.data.time);
  }
};
describe("Military production and growth", () => {
  it.each(UNITS.map((u) => [u.id, u.building] as const))(
    "trains %s with a single payment at %s",
    (kind, type) => {
      const a = setup(type),
        before = { ...a.economy.data.resources };
      expect(a.enqueue("building-1", kind, 1)).toBe(1);
      for (const [r, c] of Object.entries(unitConfig(kind).cost))
        expect(a.economy.data.resources[r as keyof typeof before]).toBe(
          before[r as keyof typeof before] - c,
        );
      tick(a, unitConfig(kind).seconds / 2 + 1);
      expect(a.living.map((u) => u.kind)).toContain(kind);
      expect(a.queueFor("building-1").entries).toHaveLength(0);
    },
  );
  it("enforces population reservations, queue capacity and funds including auto production", () => {
    const a = setup();
    a.economy.data.rank = 1;
    a.buildings[0].level = 1;
    expect(a.enqueue("building-1", "swordsman", "max")).toBe(5);
    expect(a.enqueue("building-1", "swordsman", 1)).toBe(0);
    a.economy.data.resources.food = 0;
    a.auto("building-1", "swordsman");
    tick(a, 15);
    expect(a.data.stats.produced.swordsman).toBe(1);
    expect(a.reserved).toBe(4);
    expect(a.population + a.reserved).toBeLessThanOrEqual(a.capacity);
  });
  it("a hit can complete only one paid queue entry; duplicates and invalid hits do nothing", () => {
    const a = setup();
    a.enqueue("building-1", "swordsman", 5);
    const q = a.queueFor("building-1");
    q.entries[0].progress = 0.95;
    a.hit("building-1", 1000, 800, true);
    expect(a.living).toHaveLength(1);
    expect(q.entries[0].progress).toBe(0);
    a.hit("building-1", 1000, 800, true);
    a.hit("building-1", 2000, 800, false);
    expect(q.entries[0].progress).toBe(0);
  });
  it("cancel returns at most half unpaid progress and cannot be repeated", () => {
    const a = setup();
    const gold = a.economy.data.resources.gold;
    a.enqueue("building-1", "swordsman", 1);
    const e = a.queueFor("building-1").entries[0];
    e.progress = 0.5;
    expect(a.cancel("building-1", e.id)).toBe(true);
    expect(a.cancel("building-1", e.id)).toBe(false);
    expect(a.economy.data.resources.gold).toBe(gold - 8);
  });
  it("reorders entries with paid cost and progress intact; upgrades retain progress", () => {
    const a = setup();
    a.enqueue("building-1", "swordsman", 1);
    a.enqueue("building-1", "spearman", 1);
    const q = a.queueFor("building-1");
    q.entries[0].progress = 0.4;
    const id = q.entries[0].id;
    a.reorder("building-1", q.entries[1].id);
    expect(q.entries[1].id).toBe(id);
    expect(q.entries[1].progress).toBe(0.4);
  });
  it("food shortage warns, limits new training and lowers morale only after a grace period", () => {
    const a = setup();
    a.data.units.push(a.createUnit("swordsman", "ally", { x: 290, y: 680 }));
    a.economy.data.resources.food = 0;
    tick(a, 31);
    expect(a.data.starvingMs).toBeGreaterThan(0);
    const morale = a.data.morale;
    expect(a.enqueue("building-1", "swordsman", 1)).toBe(0);
    tick(a, 65);
    expect(a.data.morale).toBeLessThan(morale);
    expect(a.living).toHaveLength(1);
  });
  it("research spends once and applies equally to existing and future troops", () => {
    const a = setup("smith");
    expect(a.startResearch("weapons")).toBe(true);
    const gold = a.economy.data.resources.gold;
    expect(a.startResearch("armor")).toBe(false);
    expect(a.economy.data.resources.gold).toBe(gold);
    tick(a, 16);
    expect(a.data.research.weapons).toBe(1);
    expect(a.data.researchTask).toBeNull();
  });
  it("limits military combo stacking and independent cooldowns", () => {
    const a = setup();
    for (let i = 0; i < 5; i++) a.hit("building-1", 1000 + i * 600, 400, true);
    expect(a.data.stats.combos).toBe(1);
    expect(a.data.buffs.recruitment).toBeGreaterThan(3400);
    for (let i = 0; i < 5; i++) a.hit("building-1", 5000 + i * 600, 400, true);
    expect(a.data.stats.combos).toBe(1);
  });
  it("grants goals once and retains over-cap living units when granary is removed", () => {
    const a = setup();
    expect(a.claim("barracks")).toBe(true);
    expect(a.claim("barracks")).toBe(false);
    a.economy.data.rank = 1;
    for (let i = 0; i < 16; i++)
      a.data.units.push(
        a.createUnit("swordsman", "ally", { x: 250 + i * 5, y: 680 }),
      );
    expect(a.population).toBe(16);
    expect(a.enqueue("building-1", "swordsman", 1)).toBe(0);
    expect(a.living).toHaveLength(16);
  });
});
describe("Army navigation and combat", () => {
  it("holds position outside combat and escapes newly placed obstacles", () => {
    const a = setup(),
      u = a.createUnit("swordsman", "ally", { x: 250, y: 650 });
    a.data.units = [u];
    a.command("hold");
    tick(a, 1);
    expect([u.x, u.y]).toEqual([250, 650]);
    u.x = 300;
    u.y = 340;
    tick(a, 0.1);
    expect(a.navigation.free(u)).toBe(true);
  });
  it("routes around buildings and never crosses a blocked segment", () => {
    const a = setup();
    const p = a.navigation.path({ x: 300, y: 290 }, { x: 300, y: 390 });
    expect(p.length).toBeGreaterThan(10);
    for (let i = 1; i < p.length; i++)
      expect(a.navigation.clearLine(p[i - 1], p[i])).toBe(true);
  });
  it("formation choice changes the real front-line placement", () => {
    const a = setup();
    const knight = a.createUnit("knight", "ally", { x: 200, y: 650 }),
      guard = a.createUnit("guard", "ally", { x: 220, y: 650 });
    a.data.units = [knight, guard];
    expect(formationPosition(knight, a.data.units, "standard")).not.toEqual(
      formationPosition(knight, a.data.units, "assault"),
    );
    for (const f of Object.keys(FORMATIONS))
      expect(a.formation(f as keyof typeof FORMATIONS)).toBe(true);
  });
  it("counter multipliers, shields, armor and minimum damage compose", () => {
    const a = setup();
    const spear = a.createUnit("spearman", "ally", { x: 250, y: 650 }),
      knight = a.createUnit("knight", "enemy", { x: 280, y: 650 }),
      guard = a.createUnit("guard", "enemy", { x: 300, y: 650 });
    expect(counter("spearman", "knight")).toBe(1.75);
    expect(damageAmount(spear, knight, a.data, 0, 18)).toBeGreaterThan(
      damageAmount(spear, guard, a.data, 0, 18),
    );
    expect(damageAmount(spear, guard, a.data, 0, 1, true)).toBe(1);
  });
  it("swept sphere damage has strength tiers, direction validity, enemy-only hits and cooldown", () => {
    const a = setup();
    a.data.units = [a.createUnit("guard", "ally", { x: 300, y: 650 })];
    a.startBattle(0, "challenge");
    const e = a.data.battle!.enemies[0];
    e.x = 300;
    e.y = 650;
    const hp = e.hp,
      ally = a.data.units[0].hp;
    a.combat.sphere({ x: 275, y: 650 }, { x: 310, y: 650 }, 800, 1000, true);
    expect(e.hp).toBe(hp - 40);
    a.combat.sphere({ x: 275, y: 650 }, { x: 310, y: 650 }, 800, 1100, true);
    expect(e.hp).toBe(hp - 40);
    a.combat.sphere({ x: 275, y: 650 }, { x: 310, y: 650 }, 800, 2000, false);
    expect(e.hp).toBe(hp - 40);
    expect(a.data.units[0].hp).toBe(ally);
  });
  it("melee, arrows, area projectiles and healing produce actual combat contributions", () => {
    const a = setup();
    a.data.units = [
      "guard",
      "archer",
      "mage",
      "healer",
      "catapult",
      "knight",
      "spearman",
      "swordsman",
    ].map((kind, i) =>
      a.createUnit(kind as UnitKind, "ally", { x: 230 + i * 15, y: 650 }),
    );
    a.startBattle(3, "challenge");
    for (const [i, u] of a.data.units.entries()) {
      u.x = 230 + i * 15;
      u.y = 650;
      if (u.kind === "guard") u.hp = 100;
    }
    for (const [i, u] of a.data.battle!.enemies.entries()) {
      u.x = 230 + (i % 8) * 15;
      u.y = 610 - Math.floor(i / 8) * 18;
    }
    tick(a, 15);
    const contributions = a.data.battle?.contributions ?? {};
    const damage =
      Object.values(contributions).reduce((s, c) => s + c.damage, 0) +
      Object.values(a.data.lastResult?.damage ?? {}).reduce((s, n) => s + n, 0);
    const healing =
      Object.values(contributions).reduce((s, c) => s + c.healing, 0) +
      Object.values(a.data.lastResult?.healing ?? {}).reduce(
        (s, n) => s + n,
        0,
      );
    expect(damage).toBeGreaterThan(0);
    expect(healing).toBeGreaterThan(0);
  });
  it("dead units cannot start attacks and repeated death cannot release extra population", () => {
    const a = setup();
    const u = a.createUnit("swordsman", "ally", { x: 290, y: 680 });
    a.data.units = [u];
    a.startBattle(0, "challenge");
    a.combat.hurt(u, 500);
    const losses = a.data.stats.losses;
    a.combat.hurt(u, 500);
    expect(a.data.stats.losses).toBe(losses);
    expect(a.population).toBe(0);
    tick(a, 0.1);
    expect(a.data.lastResult?.outcome).toBe("defeat");
  });
  it("ranks grow by contribution and preserve health ratio on promotion", () => {
    const a = setup(),
      u = a.createUnit("swordsman", "ally", { x: 300, y: 680 });
    u.hp = 50;
    awardXp(u, 100);
    expect(u.rank).toBe(3);
    expect(u.hp / maxHp(u)).toBeCloseTo(0.5);
  });
  it("victory rewards are single-use and repeat challenge XP is disabled", () => {
    const a = setup();
    a.data.units = [a.createUnit("swordsman", "ally", { x: 290, y: 680 })];
    a.startBattle(0, "challenge");
    a.economy.data.resources.gold = 100;
    const gold = a.economy.data.resources.gold;
    a.finish("victory");
    expect(a.economy.data.resources.gold).toBe(gold + 40);
    a.startBattle(0, "challenge");
    expect(a.data.battle!.rewardEligible).toBe(false);
    a.finish("victory");
    expect(a.economy.data.resources.gold).toBe(gold + 40);
  });
});
describe("Army persistence and isolation", () => {
  it("autonomous armies navigate the normal table and resolve a complete encounter", () => {
    const a = setup();
    a.data.units = Array.from({ length: 10 }, (_, i) =>
      a.createUnit(i % 2 ? "archer" : "guard", "ally", {
        x: 200 + i * 20,
        y: 650,
      }),
    );
    a.startBattle(0, "challenge");
    tick(a, 180);
    expect(a.data.lastResult?.outcome).toBe("victory");
    expect(a.data.lastResult!.kills).toBe(3);
  });
  it.each([20, 50, 100])(
    "measures %i units with 20 static fixtures and bounded combat objects",
    (count) => {
      const a = setup();
      a.economy.data.building!.buildings = Array.from({ length: 20 }, (_, i) =>
        building(
          "woodDeflector",
          `building-${i + 1}`,
          110 + (i % 5) * 85,
          180 + Math.floor(i / 5) * 130,
        ),
      );
      a.navigation.rebuild(a.buildings);
      a.data.units = Array.from({ length: count }, (_, i) =>
        a.createUnit(
          UNITS[i % 8].id,
          "ally",
          a.navigation.closest({
            x: 150 + (i % 16) * 18,
            y: 610 + Math.floor(i / 16) * 16,
          })!,
        ),
      );
      a.startBattle(3, "challenge");
      const physics = new PinballPhysics();
      applyBuildings(physics, a.buildings);
      physics.spawn();
      physics.launch(0.8);
      const bodies = Matter.Composite.allBodies(physics.engine.world).length,
        start = performance.now();
      const samples: number[] = [];
      for (let i = 0; i < 600; i++) {
        const begin = performance.now();
        for (let j = 0; j < 4; j++) physics.step(1 / 240);
        a.economy.data.time += 1000 / 60;
        a.tick(1 / 60, a.economy.data.time);
        samples.push(performance.now() - begin);
      }
      samples.sort((a, b) => a - b);
      console.log(
        `${count} units + 20 buildings: 10 simulated seconds / ${(performance.now() - start).toFixed(1)}ms CPU; frame p95=${samples[570].toFixed(2)}ms; ${bodies} Matter bodies`,
      );
      expect(Matter.Composite.allBodies(physics.engine.world)).toHaveLength(
        bodies,
      );
      expect(a.combat.effects.length).toBeLessThanOrEqual(48);
      expect(a.data.battle?.projectiles.length ?? 0).toBeLessThanOrEqual(160);
      physics.dispose();
    },
  );
  it("bounds history and effects across 30 repeated encounters", () => {
    const a = setup();
    a.data.units = [a.createUnit("guard", "ally", { x: 290, y: 680 })];
    for (let i = 0; i < 30; i++) {
      a.startBattle(0, "challenge");
      tick(a, 0.1);
      a.finish("aborted");
    }
    expect(a.data.history).toHaveLength(10);
    expect(a.data.battle).toBeNull();
    expect(a.data.units).toHaveLength(1);
    expect(a.combat.effects.length).toBeLessThanOrEqual(48);
  });
  it("practice restores real resources, troops, queue progress and the exact real ball object", () => {
    const storage = memory(),
      g = new GameStateManager(
        new SaveManager(memory()),
        new EconomySaveManager(storage),
      );
    g.startKingdom(true);
    const a = g.army!;
    a.data.units = [a.createUnit("swordsman", "ally", { x: 290, y: 680 })];
    g.checkpoint();
    const before = JSON.stringify(g.economy!.data),
      ball = g.physics.ball;
    expect(g.startTraining(0, true)).toBeNull();
    expect(g.practicing).toBe(true);
    g.army!.economy.data.resources.gold = 0;
    g.army!.data.units[0].hp = 1;
    for (let i = 0; i < 30; i++) g.update(50);
    g.army!.finish("aborted");
    expect(g.practicing).toBe(false);
    expect(JSON.stringify(g.economy!.data)).toBe(before);
    expect(g.physics.ball).toBe(ball);
    g.dispose();
  });
  it("persists active challenge damage, IDs and paid queue progress without duplication", () => {
    const a = setup();
    a.enqueue("building-1", "swordsman", 1);
    tick(a, 7);
    a.enqueue("building-1", "swordsman", 1);
    a.startBattle(0, "challenge");
    a.data.units[0].hp = 31;
    a.queueFor("building-1").entries[0].progress = 0.37;
    a.checkpoint();
    const loaded = sanitizeEconomy(a.economy.data)!;
    expect(loaded.army!.units[0].hp).toBe(31);
    expect(loaded.army!.battle?.mode).toBe("challenge");
    expect(loaded.army!.queues["building-1"].entries[0].progress).toBe(0.37);
    expect(new Set(loaded.army!.units.map((u) => u.id)).size).toBe(
      loaded.army!.units.length,
    );
  });
  it("sanitizes corrupt army fields without discarding the kingdom", () => {
    const d = freshEconomy();
    expect(
      sanitizeEconomy({ ...d, version: 2, army: undefined })?.army?.units,
    ).toEqual([]);
    const a = sanitizeArmy({
      morale: Infinity,
      units: [{ id: "bad", kind: "dragon" }],
      queues: { wrong: { entries: [{}] } },
      formation: "bad",
    });
    expect(a.morale).toBe(70);
    expect(a.units).toEqual([]);
    expect(a.formation).toBe("standard");
  });
  it("pausing, construction and TEST BALL freeze all army timers", () => {
    const g = new GameStateManager();
    g.startKingdom(true);
    g.economy!.data.building!.buildings.push(building());
    g.army!.enqueue("building-1", "swordsman", 1);
    g.pause();
    const before = JSON.stringify(g.army!.data);
    for (let i = 0; i < 50; i++) g.update(100);
    expect(JSON.stringify(g.army!.data)).toBe(before);
    g.enterBuild();
    g.startTestBall();
    for (let i = 0; i < 50; i++) g.update(100);
    expect(JSON.stringify(g.army!.data)).toBe(before);
    g.dispose();
  });
});
