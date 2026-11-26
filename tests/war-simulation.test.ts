import { it, expect } from "vitest";
import { WarManager, freshWar } from "../src/war/WarManager";
import { sanitizeWar, WarSaveManager } from "../src/war/WarSaveManager";
import { UNITS } from "../src/config/army";
import { ENEMIES } from "../src/config/war";
const make = () =>
  new WarManager(
    freshWar({ type: "siege", preparation: 60 }),
    new WarSaveManager({ getItem: () => null, setItem: () => {} }),
  );
it("restores deployed troops, paid queues, structures, jobs and AI deadlines", () => {
  const w = make();
  w.data.time = 61000;
  const u = w.enemyArmy.createUnit("knight", "enemy", { x: 300, y: 420 });
  u.squad = "deployed";
  w.enemyArmy.data.units.push(u);
  w.army.enqueue(w.army.buildings[0].id, "swordsman", 1);
  w.castle("ally").hp = 800;
  expect(w.repair(w.castle("ally").id)).toBeNull();
  w.data.ai.warningAt = 75000;
  w.checkpoint();
  const restored = new WarManager(
    sanitizeWar(JSON.parse(JSON.stringify(w.data)))!,
  );
  expect(restored.activeEnemies[0].id).toBe(u.id);
  expect(restored.army.queueFor(w.army.buildings[0].id).entries.length).toBe(1);
  expect(restored.data.work[0].paid).toMatchObject(w.data.work[0].paid);
  expect(restored.data.ai.warningAt).toBe(75000);
  expect(restored.castle("ally").hp).toBe(800);
});
it("uses travelling siege shots and completes an actual army assault", () => {
  const w = make();
  w.data.time = 61000;
  w.ai.update = () => {};
  w.army.data.units = [];
  for (const s of w.data.structures.filter(
    (s) => s.side === "enemy" && !s.castle,
  ))
    w.damageStructure(s.id, 1e6, "unit", "ally");
  for (let i = 0; i < 8; i++) {
    const p = w.army.navigation.closest({ x: 240 + i * 18, y: 210 })!;
    w.army.data.units.push(w.army.createUnit("catapult", "ally", p));
  }
  w.command("castle");
  const hp = w.castle("enemy").hp;
  w.tick(0.05, w.now + 50);
  expect(w.data.projectiles.length).toBeGreaterThan(0);
  expect(w.castle("enemy").hp).toBe(hp);
  for (let i = 0; i < 2400 && !w.data.result; i++) w.tick(0.05, w.now + 50);
  expect(w.data.result?.outcome).toBe("victory");
});
it("defers rebuilding while the sphere occupies the site and preserves over-capacity resources", () => {
  const w = make();
  w.data.time = 61000;
  w.ai.update = () => {};
  const s = w.data.structures.find(
    (s) => s.side === "ally" && s.type === "wall",
  )!;
  w.damageStructure(s.id, 1e6, "unit", "enemy");
  w.player.data.resources.wood = 4000;
  w.player.data.resources.stone = 4000;
  expect(w.repair(s.id)).toBeNull();
  w.canMaterialize = () => false;
  for (let i = 0; i < 500; i++) w.tick(0.05, w.now + 50);
  expect(s.hp).toBe(0);
  expect(w.data.work).toHaveLength(1);
  w.canMaterialize = () => true;
  for (let i = 0; i < 5; i++) w.tick(0.05, w.now + 50);
  expect(s.hp).toBe(s.maxHp);
  const before = w.player.data.resources.wood;
  w.player.resources.grant("wood", 10);
  expect(w.player.data.resources.wood).toBe(before);
});
for (const count of [20, 50, 100, 150])
  it(`profiles ${count} units with both kingdoms and bounded projectiles`, () => {
    const w = make();
    w.data.time = 61000;
    w.army.data.units = [];
    w.ai.update = () => {};
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? "ally" : "enemy",
        a = w.troops(side),
        p = a.navigation.closest({
          x: 110 + (i % 18) * 21,
          y:
            side === "ally"
              ? 460 + Math.floor(i / 18) * 14
              : 330 - Math.floor(i / 18) * 14,
        })!;
      const u = a.createUnit(UNITS[i % UNITS.length].id, side, p);
      u.squad = "deployed";
      a.data.units.push(u);
    }
    const start = performance.now();
    for (let i = 0; i < 200; i++) w.tick(0.05, w.now + 50);
    const ms = performance.now() - start;
    console.log(
      `WAR ${count} units: 10 simulation seconds / ${ms.toFixed(1)}ms CPU, ${w.data.projectiles.length} shots`,
    );
    expect(w.data.projectiles.length).toBeLessThanOrEqual(160);
    expect(
      w.data.structures.every((s) => Number.isFinite(s.hp) && s.hp >= 0),
    ).toBe(true);
  });
for (const enemy of Object.keys(ENEMIES) as (keyof typeof ENEMIES)[])
  it(`runs a 30-minute ${enemy} war simulation without invalid state`, () => {
    const w = new WarManager(
      freshWar({ enemy, preparation: 60 }),
      new WarSaveManager({ getItem: () => null, setItem: () => {} }),
    );
    // Defensive sphere fixture destroys approaching units, so all 30 minutes execute.
    let frames = 0;
    const start = performance.now();
    for (; frames < 36000 && !w.data.result; frames++) {
      w.tick(0.05, w.now + 50);
      for (const u of w.activeEnemies)
        if (u.y > 430) w.army.combat.hurt(u, 10000, undefined, true);
    }
    console.log(
      `WAR ${enemy}: ${(w.now / 1000).toFixed(0)}s simulated / ${(performance.now() - start).toFixed(0)}ms CPU, wave ${w.data.ai.wave}, built ${w.enemyArmy.buildings.length}`,
    );
    expect(frames).toBe(36000);
    expect(w.enemy.resources.totalProduction).toBeGreaterThan(500);
    expect(w.data.ai.wave).toBeGreaterThan(0);
    expect(w.enemyArmy.data.units.length).toBeLessThanOrEqual(120);
    expect(sanitizeWar(w.data)).not.toBeNull();
  }, 60000);
