import { describe, it, expect } from "vitest";
import Matter from "matter-js";
import { GameStateManager } from "../src/core/GameStateManager";
import {
  SaveManager,
  SAVE_KEY,
  type StorageLike,
} from "../src/systems/SaveManager";
import { ComboManager, ScoreManager } from "../src/systems/ScoreManager";
import { TARGETS } from "../src/data/table";
import { PHYSICS } from "../src/config/physics";
import { PinballPhysics } from "../src/physics/PinballPhysics";
import { FlipperController } from "../src/physics/FlipperController";
import { BallRecoverySystem } from "../src/systems/BallRecoverySystem";

export const memory = (): StorageLike => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
};
const game = (): GameStateManager => {
  const g = new GameStateManager(new SaveManager(memory()));
  g.start(false);
  return g;
};
const step = (g: GameStateManager, ms: number, frame = 1000 / 60): void => {
  for (let elapsed = 0; elapsed < ms - 0.01; elapsed += frame)
    g.update(Math.min(frame, ms - elapsed));
};

describe("score and persistence", () => {
  it("uses exact combo tiers and expires on game time", () => {
    const c = new ComboManager();
    const expected = [
      1, 1, 1.5, 1.5, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 5,
    ];
    expected.forEach((m, i) => {
      c.hit(i * 200);
      expect(c.multiplier).toBe(m);
    });
    c.tick(6800);
    expect(c.count).toBe(0);
    expect(c.max).toBe(20);
  });
  it("debounces targets and awards royal bonus exactly once per five hits", () => {
    const s = new ScoreManager();
    expect(s.hit(TARGETS[0], 0)?.points).toBe(500);
    expect(s.hit(TARGETS[0], 1)).toBeUndefined();
    for (let i = 1; i < 5; i++) s.hit(TARGETS[0], i * 1000);
    expect(s.palaceHits).toBe(5);
    expect(s.score).toBe(6500);
    expect(s.hit(TARGETS[0], 4001)).toBeUndefined();
  });
  it("locks the bonus until four different targets were hit", () => {
    const s = new ScoreManager();
    expect(s.hit(TARGETS[5], 0)).toBeUndefined();
    TARGETS.slice(1, 5).forEach((t, i) => s.hit(t, i * 300));
    expect(s.bonusActive).toBe(true);
    expect(s.hit(TARGETS[5], 1500)?.points).toBe(2000);
    expect(s.bonusActive).toBe(false);
  });
  it("repairs corrupt values and survives blocked local storage", () => {
    const store = memory();
    store.setItem(SAVE_KEY, "{broken");
    expect(new SaveManager(store).data.highScore).toBe(0);
    store.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 1,
        highScore: -9,
        settings: { music: 90, effects: "bad" },
        recent: [null, { date: "<script>", score: -4 }],
      }),
    );
    const save = new SaveManager(store);
    expect(save.data.highScore).toBe(0);
    expect(save.data.settings.music).toBe(1);
    expect(save.data.settings.effects).toBe(0.65);
    expect(save.data.recent[0].score).toBe(0);
    const denied = new SaveManager({
      getItem: () => {
        throw Error("denied");
      },
      setItem: () => {
        throw Error("denied");
      },
    });
    expect(() => denied.persist()).not.toThrow();
  });
});

describe("fixed-step physical play", () => {
  it("follows the same trajectory at 30, 60, and 144 FPS", () => {
    const positions = [30, 60, 144].map((fps) => {
      const g = game();
      g.physics.launch(0.8);
      step(g, 1500, 1000 / fps);
      const p = { ...g.physics.ball!.position };
      g.dispose();
      return p;
    });
    positions.slice(1).forEach((p) => {
      expect(p.x).toBeCloseTo(positions[0].x, 5);
      expect(p.y).toBeCloseTo(positions[0].y, 5);
    });
  });
  it("launches into the main field and closes the return gate", () => {
    for (const power of [0.5, 1]) {
      const p = new PinballPhysics();
      p.spawn();
      p.launch(power);
      const path = [];
      for (let i = 0; i < 600; i++) {
        p.step(1 / 240);
        if (i % 60 === 0) path.push({ ...p.ball!.position });
      }
      expect(p.gateClosed, JSON.stringify({ power, path })).toBe(true);
      expect(p.ball!.position.x).toBeLessThan(532);
      p.dispose();
    }
  });
  it("contains a maximum-speed ball against the side wall", () => {
    const p = new PinballPhysics();
    p.spawn();
    p.launch(1);
    Matter.Body.setPosition(p.ball!, { x: 90, y: 590 });
    Matter.Body.setVelocity(p.ball!, { x: -PHYSICS.maxSpeed / 60, y: 0 });
    for (let i = 0; i < 40; i++) {
      p.step(1 / 240);
      expect(p.ball!.position.x).toBeGreaterThan(50);
      expect(p.ball!.speed * 60).toBeLessThanOrEqual(PHYSICS.maxSpeed + 0.001);
    }
    p.dispose();
  });
  it("gives different physical contact responses at flipper base and tip", () => {
    const speeds = [0.2, 0.9].map((t) => {
      const f = new FlipperController("left");
      f.held = true;
      f.update(1 / 240, true);
      const c = {
        x: f.pivot.x + Math.cos(f.angle) * 100 * t,
        y: f.pivot.y + Math.sin(f.angle) * 100 * t,
      };
      const b = Matter.Bodies.circle(
        c.x + Math.sin(f.angle) * 18,
        c.y - Math.cos(f.angle) * 18,
        10,
      );
      Matter.Body.setVelocity(b, { x: 0, y: 3 });
      expect(f.collide(b)).toBe(true);
      expect(b.velocity.y).toBeLessThan(0);
      return b.speed;
    });
    expect(speeds[1]).toBeGreaterThan(speeds[0]);
  });
  it("charges independently of framerate and pauses all game time", () => {
    const g = game();
    g.chargeStart();
    step(g, 650);
    expect(g.charge).toBeCloseTo(0.5, 2);
    g.pause();
    const time = g.time;
    step(g, 5000);
    expect(g.time).toBe(time);
    g.resume();
    g.chargeStart();
    step(g, 1300);
    expect(g.charge).toBeCloseTo(1);
    g.chargeRelease();
    expect(g.physics.launched).toBe(true);
    g.dispose();
  });
  it("drains exactly once and reaches game over with five spheres", () => {
    const g = game();
    for (let i = 4; i >= 0; i--) {
      Matter.Body.setPosition(g.physics.ball!, { x: 290, y: 890 });
      step(g, 20);
      expect(g.remaining).toBe(i);
      step(g, 1200);
    }
    expect(g.state).toBe("over");
    expect(g.save.data.plays).toBe(1);
    step(g, 1000);
    expect(g.save.data.plays).toBe(1);
    g.dispose();
  });
  it("keeps TILT disabled until a new sphere arrives", () => {
    const g = game();
    g.physics.launch(1);
    g.nudge();
    step(g, 660);
    g.nudge();
    step(g, 660);
    g.nudge();
    expect(g.tilt.tilted).toBe(true);
    const previous = g.score.score;
    g.physics.onHit({ target: TARGETS[0], speed: 1000, normalSpeed: 900 });
    expect(g.score.score).toBe(previous);
    Matter.Body.setPosition(g.physics.ball!, { x: 290, y: 890 });
    step(g, 1200);
    expect(g.tilt.tilted).toBe(false);
    g.dispose();
  });
  it("recovers genuine stalls without treating held catches as stuck", () => {
    const p = new PinballPhysics();
    p.spawn();
    p.launch(0.5);
    const r = new BallRecoverySystem();
    Matter.Body.setPosition(p.ball!, { x: 290, y: 400 });
    Matter.Body.setVelocity(p.ball!, { x: 0, y: 0 });
    let result;
    for (let i = 0; i < 800; i++) {
      result = r.update(p, 1 / 240, i * PHYSICS.stepMs);
      if (result) break;
    }
    expect(result).toBe("impulse");
    expect(r.suppressUntil).toBeGreaterThan(1800);
    r.reset();
    p.left.held = true;
    for (let i = 0; i < 20; i++) p.left.update(1 / 240, true);
    const c = p.left.closest({ x: 210, y: 760 });
    Matter.Body.setPosition(p.ball!, { x: c.x, y: c.y - 20 });
    Matter.Body.setVelocity(p.ball!, { x: 0, y: 0 });
    for (let i = 0; i < 1200; i++)
      expect(r.update(p, 1 / 240, i * PHYSICS.stepMs)).toBeUndefined();
    p.dispose();
  });
  it("cleans world bodies across repeated restarts", () => {
    const g = game();
    const count = Matter.Composite.allBodies(g.physics.engine.world).length;
    for (let i = 0; i < 30; i++) {
      g.start(false);
      expect(Matter.Composite.allBodies(g.physics.engine.world).length).toBe(
        count,
      );
    }
    g.dispose();
  });
});
