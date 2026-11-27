import {writeFileSync} from "node:fs";
import { describe, it, expect } from "vitest";
import Matter from "matter-js";
import { GameStateManager } from "../src/core/GameStateManager";
import { SaveManager } from "../src/systems/SaveManager";
import { EconomySaveManager } from "../src/economy/EconomySaveManager";
import { WarSaveManager } from "../src/war/WarSaveManager";
import { freshProduction } from "../src/building/types";
import { MAGIC_RESEARCH, element } from "../src/config/magic";
import { PHYSICS } from "../src/config/physics";
const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
};
export function magicGame() {
  const store = memory(),
    g = new GameStateManager(
      new SaveManager(store),
      new EconomySaveManager(store),
      new WarSaveManager(store),
    );
  g.startWar({ type: "siege", preparation: 60 });
  g.time = g.war!.data.time = 61000;
  g.war!.ai.update = () => {};
  g.army!.data.units = [];
  g.economy!.data.resources.mana = 400;
  g.economy!.data.resources.gold = 4000;
  for (const [i, type] of [
    ...new Set(MAGIC_RESEARCH.map((r) => r.facility)),
  ].entries())
    g.economy!.data.building!.buildings.push({
      id: `building-${20 + i}`,
      type,
      x: 150 + i * 50,
      y: 450,
      angle: 0,
      level: 1,
      paid: {},
      production: freshProduction(),
      charge: 0,
      lastHit: -10000,
      readyAt: 0,
    });
  g.war!.syncStructures();
  g.magic!.data.research = Object.fromEntries(
    MAGIC_RESEARCH.map((r) => [r.id, 3]),
  );
  g.magic!.data.charge = 100;
  g.magic!.data.multiCharge = 100;
  g.magic!.data.stormCharge = 100;
  g.physics.launch(0.8);
  g.economy!.data.launchState = "inflight";
  return g;
}
describe("Magic priority 1", () => {
  it("changes properties in-place without moving, rotating, cloning or compounding mass", () => {
    const g = magicGame(),
      b = g.physics.ball!,
      p = { ...b.position },
      v = { ...b.velocity },
      id = b.id;
    expect(g.magic!.activate("cannon")).toBeNull();
    const mass = b.mass;
    g.time += 600;
    g.magic!.data.charge = 100;
    expect(g.magic!.activate("fire")).toBeNull();
    g.time += 600;
    g.magic!.data.charge = 100;
    expect(g.magic!.activate("cannon")).toBeNull();
    expect(b.id).toBe(id);
    expect(b.position).toEqual(p);
    expect(b.velocity).toEqual(v);
    expect(b.mass).toBeCloseTo(mass);
    expect(g.physics.balls).toHaveLength(1);
    g.time += 26000;
    g.magic!.tick(0.05);
    expect(g.magic!.balls!.state()!.type).toBe("steel");
    g.dispose();
  });
  it("requires real payment and shares target charge cooldowns", () => {
    const g = magicGame(),
      m = g.magic!;
    g.economy!.data.resources.mana = 0;
    expect(m.activate("fire")).toBeTruthy();
    expect(m.balls!.state()!.type).toBe("steel");
    m.data.charge = 0;
    for (let i = 0; i < 10; i++)
      m.validHit("magic-test", "arcane", g.physics.ball);
    expect(m.data.charge).toBe(8);
    g.time += 600;
    m.validHit("magic-test", "arcane", g.physics.ball);
    expect(m.data.charge).toBe(16);
    g.dispose();
  });
  it("burns, chills, cancels charge, limits stacks and chains without recursion", () => {
    const g = magicGame(),
      m = g.magic!,
      a = g.war!.enemyArmy;
    for (let i = 0; i < 8; i++) {
      const u = a.createUnit("knight", "enemy", { x: 250 + i * 20, y: 400 });
      u.squad = "deployed";
      a.data.units.push(u);
    }
    g.war!.tick(0.05, g.time);
    const u = a.living[0];
    m.elementHit(u, "fire");
    m.elementHit(u, "fire");
    m.elementHit(u, "fire");
    m.elementHit(u, "fire");
    expect(m.status.get(u.id, "burn")!.stacks).toBe(3);
    const hp = u.hp;
    g.time += 600;
    m.tick(0.6);
    expect(u.hp).toBeLessThan(hp);
    m.elementHit(u, "ice");
    expect(u.charge).toBe(false);
    expect(m.status.movement(u.id)).toBeLessThan(1);
    const others = a.living.slice(1).map((u) => u.hp);
    m.elementHit(u, "thunder");
    expect(
      a.living.slice(1).filter((u, i) => u.hp < others[i]).length,
    ).toBeLessThanOrEqual(5);
    g.dispose();
  });
  it("spawns three independent spheres then promotes without charging extra lives", () => {
    const g = magicGame(),
      m = g.magic!;
    m.data.research.multiball = 1;
    const energy = g.economy!.data.resources.energy;
    expect(m.multiball()).toBeNull();
    for (let i = 0; i < 5; i++) {
      g.time += 70;
      m.tick(0.07);
    }
    expect(g.physics.balls).toHaveLength(3);
    expect(new Set(g.physics.balls.map((b) => b.id)).size).toBe(3);
    const primary = g.physics.ball!;
    Matter.Body.setPosition(primary, { x: 300, y: 900 });
    m.balls!.drain(g.time);
    expect(g.physics.ball).not.toBe(primary);
    expect(g.physics.balls).toHaveLength(2);
    expect(g.economy!.data.resources.energy).toBe(energy);
    const survivor = g.physics.ball!;
    g.time = m.data.multi!.until + 1;
    m.tick(0.05);
    expect(g.physics.balls).toEqual([survivor]);
    expect(g.economy!.data.resources.energy).toBe(energy);
    g.dispose();
  });
  it("processes simultaneous final losses once and preserves cooldown on safe reload", () => {
    const g = magicGame(),
      m = g.magic!;
    m.data.research.multiball = 1;
    m.multiball();
    for (let i = 0; i < 5; i++) {
      g.time += 70;
      m.tick(0.07);
    }
    for (const b of g.physics.balls)
      Matter.Body.setPosition(b, { x: 300, y: 900 });
    g.update(20);
    expect(g.state).toBe("relaunch");
    expect(g.economy!.data.losses).toBe(1);
    g.update(20);
    expect(g.economy!.data.losses).toBe(1);
    g.checkpoint();
    const mana = g.economy!.data.resources.mana;
    g.startWar();
    expect(g.economy!.data.resources.mana).toBe(mana);
    expect(g.magic!.data.multi).toBeNull();
    expect(g.magic!.data.cooldowns.multiball).toBeGreaterThan(g.time);
    g.dispose();
  });
  it("freezes effect clocks while paused and caps all ten sphere speeds", () => {
    const g = magicGame(),
      m = g.magic!;
    expect(m.multiball(true)).toBeNull();
    for (let i = 0; i < 12; i++) {
      g.time += 70;
      m.tick(0.07);
    }
    expect(g.physics.balls).toHaveLength(10);
    g.pause();
    const now = g.time;
    g.update(1000);
    expect(g.time).toBe(now);
    for (const b of g.physics.balls)
      Matter.Body.setVelocity(b, { x: 100, y: 100 });
    g.physics.step(1 / 240);
    expect(
      g.physics.balls.every((b) => b.speed * 60 <= PHYSICS.maxSpeed + 0.01),
    ).toBe(true);
    expect(element("cannon").mass).toBe(1.8);
    g.dispose();
  });
});
import { MagicTraining } from "../src/magic/MagicTraining";
import { SPELLS, ELEMENTS } from "../src/config/magic";
import { sanitizeMagic } from "../src/magic/MagicSave";
describe("Magic integration boundaries", () => {
  for (const config of ELEMENTS)
    it(`keeps body identity and finite properties for ${config.id}`, () => {
      const g = magicGame(),
        b = g.physics.ball!;
      expect(g.magic!.activate(config.id)).toBeNull();
      expect(g.physics.ball).toBe(b);
      expect(b.mass).toBeGreaterThan(0);
      expect(Number.isFinite(b.frictionAir)).toBe(true);
      g.dispose();
    });
  for (const config of SPELLS)
    it(`pays once and respects cooldown for ${config.id}`, () => {
      const g = magicGame(),
        m = g.magic!,
        w = g.war!;
      const a = config.id === "holyLight" ? g.army! : w.enemyArmy;
      const u = a.createUnit(
        "guard",
        config.id === "holyLight" ? "ally" : "enemy",
        { x: 300, y: 400 },
      );
      u.hp *= 0.5;
      u.squad = "deployed";
      a.data.units.push(u);
      w.tick(0.05, g.time);
      const t =
        config.id === "royalShield"
          ? w.castle("ally")
          : config.id === "earthquake"
            ? w.castle("enemy")
            : u;
      const mana = g.economy!.data.resources.mana;
      expect(m.cast(config.id, t)).toBeNull();
      expect(g.economy!.data.resources.mana).toBeLessThan(mana);
      const after = g.economy!.data.resources.mana;
      expect(m.cast(config.id, t)).toBeTruthy();
      expect(g.economy!.data.resources.mana).toBe(after);
      g.dispose();
    });
  it("does not charge invalid area, protected period, or dead targets", () => {
    const g = magicGame(),
      m = g.magic!,
      before = g.economy!.data.resources.mana;
    expect(m.cast("chainLightning", g.war!.castle("enemy"))).toBeTruthy();
    expect(m.cast("holyLight", { x: 300, y: 700 })).toBeTruthy();
    g.time = g.war!.data.time = 0;
    expect(m.cast("earthquake", g.war!.castle("enemy"))).toBeTruthy();
    expect(g.economy!.data.resources.mana).toBe(before);
    g.dispose();
  });
  it("pauses paid research when its facility is destroyed then completes after repair", () => {
    const g = magicGame(),
      m = g.magic!;
    m.data.research.fire = 0;
    expect(m.research("fire")).toBeNull();
    const b = g.economy!.data.building!.buildings.find(
      (b) => b.type === "arcane",
    )!;
    b.disabled = true;
    g.time += 50000;
    m.tick(50);
    expect(m.data.task!.progress).toBe(0);
    b.disabled = false;
    g.time += 50000;
    m.tick(50);
    expect(m.data.research.fire).toBe(1);
    expect(m.data.task).toBeNull();
    g.dispose();
  });
  it("isolates all six training sessions and restores the original engine and paid state", () => {
    const g = magicGame(),
      training = new MagicTraining(g),
      physics = g.physics;
    g.checkpoint();
    const original = JSON.stringify(g.economy!.data);
    for (let i = 0; i < 6; i++) {
      expect(training.start(i)).toBe(true);
      g.magic!.activate("fire");
      g.update(20);
      training.exit();
      expect(g.physics).toBe(physics);
      expect(JSON.stringify(g.economy!.data)).toBe(original);
    }
    g.dispose();
  });
  it("caps storm rescue at five without ever exceeding ten bodies", () => {
    const g = magicGame(),
      m = g.magic!;
    m.multiball(true);
    for (let i = 0; i < 12; i++) {
      g.time += 70;
      m.tick(0.07);
    }
    expect(g.physics.balls.length).toBe(10);
    for (let i = 0; i < 8; i++) {
      Matter.Body.setPosition(g.physics.ball!, { x: 300, y: 910 });
      m.balls!.drain(g.time);
      expect(g.physics.balls.length).toBeLessThanOrEqual(10);
    }
    expect(m.data.multi!.saves).toBe(5);
    g.dispose();
  });
  it("rejects unresearched loadouts and sanitizes corrupt records", () => {
    const g = magicGame();
    g.magic!.data.research.chaos = 0;
    expect(
      g.magic!.configure(["chaos"], [], "steel", "core", true),
    ).toBeTruthy();
    const d = sanitizeMagic({
      charge: Infinity,
      stormCharge: -5,
      research: { fire: 999 },
      loadout: { balls: ["invalid"] },
      multi: { count: 999 },
    });
    expect(d.charge).toBe(0);
    expect(d.research.fire).toBe(3);
    expect(d.loadout.balls).toEqual([]);
    expect(d.multi).toBeNull();
    g.dispose();
  });
});
it("records real simulation cost for the ball / army matrix", () => {
  const metrics:object[]=[];
  for (const [count, units] of [
    [1, 50],
    [3, 50],
    [5, 100],
    [7, 100],
    [10, 150],
  ]) {
    const g = magicGame(),
      m = g.magic!,
      w = g.war!;
    w.army.data.units = [];
    w.enemyArmy.data.units = [];
    for (let i = 0; i < units; i++) {
      const side = i % 2 ? "ally" : "enemy",
        a = w.troops(side),
        u = a.createUnit("guard", side, {
          x: 110 + (i % 16) * 23,
          y:
            side === "ally"
              ? 510 + Math.floor(i / 16) * 14
              : 350 - Math.floor(i / 16) * 14,
        });
      u.squad = "deployed";
      a.data.units.push(u);
    }
    if (count > 1) {
      m.data.research.multiball = count === 3 ? 1 : count === 5 ? 2 : 3;
      m.multiball(count === 10);
      for (let i = 0; i < 12; i++) {
        g.time += 70;
        m.tick(0.07);
      }
    }
    const start = performance.now();
    for (let i = 0; i < 300; i++) {
      if (!g.physics.launched) {
        g.relaunch();
        g.physics.launch(0.7);
        g.economy!.data.launchState = "inflight";
      }
      g.update(1000 / 60);
    }
    metrics.push({balls:count,units,ms:Math.round(performance.now()-start),seconds:5,remainingBalls:g.physics.balls.length,remainingUnits:g.army!.combat.units.filter(u=>u.hp>0).length});
    console.info(
      `MAGIC PERF ${count} balls / ${units} units: ${(performance.now() - start).toFixed(0)}ms for 5s; remaining ${g.physics.balls.length} balls / ${g.army!.combat.units.filter((u) => u.hp > 0).length} units`,
    );
    expect(g.physics.balls.length).toBeLessThanOrEqual(10);
    g.dispose();
  }
  if(process.env.MAGIC_METRICS)writeFileSync("docs/magic-performance.json",JSON.stringify(metrics,null,2));
}, 30000);
