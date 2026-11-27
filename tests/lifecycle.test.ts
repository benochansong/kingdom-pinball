import { describe, it, expect } from "vitest";
import Matter from "matter-js";
import { GameStateManager } from "../src/core/GameStateManager";
import { SaveManager } from "../src/systems/SaveManager";
import { EconomySaveManager } from "../src/economy/EconomySaveManager";
import { WarSaveManager } from "../src/war/WarSaveManager";
import { GameModeManager } from "../src/modes/GameModeManager";
import { ModeSaveManager } from "../src/modes/ModeSaveManager";
import { defaultModeOptions } from "../src/config/modes";
const fixture = () => {
  const rows = new Map<string, string>();
  const store = {
    getItem: (k: string) => rows.get(k) ?? null,
    setItem: (k: string, v: string) => {
      rows.set(k, v);
    },
  };
  const g = new GameStateManager(
    new SaveManager(store),
    new EconomySaveManager(store),
    new WarSaveManager(store),
  );
  return {
    g,
    store,
    modes: new GameModeManager(g, new ModeSaveManager(store)),
  };
};
const advance = (g: GameStateManager, ms: number) => {
  for (let t = 0; t < ms; t += 10) g.update(10);
};
const launch = (g: GameStateManager) => {
  g.chargeStart();
  advance(g, 300);
  g.chargeRelease();
  expect(g.physics.launched).toBe(true);
};
const lose = (g: GameStateManager) => {
  for (const ball of g.physics.balls) {
    Matter.Body.setPosition(ball, { x: 290, y: 920 });
    Matter.Body.setVelocity(ball, { x: 0, y: 0 });
  }
  advance(g, 20);
};
describe("Phase 11 ball lifecycle", () => {
  it("plays five real classic bodies across three restarts and records exactly once per round", () => {
    const { g } = fixture();
    for (let round = 0; round < 3; round++) {
      g.start(false);
      for (let n = 5; n > 0; n--) {
        expect(Matter.Composite.allBodies(g.physics.engine.world)).toContain(
          g.physics.ball,
        );
        launch(g);
        const id = g.physics.ball!.id;
        lose(g);
        expect(g.remaining).toBe(n - 1);
        advance(g, 900);
        if (n > 1) {
          expect(g.ballStatus).toBe("ready");
          expect(g.physics.ball!.id).not.toBe(id);
        }
      }
      expect(g.state).toBe("over");
      expect(g.physics.balls).toHaveLength(0);
      advance(g, 2000);
      expect(g.save.data.plays).toBe(round + 1);
    }
    g.dispose();
  });
  it.each(["kingdom", "war"])(
    "automatically pays exactly once and respawns in %s, including exact-cost recovery",
    (mode) => {
      const { g } = fixture();
      if (mode === "kingdom") g.startKingdom(true);
      else g.startWar({ preparation: 180 });
      for (let energy = 100; energy >= 20; energy -= 20) {
        g.economy!.data.resources.energy = energy;
        launch(g);
        lose(g);
        expect(g.state).toBe("relaunch");
        expect(g.economy!.data.resources.energy).toBe(energy);
        advance(g, 900);
        expect(g.ballStatus).toBe("ready");
        expect(g.economy!.data.resources.energy).toBe(energy - 20);
        advance(g, 900);
        expect(g.economy!.data.resources.energy).toBe(energy - 20);
      }
      g.economy!.data.resources.gold = 100;
      launch(g);
      lose(g);
      advance(g, 1000);
      expect(g.ballStatus).toBe("recovery-required");
      expect(g.physics.balls).toHaveLength(0);
      expect(g.economy!.recoverEnergy("gold")).toBe(true);
      advance(g, 30);
      expect(g.ballStatus).toBe("ready");
      launch(g);
      g.dispose();
    },
  );
  it.each(["war", "kingdom"])(
    "freezes pending respawn in %s on pause, resumes it, and does not carry it into a new mode",
    (kind) => {
      const { g } = fixture();
      if (kind === "war") g.startWar({ preparation: 180 });
      else g.startKingdom(true);
      launch(g);
      lose(g);
      g.pause();
      const time = g.time;
      advance(g, 2000);
      expect(g.time).toBe(time);
      g.resume();
      advance(g, 900);
      expect(g.ballStatus).toBe("ready");
      launch(g);
      lose(g);
      g.start(false);
      advance(g, 1000);
      expect(g.physics.balls).toHaveLength(1);
      expect(g.remaining).toBe(5);
      g.dispose();
    },
  );
  it("restores a pending paid checkpoint without extra free balls or duplicate energy cost", () => {
    const { g, store } = fixture();
    g.startKingdom(true);
    launch(g);
    lose(g);
    const h = new GameStateManager(
      new SaveManager(store),
      new EconomySaveManager(store),
      new WarSaveManager(store),
    );
    h.startKingdom(false);
    advance(h, 900);
    expect(h.economy!.data.resources.energy).toBe(80);
    h.checkpoint();
    h.startKingdom(false);
    expect(h.economy!.data.resources.energy).toBe(80);
    launch(h);
    g.dispose();
    h.dispose();
  });
  it.each(["sandbox", "survival", "bossRush", "roguelike"] as const)(
    "launches again after loss in %s without resetting its run",
    (kind) => {
      const { g, modes } = fixture();
      const o = defaultModeOptions();
      o.preparation = 180;
      modes.start(kind, o);
      const id = modes.session.id;
      if (modes.rogue) modes.rogue.choose(modes.rogue.available[0]);
      launch(g);
      lose(g);
      advance(g, 900);
      expect(modes.session.id).toBe(id);
      expect(g.ballStatus).toBe("ready");
      launch(g);
      modes.leave();
      g.dispose();
    },
  );
  it("promotes a surviving multiball when expiry and the primary drain coincide", () => {
    const { g } = fixture();
    g.startWar({ preparation: 180 });
    launch(g);
    const dead = g.physics.ball!;
    const survivor = g.physics.addSphere()!;
    expect(survivor).toBeTruthy();
    g.magic!.balls!.sync();
    g.magic!.data.multi = {
      count: 3,
      until: g.time,
      started: 0,
      storm: false,
      variant: "standard",
      saves: 0,
      pending: [],
    };
    Matter.Body.setPosition(dead, { x: 290, y: 890 });
    g.magic!.endMulti();
    expect(g.physics.ball).toBe(survivor);
    expect(g.physics.balls).toHaveLength(1);
    expect(g.economy!.data.resources.energy).toBe(100);
    lose(g);
    advance(g, 900);
    expect(g.economy!.data.losses).toBe(1);
    expect(g.economy!.data.resources.energy).toBe(80);
    g.dispose();
  });
  it("recovers a missing in-flight body through normal loss cost and never clones a live ball", () => {
    const { g } = fixture();
    g.startWar({ preparation: 180 });
    launch(g);
    g.physics.removeBall();
    advance(g, 1500);
    expect(g.ballStatus).toBe("ready");
    expect(g.economy!.data.resources.energy).toBe(80);
    advance(g, 3000);
    expect(g.physics.balls).toHaveLength(1);
    expect(g.ballLog.some((l) => l.event === "missing-body-recovery")).toBe(
      true,
    );
    g.dispose();
  });
  it.each([3, 7, 10])(
    "charges one loss when all %s simultaneous spheres drain",
    (count) => {
      const { g } = fixture();
      g.startWar({ preparation: 180 });
      launch(g);
      for (let i = 1; i < count; i++) g.physics.addSphere();
      g.magic!.balls!.sync();
      g.magic!.data.multi = {
        count,
        until: g.time + 10000,
        started: g.time - 6000,
        storm: count === 10,
        variant: "standard",
        saves: 5,
        pending: [],
      };
      expect(g.physics.balls).toHaveLength(count);
      lose(g);
      advance(g, 900);
      expect(
        g.physics.balls.length,
        JSON.stringify({
          time: g.time,
          state: g.state,
          energy: g.economy!.data.resources.energy,
          launch: g.economy!.data.launchState,
          log: g.ballLog,
        }),
      ).toBe(1);
      expect(g.economy!.data.losses).toBe(1);
      expect(g.economy!.data.resources.energy).toBe(80);
      launch(g);
      g.dispose();
    },
  );
});
