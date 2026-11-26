import { describe, it, expect } from "vitest";
import { WarManager, freshWar } from "../src/war/WarManager";
import {
  WarSaveManager,
  sanitizeWar,
  WAR_KEY,
} from "../src/war/WarSaveManager";
import { GameStateManager } from "../src/core/GameStateManager";
import { SaveManager } from "../src/systems/SaveManager";
import { EconomySaveManager } from "../src/economy/EconomySaveManager";
import { DIFFICULTIES, ENEMIES } from "../src/config/war";
import Matter from "matter-js";
const memory = () => {
  const d = new Map<string, string>();
  return {
    getItem: (k: string) => d.get(k) ?? null,
    setItem: (k: string, v: string) => {
      d.set(k, v);
    },
  };
};
const make = () => new WarManager(freshWar(), new WarSaveManager(memory()));
const tick = (w: WarManager, seconds: number) => {
  for (let i = 0; i < seconds * 20 && !w.data.result; i++)
    w.tick(0.05, w.now + 50);
};
describe("Kingdom war core", () => {
  it("keeps realms independent and blocks all damage during preparation", () => {
    const w = make(),
      before = w.enemy.data.resources.gold;
    w.player.resources.transact({ gold: 10 });
    expect(w.enemy.data.resources.gold).toBe(before);
    const c = w.castle("enemy");
    expect(w.damageStructure(c.id, 500, "unit", "ally")).toBe(0);
    expect(c.hp).toBe(1000);
  });
  it("uses real paid production and only deploys owned troops", () => {
    const w = make();
    tick(w, 195);
    expect(w.enemy.resources.totalProduction).toBeGreaterThan(0);
    expect(w.enemy.data.spent.food).toBeGreaterThan(0);
    expect(w.enemyArmy.data.stats.produced.swordsman).toBeGreaterThan(0);
    expect(
      w.activeEnemies.every((u) => w.enemyArmy.data.units.includes(u)),
    ).toBe(true);
    expect(w.enemyArmy.living.length).toBeLessThanOrEqual(
      Object.values(w.enemyArmy.data.stats.produced).reduce(
        (a, b) => a + (b ?? 0),
        0,
      ),
    );
  });
  it("breaks actual defenses to remove castle protection and freezes a final result", () => {
    const w = make();
    w.data.time = 121000;
    expect(w.protection("enemy")).toBe(0.8);
    const walls = w.data.structures.filter(
      (s) => s.side === "enemy" && s.defense,
    );
    w.damageStructure(walls[0].id, 100000, "unit", "ally");
    expect(w.protection("enemy")).toBe(0.4);
    w.damageStructure(walls[1].id, 100000, "unit", "ally");
    expect(w.protection("enemy")).toBe(0);
    w.damageStructure(w.castle("enemy").id, 100000, "unit", "ally");
    w.tick(0.05, w.now + 50);
    expect(w.data.result?.outcome).toBe("victory");
    const before = JSON.stringify(w.data);
    tick(w, 10);
    expect(JSON.stringify(w.data)).toBe(before);
    expect(w.save.records()).toHaveLength(1);
    w.finish("victory", "duplicate");
    expect(w.save.records()).toHaveLength(1);
  });
  it("resolves same-update castle destruction as draw", () => {
    const w = make();
    w.data.time = 121000;
    w.damageStructure(w.castle("ally").id, 1e6, "unit", "enemy");
    w.damageStructure(w.castle("enemy").id, 1e6, "unit", "ally");
    w.tick(0.05, w.now + 50);
    expect(w.data.result?.outcome).toBe("draw");
  });
  it("stops destroyed economy production and preserves paid military queues", () => {
    const w = make();
    w.data.time = 121000;
    const b = w.player.data.building!.buildings[0];
    expect(w.army.enqueue(b.id, "swordsman", 1)).toBe(1);
    w.damageStructure(b.id, 1e5, "unit", "enemy");
    tick(w, 20);
    expect(w.army.living).toHaveLength(0);
    expect(w.army.queueFor(b.id).entries).toHaveLength(1);
    const f = w.data.structures.find(
      (s) => s.side === "enemy" && s.fixed === "forest",
    )!;
    w.damageStructure(f.id, 1e5, "sphere", "ally");
    expect(w.enemy.harvest("forest", 300, true)).toBeUndefined();
  });
  it("charges repair once and applies castle recovery cap and cooldown", () => {
    const w = make();
    w.data.time = 121000;
    w.player.data.resources = {
      wood: 5000,
      stone: 5000,
      gold: 10000,
      food: 5000,
      mana: 1000,
      energy: 100,
    };
    const c = w.castle("ally");
    c.hp = 100;
    expect(w.repair(c.id)).toBeNull();
    const gold = w.player.data.resources.gold;
    expect(w.repair(c.id)).not.toBeNull();
    expect(w.player.data.resources.gold).toBe(gold);
    tick(w, 13);
    expect(c.hp).toBe(300);
    expect(w.repair(c.id)).not.toBeNull();
  });
  it("persists destruction, work, losses and isolated development save", () => {
    const storage = memory(),
      save = new WarSaveManager(storage),
      w = new WarManager(freshWar(), save);
    w.data.time = 121000;
    w.castle("ally").hp = 421;
    w.damageStructure(
      w.data.structures.find((s) => s.side === "enemy" && s.type === "wall")!
        .id,
      1e5,
      "unit",
      "ally",
    );
    w.checkpoint();
    const loaded = save.load()!;
    expect(
      loaded.structures.find((s) => s.castle && s.side === "ally")?.hp,
    ).toBe(421);
    expect(
      loaded.structures.filter((s) => s.side === "enemy" && s.hp === 0),
    ).toHaveLength(1);
    expect(storage.getItem("kingdom-pinball:economy:v2")).toBeNull();
    expect(storage.getItem(WAR_KEY)).not.toBeNull();
    expect(sanitizeWar({})).toBeNull();
  });
  it("integrates war table, pause, destruction bodies and independent mode switching", () => {
    const storage = memory(),
      g = new GameStateManager(
        new SaveManager(memory()),
        new EconomySaveManager(storage),
        new WarSaveManager(storage),
      );
    g.startKingdom(true);
    g.menu();
    const development = storage.getItem("kingdom-pinball:economy:v2");
    expect(g.startWar({})).toBe(true);
    g.pause();
    const time = g.war!.now;
    g.update(100);
    expect(g.war!.now).toBe(time);
    g.resume();
    g.war!.data.time = 121000;
    const s = g.war!.data.structures.find(
        (s) => s.side === "enemy" && s.type === "wall",
      )!,
      count = Matter.Composite.allBodies(g.physics.engine.world).length;
    g.war!.damageStructure(s.id, 1e5, "unit", "ally");
    expect(Matter.Composite.allBodies(g.physics.engine.world)).toHaveLength(
      count - 1,
    );
    g.menu();
    expect(storage.getItem("kingdom-pinball:economy:v2")).toBe(development);
    g.start(false);
    expect(g.war).toBeUndefined();
    expect(g.mode).toBe("classic");
    g.dispose();
  });
  it("offers five real faction policies and transparent difficulty parameters", () => {
    expect(Object.keys(ENEMIES)).toHaveLength(5);
    expect(DIFFICULTIES.normal.prep).toBe(120);
    expect(
      new Set(Object.values(ENEMIES).map((x) => x.units.join(","))).size,
    ).toBe(5);
  });
});
