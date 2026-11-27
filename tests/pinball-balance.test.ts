import { describe, it, expect } from "vitest";
import Matter from "matter-js";
import {
  BallProtection,
  freshProtection,
  sanitizeProtection,
} from "../src/systems/BallProtection";
import { GameStateManager } from "../src/core/GameStateManager";
import { SaveManager } from "../src/systems/SaveManager";
import { EconomySaveManager } from "../src/economy/EconomySaveManager";
import { WarSaveManager } from "../src/war/WarSaveManager";
import { PinballPhysics } from "../src/physics/PinballPhysics";
import { OUTLANE_GUARDS, PINBALL_DIFFICULTIES } from "../src/config/pinball";
import { TERRAIN } from "../src/config/terrain";
import { ELEMENTS } from "../src/config/magic";
import { fixedBlocked } from "../src/building/PlacementValidator";
import { ServerSimulation } from "../server/simulation";
import { DEFAULT_RULES } from "../src/network/protocol";
import { FlipperController } from "../src/physics/FlipperController";
import { trackOutlane, inFlipperApproach } from "../src/physics/outlane";
function fixture() {
  const rows = new Map<string, string>(),
    storage = {
      getItem: (k: string) => rows.get(k) ?? null,
      setItem: (k: string, v: string) => {
        rows.set(k, v);
      },
    };
  const create = () =>
    new GameStateManager(
      new SaveManager(storage),
      new EconomySaveManager(storage),
      new WarSaveManager(storage),
    );
  return { g: create(), create };
}
function launch(g: GameStateManager) {
  g.chargeStart();
  g.charge = 0.8;
  g.chargeRelease();
}
function enter(g: GameStateManager) {
  launch(g);
  Matter.Body.setPosition(g.physics.ball!, { x: 300, y: 180 });
  g.update(10);
  expect(g.physics.gateClosed).toBe(true);
  expect(g.protection.data.enteredAt).not.toBeNull();
}
function drain(g: GameStateManager, x = 290) {
  Matter.Body.setPosition(g.physics.ball!, { x, y: 890 });
  Matter.Body.setVelocity(g.physics.ball!, { x: 0, y: 1 });
  g.update(10);
}
describe("Phase 11.1 protection and physical balance", () => {
  it("returns real guard contacts above the outlane entrance while retaining physical drain routes", () => {
    for (const guard of OUTLANE_GUARDS) {
      let escapes = 0;
      for (const offset of [-18, -9, 0, 9, 18])
        for (const vx of [-4, 0, 4]) {
          const p = new PinballPhysics([]);
          p.spawn();
          p.launch(0.8);
          Matter.Body.setPosition(p.ball!, { x: guard.x + offset, y: 745 });
          Matter.Body.setVelocity(p.ball!, { x: vx, y: 8 });
          let minY = 745;
          for (let i = 0; i < 720; i++) {
            p.step(1 / 240);
            minY = Math.min(minY, p.ball!.position.y);
          }
          if (minY < 675) escapes++;
          p.dispose();
        }
      expect(escapes).toBeGreaterThan(0);
    }
    let drains = 0;
    for (const x of [70, 110, 140, 436, 466, 510])
      for (const vx of [-7, 0, 7]) {
        const p = new PinballPhysics([]);
        p.spawn();
        p.launch(0.8);
        Matter.Body.setPosition(p.ball!, { x, y: 720 });
        Matter.Body.setVelocity(p.ball!, { x: vx, y: 10 });
        for (let i = 0; i < 1440; i++) {
          p.step(1 / 240);
          if (p.ball!.position.y > 884) {
            drains++;
            break;
          }
        }
        p.dispose();
      }
    expect(drains).toBeGreaterThan(0);
    expect(drains).toBeLessThan(18);
    const p = new PinballPhysics([]);
    p.spawn();
    p.launch(0.8);
    Matter.Body.setPosition(p.ball!, { x: 288, y: 850 });
    Matter.Body.setVelocity(p.ball!, { x: 0, y: 6 });
    for (let i = 0; i < 60; i++) p.step(1 / 240);
    expect(p.telemetry.summary().center).toBe(1);
    p.dispose();
  });
  it("does not mislabel below-flipper outlane deflections as center saves or playable approaches", () => {
    expect(trackOutlane("right", 440, 810)).toBe("right");
    expect(trackOutlane("left", 150, 810)).toBe("left");
    expect(inFlipperApproach(440, 810)).toBe(false);
    expect(inFlipperApproach(150, 810)).toBe(false);
    expect(trackOutlane("right", 350, 750)).toBe("center");
    expect(inFlipperApproach(350, 750)).toBe(true);
  });
  it("has symmetric physical flipper responses at matching base, center and tip timings", () => {
    for (const held of [false, true])
      for (const ticks of [1, 4, 8, 15])
        for (const t of [0.15, 0.5, 0.9]) {
          const left = new FlipperController("left"),
            right = new FlipperController("right");
          left.held = right.held = held;
          for (let i = 0; i < ticks; i++) {
            left.update(1 / 240, true);
            right.update(1 / 240, true);
          }
          const x = left.pivot.x + Math.cos(left.angle) * 100 * t,
            y = left.pivot.y + Math.sin(left.angle) * 100 * t - 15;
          const a = Matter.Bodies.circle(x, y, 10),
            b = Matter.Bodies.circle(576 - x, y, 10);
          Matter.Body.setVelocity(a, { x: 2, y: 7 });
          Matter.Body.setVelocity(b, { x: -2, y: 7 });
          expect(left.collide(a)).toBe(right.collide(b));
          expect(a.velocity.x).toBeCloseTo(-b.velocity.x, 8);
          expect(a.velocity.y).toBeCloseTo(b.velocity.y, 8);
        }
  });
  it("counts actual facility yield on the physical ball and gives passive guards no economic reward", () => {
    const { g } = fixture();
    g.startKingdom(true);
    launch(g);
    const target = {
      id: "forest",
      kind: "forest" as const,
      name: "forest",
      x: 180,
      y: 344,
      radius: 31,
      points: 100,
      kick: 470,
      color: 0,
    };
    g.physics.onHit({
      ball: g.physics.ball,
      target,
      speed: 500,
      normalSpeed: 500,
    });
    const raw = g.physics.telemetry.live.get(g.physics.ball!.id)!;
    expect(raw.resources.wood).toBeGreaterThan(0);
    const before = structuredClone(g.economy!.data.produced);
    Matter.Body.setPosition(g.physics.ball!, { x: 95, y: 755 });
    Matter.Body.setVelocity(g.physics.ball!, { x: -2, y: 4 });
    for (let i = 0; i < 15; i++) g.physics.step(1 / 240);
    expect(g.economy!.data.produced).toEqual(before);
    g.dispose();
  });
  it.each(PINBALL_DIFFICULTIES)(
    "starts %s timer at field entry, preserves finite budget and first-ball duration",
    (difficulty) => {
      const p = new BallProtection(freshProtection(difficulty));
      expect(p.save(999999)).toBe(false);
      p.enter(10000);
      expect(p.seconds(10000)).toBe(
        difficulty === "beginner" ? 15 : difficulty === "normal" ? 10 : 3,
      );
      const end = p.data.expiresAt,
        budget = p.data.remaining;
      for (let i = 0; i < budget; i++) {
        expect(p.save(11000)).toBe(true);
        expect(p.enter(11500)).toBe(false);
        expect(p.data.expiresAt).toBe(end);
      }
      expect(p.save(11500)).toBe(false);
      const restored = new BallProtection(sanitizeProtection(p.data, 12000));
      expect(restored.save(12000)).toBe(false);
      restored.next();
      restored.enter(20000);
      expect(restored.seconds(20000)).toBe(
        difficulty === "beginner" ? 12 : difficulty === "normal" ? 8 : 3,
      );
    },
  );
  it.each(["classic", "kingdom", "war"])(
    "saves all three drain positions once with no cost in %s",
    (mode) => {
      for (const x of [90, 290, 490]) {
        const { g } = fixture();
        if (mode === "classic") g.start(false);
        else if (mode === "kingdom") g.startKingdom(true);
        else g.startWar({ preparation: 180 });
        enter(g);
        const end = g.protection.data.expiresAt,
          id = g.physics.ball!.id;
        drain(g, x);
        expect(g.ballStatus).toBe("ready");
        expect(g.physics.ball!.id).not.toBe(id);
        expect(g.remaining).toBe(5);
        expect(g.economy?.data.resources.energy ?? 100).toBe(100);
        expect(g.protection.data.remaining).toBe(0);
        launch(g);
        drain(g, x);
        for (let i = 0; i < 90; i++) g.update(10);
        expect(g.ballStatus).toBe("ready");
        expect(g.protection.data.first).toBe(false);
        expect(g.protection.data.enteredAt).toBeNull();
        expect(g.economy?.data.resources.energy ?? 80).toBe(80);
        expect(g.protection.data.expiresAt).not.toBe(end);
        g.dispose();
      }
    },
  );
  it("persists a consumed free save before replacement and never farms first protection on reload", () => {
    const { g, create } = fixture();
    g.startKingdom(true);
    enter(g);
    drain(g);
    const end = g.protection.data.expiresAt,
      h = create();
    h.startKingdom(false);
    expect(h.protection.data.remaining).toBe(0);
    expect(h.protection.data.expiresAt).toBe(end);
    launch(h);
    drain(h);
    for (let i = 0; i < 90; i++) h.update(10);
    expect(h.protection.data.first).toBe(false);
    expect(h.economy!.data.resources.energy).toBe(80);
    g.dispose();
    h.dispose();
  });
  it("expires while awaiting the free launch, but freezes during pause", () => {
    const { g } = fixture();
    g.start(false);
    enter(g);
    drain(g);
    const now = g.time;
    g.pause();
    g.update(1000);
    expect(g.time).toBe(now);
    g.resume();
    for (let i = 0; i < 1100; i++) g.update(10);
    expect(g.protection.seconds(g.time)).toBe(0);
    launch(g);
    drain(g);
    expect(g.remaining).toBe(4);
    g.dispose();
  });
  it.each([3, 5, 7, 10])(
    "does not spend the base save on one temporary loss among %s balls",
    (count) => {
      const { g } = fixture();
      g.startWar({ preparation: 180 });
      enter(g);
      for (let i = 1; i < count; i++) g.physics.addSphere();
      g.magic!.balls!.sync();
      const dead = g.physics.balls.at(-1)!;
      Matter.Body.setPosition(dead, { x: 490, y: 890 });
      g.update(10);
      expect(g.protection.data.remaining).toBe(1);
      expect(g.physics.balls).toHaveLength(count - 1);
      for (const [i, b] of g.physics.balls.entries()) {
        Matter.Body.setPosition(b, { x: 60 + i * 50, y: 920 });
        Matter.Body.setVelocity(b, { x: 0, y: 5 });
      }
      g.update(10);
      expect(g.protection.data.remaining).toBe(0);
      expect(g.physics.balls).toHaveLength(1);
      expect(g.ballStatus).toBe("ready");
      g.dispose();
    },
  );
  it("uses one finite kickback impulse on the same body, requiring alternating valid targets to recharge", () => {
    const { g } = fixture();
    g.start(false);
    enter(g);
    const p = g.protection;
    for (let i = 0; i < 8; i++)
      p.hit(i % 2 ? "forest" : "bonus", 100, 1000 + i * 1000);
    expect(p.data.left).toBe(1);
    const b = g.physics.ball!;
    Matter.Body.setPosition(b, { x: 110, y: 720 });
    Matter.Body.setVelocity(b, { x: 0, y: 5 });
    g.updateProtection();
    expect(b.velocity.y).toBeLessThan(0);
    expect(g.physics.ball).toBe(b);
    expect(g.physics.balls).toHaveLength(1);
    expect(p.data.left).toBe(0);
    for (let i = 0; i < 20; i++) p.hit("bonus", 100, 10000 + i * 1000);
    expect(p.data.left).toBe(0);
    g.dispose();
  });
  it("counts each physical loss once and keeps bounded diagnostics", () => {
    const p = new PinballPhysics();
    p.telemetry.enabled = true;
    p.spawn();
    p.launch(0.8);
    Matter.Body.setPosition(p.ball!, { x: 490, y: 720 });
    p.step(1 / 240);
    Matter.Body.setPosition(p.ball!, { x: 490, y: 890 });
    for (let i = 0; i < 4; i++) p.step(1 / 240);
    p.removeBall();
    expect(p.telemetry.summary().drains).toBe(1);
    expect(p.telemetry.summary().right).toBe(1);
    expect(p.telemetry.records[0].entryAngle).toBeTypeOf("number");
    p.dispose();
  });
  it("places physical guards outside saved build footprints and clear of all eight regional devices", () => {
    expect(Object.keys(TERRAIN)).toHaveLength(8);
    for (const guard of OUTLANE_GUARDS) {
      expect(guard.y - guard.radius - 15).toBeGreaterThanOrEqual(748);
      expect(fixedBlocked(guard)).toBe(true);
      for (const devices of Object.values(TERRAIN))
        for (const d of devices) {
          expect(Math.hypot(d.x - guard.x, d.y - guard.y)).toBeGreaterThan(
            d.radius + guard.radius + 20,
          );
          if (d.to)
            expect(
              Math.hypot(d.to.x - guard.x, d.to.y - guard.y),
            ).toBeGreaterThan(guard.radius + 20);
        }
    }
  });
  it.each(ELEMENTS.map((e) => e.id))(
    "keeps %s collisions finite across both guard approaches",
    (type) => {
      const { g } = fixture();
      g.startWar({ preparation: 180 });
      launch(g);
      for (const x of [110, 466]) {
        const b = g.physics.ball!;
        g.magic!.balls!.transform(b, type, g.time + 30000);
        Matter.Body.setPosition(b, { x, y: 710 });
        Matter.Body.setVelocity(b, { x: x < 288 ? -1 : 1, y: 8 });
        for (let i = 0; i < 480; i++) {
          g.physics.step(1 / 240);
          expect(Number.isFinite(b.position.x + b.position.y)).toBe(true);
          expect(b.speed * 60).toBeLessThanOrEqual(1380.01);
        }
      }
      g.dispose();
    },
  );
  it("applies identical official protection to both online seats and charges after the free save", () => {
    const s = new ServerSimulation({ ...DEFAULT_RULES });
    for (const g of s.games) {
      enter(g);
      expect(g.protection.data.difficulty).toBe("normal");
      Matter.Body.setPosition(g.physics.ball!, { x: 290, y: 890 });
    }
    s.step();
    for (const g of s.games) {
      expect(g.protection.data.remaining).toBe(0);
      expect(g.economy!.data.resources.energy).toBe(100);
      launch(g);
      Matter.Body.setPosition(g.physics.ball!, { x: 290, y: 890 });
    }
    for (let i = 0; i < 30; i++) s.step();
    for (const g of s.games) expect(g.economy!.data.resources.energy).toBe(80);
    expect(s.lost).toEqual([1, 1]);
    s.dispose();
  });
});
