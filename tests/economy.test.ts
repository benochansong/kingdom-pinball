import { describe, it, expect } from "vitest";
import Matter from "matter-js";
import {
  FACILITIES,
  RESOURCE_IDS,
  RESOURCES,
  SPECIALS,
  TRADES,
  ECONOMY_TARGETS,
} from "../src/config/economy";
import { EconomyManager } from "../src/economy/EconomyManager";
import {
  EconomySaveManager,
  ECONOMY_KEY,
  freshEconomy,
  sanitizeEconomy,
} from "../src/economy/EconomySaveManager";
import { ResourceManager } from "../src/economy/ResourceManager";
import { GameStateManager } from "../src/core/GameStateManager";
import { SaveManager, type StorageLike } from "../src/systems/SaveManager";
import { OBJECTIVES } from "../src/economy/ObjectiveManager";
const memory = (): StorageLike => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
};
const economy = (): EconomyManager => {
  const e = EconomyManager.create(new EconomySaveManager(memory()));
  e.beginLaunch();
  return e;
};
const hit = (
  e: EconomyManager,
  target: string,
  speed = 300,
  interval = 900,
) => {
  e.tick(e.data.time + interval);
  return e.harvest(target, speed, true);
};
const fill = (e: EconomyManager): void => {
  for (const r of RESOURCE_IDS) e.data.resources[r] = e.resources.capacity(r);
};

describe("resources and production", () => {
  it("starts with the specified six resources and capacities", () => {
    const e = economy();
    for (const r of RESOURCE_IDS) {
      expect(e.data.resources[r]).toBe(RESOURCES[r].initial);
      expect(e.resources.capacity(r)).toBe(RESOURCES[r].capacity);
    }
  });
  it("produces all six resources through their facility definitions", () => {
    for (const f of FACILITIES) {
      const e = economy();
      e.data.resources[f.resource] = 0;
      const result = hit(e, f.target);
      expect(result?.amount).toBe(f.base);
      expect(e.data.produced[f.resource]).toBe(f.base);
    }
  });
  it("uses approaching normal speed for all five impact strengths", () => {
    [100, 300, 500, 850, 1100].forEach((speed, i) => {
      const e = economy();
      expect(hit(e, "forest", speed)?.amount).toBe([5, 10, 12, 15, 20][i]);
    });
  });
  it("rejects invalid, duplicate, zero-impulse, paused, and recovery hits", () => {
    const e = economy();
    const first = hit(e, "forest")!;
    expect(e.harvest("forest", 300, true)).toBeUndefined();
    expect(e.harvest("stone", 300, false)).toBeUndefined();
    expect(e.harvest("gold", 0, true)).toBeUndefined();
    expect(e.harvest("gold", NaN, true)).toBeUndefined();
    expect(e.data.produced.wood).toBe(first.amount);
    e.data.launchState = "awaiting";
    expect(hit(e, "stone")).toBeUndefined();
  });
  it("has a separate four-second production combo with all tiers", () => {
    const e = economy();
    const multipliers = Array.from({ length: 20 }, (_, i) =>
      i < 2 ? 1 : i < 4 ? 1.2 : i < 9 ? 1.5 : i < 19 ? 2 : 3,
    );
    multipliers.forEach((expected, i) => {
      hit(e, FACILITIES[i % 6].target);
      expect(e.multiplier).toBe(expected);
    });
    e.tick(e.data.time + 4000);
    expect(e.data.combo.count).toBe(0);
    expect(e.data.combo.max).toBe(20);
  });
  it("caps the combined multiplier at eight", () => {
    const e = economy();
    e.data.facilities.lumber.level = 5;
    e.data.combo.count = 20;
    e.data.combo.last = 0;
    e.data.royalUntil = 20000;
    e.data.event = { index: 3, until: 20000 };
    const result = hit(e, "forest", 1300);
    expect(result?.multiplier).toBe(8);
    expect(result?.amount).toBe(80);
  });
  it("clips production at storage capacity and reports overflow", () => {
    const e = economy();
    e.data.resources.wood = 497;
    const result = hit(e, "forest");
    expect(result?.amount).toBe(3);
    expect(result?.overflow).toBe(7);
    expect(e.data.resources.wood).toBe(500);
    expect(e.data.produced.wood).toBe(3);
  });
  it("overloads repeated targets, reduces output, then recovers", () => {
    const e = economy();
    for (let i = 0; i < 7; i++) hit(e, "forest", 300, 450);
    expect(e.status("lumber")).toBe("OVERLOADED");
    expect(hit(e, "forest")!.multiplier).toBeLessThan(1);
    e.tick(e.data.facilities.lumber.overloadedUntil - 1000);
    expect(e.status("lumber")).toBe("RECOVERING");
    e.tick(e.data.facilities.lumber.overloadedUntil + 1);
    expect(["READY", "BONUS"]).toContain(e.status("lumber"));
  });
});

describe("special production achievements and events", () => {
  it("awards forest, mining, farm, magic, and kingdom combos", () => {
    const sequences: Record<string, string[]> = {
      forest: Array(5).fill("forest"),
      mining: ["stone", "gold", "stone", "gold"],
      harvest: Array(5).fill("farm"),
      magic: ["crystal", "core", "crystal", "core"],
      prosperity: FACILITIES.map((f) => f.target),
    };
    for (const s of SPECIALS) {
      const e = economy();
      sequences[s.id].forEach((target) => hit(e, target));
      expect(e.data.specials[s.id].achievements, s.id).toBe(1);
      expect(e.data.specials[s.id].count).toBe(0);
      expect(e.data.specials[s.id].readyAt).toBeGreaterThan(e.data.time);
    }
  });
  it("enforces special cooldowns and time windows", () => {
    const e = economy();
    for (let i = 0; i < 10; i++) hit(e, "forest");
    expect(e.data.specials.forest.achievements).toBe(1);
    const slow = economy();
    for (const f of FACILITIES) hit(slow, f.target, 300, 5000);
    expect(slow.data.specials.prosperity.achievements).toBe(0);
    const farm = economy();
    for (let i = 0; i < 5; i++) hit(farm, "farm", 300, 4000);
    expect(farm.data.specials.harvest.achievements).toBe(0);
  });
  it("interrupts the mining chain with another production facility", () => {
    const e = economy();
    ["stone", "gold", "forest", "stone", "gold"].forEach((t) => hit(e, t));
    expect(e.data.specials.mining.achievements).toBe(0);
    expect(e.data.specials.mining.count).toBe(2);
  });
  it("allows only one event and rotates through the five configured events", () => {
    const e = economy();
    for (let i = 0; i < 5; i++) {
      e.triggerEvent();
      expect(e.data.event?.index).toBe(i);
      const until = e.data.event!.until;
      e.triggerEvent();
      expect(e.data.event!.until).toBe(until);
      e.tick(until);
      expect(e.data.event).toBeNull();
    }
  });
  it("refreshes royal production duration without multiplying repeatedly", () => {
    const e = economy();
    e.data.resources.energy = 0;
    e.royal();
    expect(e.data.resources.energy).toBe(10);
    expect(e.productionBonus("wood")).toBe(1.2);
    e.tick(5000);
    e.royal();
    expect(e.data.royalUntil).toBe(20000);
    expect(e.productionBonus("wood")).toBe(1.2);
    expect(e.data.royalCount).toBe(2);
  });
});

describe("atomic transactions, upgrades, and progression", () => {
  it("validates the entire cost and receiving capacity before any mutation", () => {
    const resources = new ResourceManager(freshEconomy());
    const snapshot = JSON.stringify(resources.data);
    expect(resources.transact({ wood: 10, gold: 9999 })).toBe(false);
    expect(resources.transact({ wood: -1 })).toBe(false);
    expect(resources.transact({ wood: 1.5 })).toBe(false);
    expect(resources.transact({ gold: 10 }, { energy: 1 })).toBe(false);
    expect(JSON.stringify(resources.data)).toBe(snapshot);
  });
  it("charges exact costs, caps facilities at level five, and changes production", () => {
    const e = economy();
    expect(e.upgrade("lumber")).toBe(true);
    expect(e.data.resources).toMatchObject({ wood: 0, stone: 0, gold: 10 });
    expect(e.upgrade("quarry")).toBe(false);
    expect(hit(e, "forest")?.amount).toBe(12);
    for (let level = 3; level <= 5; level++) {
      fill(e);
      expect(e.upgrade("lumber")).toBe(true);
      expect(e.data.facilities.lumber.level).toBe(level);
    }
    fill(e);
    const before = e.data.resources.gold;
    expect(e.upgrade("lumber")).toBe(false);
    expect(e.data.resources.gold).toBe(before);
  });
  it("expands general storage without increasing core energy capacity", () => {
    const e = economy();
    fill(e);
    expect(e.upgradeStorage()).toBe(true);
    expect(e.resources.capacity("wood")).toBe(1000);
    expect(e.resources.capacity("gold")).toBe(2000);
    expect(e.resources.capacity("energy")).toBe(100);
  });
  it("prevents profitable purchase/sale cycles for every market resource", () => {
    for (const buy of TRADES.filter((t) => t.side === "buy")) {
      const e = economy();
      e.data.resources.gold = 500;
      e.data.resources[buy.to] = 0;
      const sell = TRADES.find((t) => t.side === "sell" && t.from === buy.to)!;
      expect(e.trade(buy.id, 1)).toBe(true);
      expect(e.trade(sell.id, 1)).toBe(true);
      expect(e.data.resources.gold).toBeLessThan(500);
      expect(e.resources.totalProduction).toBe(0);
    }
  });
  it("supports five/max batches and rejects overflow without consuming funds", () => {
    const e = economy();
    e.data.resources.gold = 1000;
    e.data.resources.wood = 0;
    expect(e.trade("buy-wood", 5)).toBe(true);
    expect(e.data.resources.wood).toBe(100);
    const max = e.market.max("buy-wood");
    expect(max).toBe(20);
    expect(e.trade("buy-wood", max)).toBe(true);
    expect(e.data.resources.wood).toBe(500);
    const gold = e.data.resources.gold;
    expect(e.trade("buy-wood", 1)).toBe(false);
    expect(e.data.resources.gold).toBe(gold);
    expect(e.trade("sell-wood", -1)).toBe(false);
  });
  it("grants each objective once and grants no early rewards", () => {
    const e = economy();
    expect(e.claim("wood100")).toBe(false);
    e.data.produced.wood = 100;
    expect(e.claim("wood100")).toBe(true);
    const gold = e.data.resources.gold;
    expect(e.claim("wood100")).toBe(false);
    expect(e.data.resources.gold).toBe(gold);
    expect(OBJECTIVES).toHaveLength(13);
  });
  it("uses production plus upgrades for rank and never demotes after spending", () => {
    const e = economy();
    e.data.produced.wood = 400;
    e.progress();
    expect(e.data.rank).toBe(1);
    e.upgrade("lumber");
    expect(e.data.rank).toBe(2);
    e.data.storageLevel = 4;
    for (const f of FACILITIES) e.data.facilities[f.id].level = 4;
    e.data.produced.wood = 7000;
    e.progress();
    expect(e.data.rank).toBe(5);
    e.data.resources.gold = 0;
    e.progress();
    expect(e.data.rank).toBe(5);
  });
});

describe("core energy, checkpoints, and classic isolation", () => {
  it("waits for explicit payment and cannot pay for the same ball twice", () => {
    const e = economy();
    e.loseBall();
    expect(e.data.resources.energy).toBe(100);
    expect(e.data.launchState).toBe("awaiting");
    expect(e.payRelaunch()).toBe(true);
    expect(e.data.resources.energy).toBe(80);
    expect(e.payRelaunch()).toBe(false);
    expect(e.beginLaunch()).toBe(true);
    expect(e.beginLaunch()).toBe(false);
  });
  it("recovers energy only with sufficient gold or mana and detects exhaustion", () => {
    const e = economy();
    e.loseBall();
    e.data.resources.energy = 0;
    e.data.resources.gold = 30;
    expect(e.recoverEnergy("gold")).toBe(true);
    expect(e.data.resources.energy).toBe(20);
    expect(e.data.resources.gold).toBe(0);
    expect(e.recoverEnergy("gold")).toBe(false);
    e.payRelaunch();
    e.beginLaunch();
    e.loseBall();
    e.data.resources.mana = 8;
    expect(e.recoverEnergy("mana")).toBe(true);
    expect(e.data.resources.mana).toBe(0);
    e.data.resources.energy = 0;
    expect(e.canContinue()).toBe(false);
  });
  it("records in-flight launch before physics and reload requires paid recovery", () => {
    const storage = memory(),
      save = new EconomySaveManager(storage);
    const e = EconomyManager.create(save);
    e.beginLaunch();
    const resumed = new EconomyManager(save.load()!, save);
    resumed.resumeCheckpoint();
    expect(resumed.data.launchState).toBe("awaiting");
    expect(resumed.data.losses).toBe(1);
    const again = new EconomyManager(save.load()!, save);
    again.resumeCheckpoint();
    expect(again.data.losses).toBe(1);
    expect(again.payRelaunch()).toBe(true);
    expect(save.load()!.resources.energy).toBe(80);
  });
  it("restores safe state, upgrades, claims, statistics and trade history", () => {
    const storage = memory(),
      save = new EconomySaveManager(storage),
      e = EconomyManager.create(save);
    e.upgrade("lumber");
    e.data.produced.wood = 100;
    e.claim("wood100");
    e.trade("buy-wood", 1);
    e.checkpoint();
    const d = save.load()!;
    expect(d.facilities.lumber.level).toBe(2);
    expect(d.claimed).toContain("wood100");
    expect(d.produced.wood).toBe(100);
    expect(d.tradeCount).toBe(1);
    expect(d.trades).toHaveLength(1);
  });
  it("archives kingdoms once per identifier and keeps distinct runs", () => {
    const save = new EconomySaveManager(memory());
    const a = EconomyManager.create(save);
    a.end();
    a.end();
    expect(save.history()).toHaveLength(1);
    const b = EconomyManager.create(save);
    b.end();
    expect(save.history()).toHaveLength(2);
    expect(save.history()[0].id).toBe(b.data.id);
  });
  it("migrates preliminary economic v1 and safely sanitizes damaged data", () => {
    const d = sanitizeEconomy({
      version: 1,
      resources: { wood: 999999, stone: -1, energy: Infinity },
      facilities: { lumber: { level: 100 } },
      claimed: [null, "wood100", "wood100"],
    })!;
    expect(d.version).toBe(2);
    expect(d.resources.wood).toBe(500);
    expect(d.resources.stone).toBe(30);
    expect(d.resources.energy).toBe(100);
    expect(d.facilities.lumber.level).toBe(5);
    expect(d.claimed).toEqual(["wood100"]);
    const store = memory();
    store.setItem(ECONOMY_KEY, "{bad");
    expect(new EconomySaveManager(store).load()).toBeNull();
  });
  it("keeps classic records/settings untouched by creating and ending kingdoms", () => {
    const storage = memory(),
      classic = new SaveManager(storage);
    classic.data.highScore = 1234;
    classic.data.settings.music = 0.2;
    classic.persist();
    const g = new GameStateManager(classic, new EconomySaveManager(storage));
    g.startKingdom(true);
    g.endKingdom();
    g.startKingdom(true);
    expect(classic.data.highScore).toBe(1234);
    expect(classic.data.plays).toBe(0);
    expect(classic.data.settings.music).toBe(0.2);
    g.start(false);
    expect(g.remaining).toBe(5);
    expect(g.economy).toBeUndefined();
    g.dispose();
  });
  it("returns to a clean menu while retaining the economic checkpoint", () => {
    const store = memory(),
      save = new EconomySaveManager(store),
      g = new GameStateManager(new SaveManager(store), save);
    g.startKingdom(true);
    g.score.score = 5000;
    g.economy!.upgrade("lumber");
    g.menu();
    expect(g.score.score).toBe(0);
    expect(g.mode).toBe("classic");
    expect(g.save.data.highScore).toBe(0);
    g.startKingdom(false);
    expect(g.score.score).toBe(5000);
    expect(g.economy!.data.facilities.lumber.level).toBe(2);
    g.dispose();
  });
  it("prevents an older tab checkpoint from undoing another tab transaction", () => {
    const store = memory(),
      save = new EconomySaveManager(store),
      g = new GameStateManager(new SaveManager(store), save);
    g.startKingdom(true);
    const other = new EconomyManager(save.load()!, save);
    other.upgrade("lumber");
    g.invalidateEconomy();
    expect(g.state).toBe("paused");
    g.checkpoint();
    expect(save.load()!.facilities.lumber.level).toBe(2);
    g.startKingdom(false);
    expect(g.saveConflict).toBe(false);
    expect(g.economy!.data.resources.gold).toBe(10);
    g.dispose();
  });
  it("freezes physics, combo, overload, and events while management is paused", () => {
    const g = new GameStateManager(
      new SaveManager(memory()),
      new EconomySaveManager(memory()),
    );
    g.startKingdom(true);
    g.economy!.triggerEvent();
    g.chargeStart();
    g.update(100);
    g.chargeRelease();
    g.pause();
    const snapshot = JSON.stringify(g.economy!.data),
      position = { ...g.physics.ball!.position };
    for (let i = 0; i < 100; i++) g.update(100);
    expect(JSON.stringify(g.economy!.data)).toBe(snapshot);
    expect(g.physics.ball!.position).toEqual(position);
    g.dispose();
  });
  it("suppresses production on TILT and auto-recovery contacts", () => {
    const g = new GameStateManager(
      new SaveManager(memory()),
      new EconomySaveManager(memory()),
    );
    g.startKingdom(true);
    g.chargeStart();
    g.update(100);
    g.chargeRelease();
    const contact = {
      target: ECONOMY_TARGETS[1],
      speed: 600,
      normalSpeed: 500,
    };
    g.tilt.tilted = true;
    g.physics.onHit(contact);
    expect(g.economy!.data.validHits).toBe(0);
    g.tilt.tilted = false;
    g.recovery.suppressUntil = g.time + 2000;
    g.physics.onHit(contact);
    expect(g.economy!.data.validHits).toBe(0);
    g.dispose();
  });
  it("integrates drain, relaunch, and exhaustion without consuming classic lives", () => {
    const g = new GameStateManager(
      new SaveManager(memory()),
      new EconomySaveManager(memory()),
    );
    g.startKingdom(true);
    g.chargeStart();
    g.update(100);
    g.chargeRelease();
    Matter.Body.setPosition(g.physics.ball!, { x: 290, y: 890 });
    g.update(20);
    expect(g.state).toBe("relaunch");
    expect(g.economy!.data.resources.energy).toBe(100);
    expect(g.economy!.data.losses).toBe(1);
    expect(g.relaunch()).toBe(true);
    expect(g.economy!.data.resources.energy).toBe(80);
    expect(g.state).toBe("playing");
    g.economy!.data.resources.energy = 0;
    g.economy!.data.resources.gold = 0;
    g.economy!.data.resources.mana = 0;
    g.chargeStart();
    g.chargeRelease();
    Matter.Body.setPosition(g.physics.ball!, { x: 290, y: 890 });
    g.update(20);
    expect(g.state).toBe("over");
    expect(g.economy!.data.launchState).toBe("ended");
    g.dispose();
  });
});
