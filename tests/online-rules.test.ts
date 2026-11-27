import { describe, it, expect } from "vitest";
import Matter from "matter-js";
import { ServerSimulation } from "../server/simulation";
import { OnlineStore } from "../server/persistence";
import { DEFAULT_RULES } from "../src/network/protocol";
import { ONLINE_TARGETS } from "../src/network/table";
import { newTable } from "../src/modes/TableCreator";
import { SnapshotBuffer } from "../src/network/NetworkClient";
const advance = (s: ServerSimulation, seconds: number) => {
  for (let i = 0; i < 30 * seconds; i++) s.step();
};
describe("multiplayer rules and hostile input", () => {
  it("keeps live online multiballs when the primary escapes the table", () => {
    const s = new ServerSimulation({ ...DEFAULT_RULES });
    const g = s.games[0];
    g.physics.launch(0.8);
    g.economy!.data.launchState = "inflight";
    const escaped = g.physics.ball!;
    g.physics.addSphere();
    g.physics.addSphere();
    Matter.Body.setPosition(escaped, { x: -100, y: 300 });
    s.step();
    expect(g.physics.balls).toHaveLength(2);
    expect(g.physics.ball).not.toBe(escaped);
    expect(g.physics.launched).toBe(true);
    expect(g.economy!.data.launchState).toBe("inflight");
    expect(g.economy!.data.resources.energy).toBe(100);
    expect(s.lost[0]).toBe(0);
    s.dispose();
  });
  it.each([false, true])(
    "respawns both server seats after repeated %s missing-body losses, charging once",
    (missing) => {
      const s = new ServerSimulation({ ...DEFAULT_RULES });
      for (let round = 1; round <= 3; round++) {
        for (const g of s.games) {
          g.physics.launch(0.8);
          g.economy!.data.launchState = "inflight";
          if (missing) g.physics.removeBall();
          else Matter.Body.setPosition(g.physics.ball!, { x: 290, y: 890 });
        }
        advance(s, 0.1);
        for (const [seat, g] of s.games.entries()) {
          expect(g.physics.balls).toHaveLength(0);
          expect(s.lost[seat]).toBe(round);
          expect(g.economy!.data.resources.energy).toBe(100 - 20 * (round - 1));
        }
        advance(s, 1);
        for (const g of s.games) {
          expect(g.physics.balls).toHaveLength(1);
          expect(g.economy!.data.launchState).toBe("ready");
          expect(g.economy!.data.resources.energy).toBe(100 - 20 * round);
        }
      }
      s.dispose();
    },
  );
  it("restores an empty-energy server player after one emergency recovery delay", () => {
    const s = new ServerSimulation({ ...DEFAULT_RULES });
    const g = s.games[0];
    g.economy!.data.resources.energy = 0;
    g.economy!.data.launchState = "inflight";
    g.physics.launch(0.8);
    Matter.Body.setPosition(g.physics.ball!, { x: 290, y: 890 });
    advance(s, 1);
    expect(g.physics.balls).toHaveLength(0);
    expect(g.economy!.data.resources.energy).toBe(20);
    advance(s, 14);
    expect(g.physics.balls).toHaveLength(0);
    advance(s, 1);
    expect(g.physics.balls).toHaveLength(1);
    expect(g.economy!.data.resources.energy).toBe(0);
    expect(s.lost[0]).toBe(1);
    s.dispose();
  });
  it("allows launching again after the server recovers an escaped ball", () => {
    const s = new ServerSimulation({ ...DEFAULT_RULES });
    const g = s.games[0];
    g.physics.launched = true;
    g.economy!.data.launchState = "inflight";
    Matter.Body.setPosition(g.physics.ball!, { x: -100, y: 300 });
    s.step();
    expect(g.economy!.data.launchState).toBe("ready");
    expect(g.physics.launched).toBe(false);
    expect(g.economy!.beginLaunch()).toBe(true);
    s.dispose();
  });
  it("finishes a war through paid troop production and actual shared battlefield damage", () => {
    const s = new ServerSimulation({ ...DEFAULT_RULES });
    s.command(0, { type: "battleReady" });
    s.command(1, { type: "battleReady" });
    const id = s.games[0].army!.buildings[0].id;
    expect(
      s.command(0, { type: "train", id, kind: "swordsman", count: 3 }),
    ).toBeNull();
    s.command(0, { type: "order", order: "castle", lane: "center" });
    for (let i = 0; i < 30 * 600 && !s.result; i++) {
      if (i % 900 === 0)
        s.command(0, { type: "train", id, kind: "swordsman", count: 3 });
      s.step();
    }
    expect(s.result?.winner).toBe(0);
    expect(s.result?.reason).toBe("왕궁 파괴");
    expect(s.war.castle("enemy").hp).toBe(0);
    s.dispose();
  }, 15000);
  it("keeps defenses symmetrical and preparation protected, resolves simultaneous castle destruction as draw", () => {
    const s = new ServerSimulation({ ...DEFAULT_RULES });
    expect(s.war.protection("ally")).toBe(0.8);
    expect(s.war.protection("enemy")).toBe(0.8);
    const castle = s.war.castle("enemy");
    s.war.damageStructure(castle.id, 99999, "unit", "ally");
    expect(castle.hp).toBe(castle.maxHp);
    s.command(0, { type: "battleReady" });
    expect(s.war.preparing).toBe(true);
    s.command(1, { type: "battleReady" });
    expect(s.war.preparing).toBe(false);
    s.war.castle("ally").hp = 0;
    castle.hp = 0;
    s.step();
    expect(s.result!.winner).toBeNull();
    s.dispose();
  });
  it("awards resources only for real server collisions on either independent table", () => {
    const s = new ServerSimulation({ ...DEFAULT_RULES });
    for (const seat of [0, 1]) {
      const g = s.games[seat],
        target = ONLINE_TARGETS.find((t) => t.kind === "gold")!;
      const before = g.economy!.resources.totalProduction;
      expect(
        s.command(seat, { type: "hit", target: target.id, amount: 99999 }),
      ).toBeTruthy();
      g.physics.launch(0.9);
      g.economy!.data.launchState = "inflight";
      Matter.Body.setPosition(g.physics.ball!, {
        x: target.x - 45,
        y: target.y,
      });
      Matter.Body.setVelocity(g.physics.ball!, { x: 12, y: 0 });
      advance(s, 0.2);
      expect(g.economy!.resources.totalProduction).toBeGreaterThan(before);
      expect(s.hits[seat]).toBeGreaterThan(0);
    }
    s.dispose();
  });
  it("charges construction immediately, completes after server time and rejects unaffordable or foreign requests", () => {
    const s = new ServerSimulation({ ...DEFAULT_RULES });
    let accepted = false;
    const before = s.games[0].economy!.data.resources.wood;
    for (let x = 110; x <= 460 && !accepted; x += 30)
      for (let y = 400; y <= 670 && !accepted; y += 30)
        accepted =
          s.command(0, { type: "build", kind: "barracks", x, y, angle: 0 }) ===
          null;
    expect(accepted).toBe(true);
    expect(s.games[0].economy!.data.resources.wood).toBeLessThan(before);
    expect(s.work).toHaveLength(1);
    advance(s, 13);
    expect(s.games[0].army!.buildings).toHaveLength(2);
    expect(s.work).toHaveLength(0);
    const resources = s.games[0].economy!.data.resources;
    Object.keys(resources).forEach(
      (k) => (resources[k as keyof typeof resources] = 0),
    );
    expect(
      s.command(0, {
        type: "train",
        id: s.games[0].army!.buildings[0].id,
        kind: "swordsman",
        count: 1,
      }),
    ).toBeTruthy();
    expect(
      s.command(0, {
        type: "upgrade",
        id: s.games[1].army!.buildings[0].id,
        level: 1,
      }),
    ).toBeTruthy();
    for (const type of [
      "result",
      "rating",
      "damage",
      "resources",
      "teleport",
      "pause",
    ])
      expect(s.command(0, { type, value: 999999 })).toBeTruthy();
    expect(
      s.command(0, {
        type: "build",
        kind: "barracks",
        x: NaN,
        y: 500,
        angle: 0,
      }),
    ).toBeTruthy();
    s.dispose();
  });
  it("supports simultaneous paid multiball and storm without exceeding ten balls or permitting duplicate activation", () => {
    for (const storm of [false, true]) {
      const s = new ServerSimulation({ ...DEFAULT_RULES });
      for (const seat of [0, 1]) {
        const g = s.games[seat];
        g.physics.launch(0.8);
        g.magic!.data.multiCharge = 100;
        g.magic!.data.stormCharge = 100;
        const mana = g.economy!.data.resources.mana;
        expect(s.command(seat, { type: "multi", storm })).toBeNull();
        expect(g.economy!.data.resources.mana).toBeLessThan(mana);
        expect(s.command(seat, { type: "multi", storm })).toBeTruthy();
      }
      advance(s, 1);
      for (const g of s.games)
        expect(g.physics.balls).toHaveLength(storm ? 10 : 3);
      s.dispose();
    }
  });
  it("shares a cooperative castle while preserving independent resources, production and transfer limits", () => {
    const s = new ServerSimulation({ ...DEFAULT_RULES, mode: "survival" }),
      a = s.games[0],
      b = s.games[1];
    expect(a.economy).not.toBe(b.economy);
    expect(a.war).toBe(b.war);
    expect(s.command(1, { type: "formation", formation: "shield" })).toBeNull();
    expect(s.war.army.data.formation).toBe("shield");
    const before = [
      a.economy!.data.resources.food,
      b.economy!.data.resources.food,
    ];
    expect(
      s.command(0, { type: "transfer", resource: "food", amount: 25 }),
    ).toBeNull();
    expect(a.economy!.data.resources.food).toBe(before[0] - 25);
    expect(b.economy!.data.resources.food).toBe(before[1] + 25);
    expect(
      s.command(0, { type: "transfer", resource: "food", amount: -10 }),
    ).toBeTruthy();
    expect(
      s.command(0, { type: "transfer", resource: "food", amount: 100000 }),
    ).toBeTruthy();
    expect(
      s.command(1, {
        type: "train",
        id: b.army!.buildings[0].id,
        kind: "swordsman",
        count: 1,
      }),
    ).toBeNull();
    advance(s, 13);
    expect(b.army!.living.length).toBe(1);
    expect(s.war.army.data.units).toContain(b.army!.living[0]);
    expect(a.army!.population).toBe(0);
    expect(b.army!.population).toBe(1);
    s.command(0, { type: "battleReady" });
    s.command(1, { type: "battleReady" });
    s.step();
    expect(s.wave).toBe(1);
    expect(s.war.enemyArmy.living.length).toBeGreaterThan(0);
    s.war.castle("ally").hp = 500;
    const aWood = a.economy!.data.resources.wood,
      bWood = b.economy!.data.resources.wood;
    expect(
      s.command(1, { type: "repair", id: s.war.castle("ally").id }),
    ).toBeNull();
    expect(a.economy!.data.resources.wood).toBe(aWood);
    expect(b.economy!.data.resources.wood).toBeLessThan(bWood);
    s.war.castle("ally").hp = 0;
    s.step();
    expect(s.result!.winner).toBe(1);
    s.dispose();
  });
  it("runs a real campaign boss in cooperative raid and ends with a team victory", () => {
    const s = new ServerSimulation({ ...DEFAULT_RULES, mode: "raid" });
    expect(s.boss!.state.id).toBe("iron");
    expect(s.boss!.unit!.hp).toBeGreaterThan(1000);
    s.command(0, { type: "battleReady" });
    s.command(1, { type: "battleReady" });
    advance(s, 1);
    expect(s.war.enemyArmy.living.length).toBeGreaterThan(1);
    s.boss!.unit!.hp = 0;
    s.step();
    expect(s.result!.winner).toBe(0);
    s.dispose();
  });
  it("validates private table sharing and ownership without running uploaded code", () => {
    const db = new OnlineStore(),
      a = db.guest("제작 왕"),
      b = db.guest("다른 왕"),
      t = newTable("Classic");
    const saved = db.shareTable(a.profile.id, JSON.stringify(t));
    expect(db.table(saved.id).table.name).toBe(t.name);
    expect(db.deleteTable(b.profile.id, saved.id)).toBe(false);
    expect(() =>
      db.shareTable(a.profile.id, JSON.stringify({ ...t, script: "alert(1)" })),
    ).toThrow();
    expect(() => db.shareTable(a.profile.id, "x".repeat(300000))).toThrow();
    expect(db.deleteTable(a.profile.id, saved.id)).toBe(true);
    expect(() => db.table(saved.id)).toThrow();
    db.close();
  });
  it("rejects stale visual snapshots and keeps a bounded interpolation buffer", () => {
    const s = new ServerSimulation({ ...DEFAULT_RULES }),
      buffer = new SnapshotBuffer();
    for (let i = 0; i < 12; i++) {
      s.step();
      buffer.push(s.snapshot(0), i * 66);
    }
    expect(buffer.frames).toHaveLength(6);
    const latest = buffer.frames.at(-1)!.snapshot.tick;
    buffer.push({ ...s.snapshot(0), tick: 1 }, 900);
    expect(buffer.frames.at(-1)!.snapshot.tick).toBe(latest);
    expect(buffer.sample(800)!.tick).toBe(latest);
    s.dispose();
  });
});
