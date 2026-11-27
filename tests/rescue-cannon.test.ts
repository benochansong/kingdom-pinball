import { describe, it, expect } from "vitest";
import Matter from "matter-js";
import { GameStateManager } from "../src/core/GameStateManager";
import { SaveManager } from "../src/systems/SaveManager";
import { EconomySaveManager } from "../src/economy/EconomySaveManager";
import { WarSaveManager } from "../src/war/WarSaveManager";
import { RESCUE, type CannonSide } from "../src/config/rescue";
import { ELEMENTS } from "../src/config/magic";
import { ServerSimulation } from "../server/simulation";
import { DEFAULT_RULES } from "../src/network/protocol";
import { GameModeManager } from "../src/modes/GameModeManager";
import { ModeSaveManager } from "../src/modes/ModeSaveManager";
import { defaultModeOptions } from "../src/config/modes";
function fixture() {
  const rows = new Map<string, string>();
  const storage = {
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
  return { g: create(), create, storage };
}
function launch(g: GameStateManager) {
  if (!g.physics.launched) {
    g.chargeStart();
    g.charge = 0.8;
    g.chargeRelease();
  }
}
function advance(g: GameStateManager, ms: number) {
  for (let i = 0; i < Math.ceil(ms / (1000 / 240)); i++) g.update(1000 / 240);
}
function danger(g: GameStateManager, side: CannonSide) {
  launch(g);
  const b = g.physics.ball!;
  Matter.Body.setPosition(b, { x: side === "left" ? 110 : 466, y: 775 });
  Matter.Body.setVelocity(b, { x: side === "left" ? -1 : 1, y: 6 });
  g.updateRescue();
  return b;
}
function rearm(g: GameStateManager) {
  const b = g.physics.ball!;
  Matter.Body.setPosition(b, { x: 288, y: 600 });
  g.time += 2500;
  g.updateRescue();
}
describe("Royal Rescue Cannon", () => {
  it.each(["left", "right"] as const)(
    "captures and fires %s with the same body, no rewards or life cost",
    (side) => {
      const { g } = fixture();
      g.startKingdom(true);
      const bodies = g.physics.engine.world.bodies.length,
        b = danger(g, side);
      expect(g.rescue.phase).toBe("RESCUE_DETECTED");
      expect(b.isStatic).toBe(true);
      expect(g.rescue.used).toBe(0);
      advance(g, 200);
      expect(g.rescue.phase).toBe("RESCUE_CHARGING");
      expect(g.physics.ball).toBe(b);
      advance(g, 210);
      expect(g.rescue.used).toBe(1);
      expect(b.isStatic).toBe(false);
      expect(Number.isFinite(b.mass)).toBe(true);
      expect(g.physics.ball).toBe(b);
      expect(g.physics.balls).toHaveLength(1);
      expect(g.physics.engine.world.bodies.length).toBe(bodies);
      expect(g.economy!.data.losses).toBe(0);
      expect(g.economy!.data.resources.energy).toBe(100);
      expect(g.score.score).toBe(0);
      expect(g.protection.data.saves).toBe(0);
      expect(Math.sign(b.velocity.x)).toBe(side === "left" ? 1 : -1);
      expect(b.velocity.y).toBeLessThan(0);
      advance(g, 250);
      expect(b.position.y).toBeLessThan(675);
      expect(b.position.x).toBeGreaterThan(165);
      expect(b.position.x).toBeLessThan(411);
      expect(g.rescue.used).toBe(1);
      g.dispose();
    },
  );
  it.each([
    ["left", "left"],
    ["right", "right"],
    ["left", "right"],
  ] as const)(
    "shares two uses for %s then %s, third drain still saves/relaunches",
    (a, b) => {
      const { g } = fixture();
      g.startKingdom(true);
      danger(g, a);
      advance(g, 410);
      rearm(g);
      danger(g, b);
      advance(g, 410);
      expect(g.rescue.used).toBe(2);
      rearm(g);
      danger(g, a);
      expect(g.rescue.pending).toBeUndefined();
      g.protection.data.remaining = 0;
      Matter.Body.setPosition(g.physics.ball!, { x: 110, y: 890 });
      advance(g, 850);
      expect(g.rescue.used).toBe(2);
      expect(g.economy!.data.losses).toBe(1);
      expect(g.economy!.data.resources.energy).toBe(80);
      expect(g.ballStatus).toBe("ready");
      g.dispose();
    },
  );
  it.each([
    { x: 200, y: 740, vx: 4, vy: 6 },
    { x: 376, y: 740, vx: -4, vy: 6 },
    { x: 110, y: 775, vx: 0, vy: -6 },
    { x: 200, y: 760, vx: 0, vy: 6 },
    { x: 554, y: 802, vx: 0, vy: 6 },
    { x: 466, y: 890, vx: 0, vy: 6 },
  ])("ignores safe, upward, shooter or already lost ball %j", (p) => {
    const { g } = fixture();
    g.start(false);
    launch(g);
    Matter.Body.setPosition(g.physics.ball!, p);
    Matter.Body.setVelocity(g.physics.ball!, { x: p.vx, y: p.vy });
    g.updateRescue();
    expect(g.rescue.used).toBe(0);
    expect(g.rescue.pending).toBeUndefined();
    g.dispose();
  });
  it("aborts an obstructed muzzle without spending or replacing the ball", () => {
    const { g } = fixture();
    g.start(false);
    const b = danger(g, "right");
    const c = RESCUE.cannons.right;
    Matter.Composite.add(
      g.physics.engine.world,
      Matter.Bodies.circle(c.exit.x, c.exit.y, 35, { isStatic: true }),
    );
    advance(g, 410);
    expect(g.rescue.used).toBe(0);
    expect(g.rescue.pending).toBeUndefined();
    expect(g.physics.ball).toBe(b);
    expect(b.isStatic).toBe(false);
    expect(b.isSensor).toBe(false);
    expect(g.rescue.log.at(-1)?.result).toBe("blocked");
    g.dispose();
  });
  it("pauses charging and restores a captured kingdom checkpoint without loss/refill", () => {
    const f = fixture(),
      g = f.g;
    g.startKingdom(true);
    danger(g, "left");
    advance(g, 160);
    g.pause();
    advance(g, 2000);
    expect(g.rescue.used).toBe(1);
    g.checkpoint();
    const id = g.rescue.sessionId;
    const h = f.create();
    h.startKingdom(false);
    expect(h.economy!.data.losses).toBe(0);
    expect(h.rescue.sessionId).toBe(id);
    advance(h, 410);
    expect(h.rescue.used).toBe(1);
    expect(h.economy!.data.resources.energy).toBe(100);
    h.checkpoint();
    const j = f.create();
    j.startKingdom(false);
    expect(j.rescue.used).toBe(1);
    g.dispose();
    h.dispose();
    j.dispose();
  });
  it("retains classic budget through reload/restart and resets only a new game", () => {
    const f = fixture(),
      g = f.g;
    g.start(false);
    danger(g, "left");
    advance(g, 410);
    g.checkpoint();
    const id = g.rescue.sessionId;
    const h = f.create();
    expect(h.resumeClassic()).toBe(true);
    expect(h.rescue.used).toBe(1);
    expect(h.rescue.sessionId).toBe(id);
    h.restartClassic();
    expect(h.rescue.used).toBe(1);
    h.start(false);
    expect(h.rescue.used).toBe(0);
    expect(h.rescue.total).toBe(2);
    g.dispose();
    h.dispose();
  });
  it.each([3, 5, 7, 10])(
    "rescues only primary among %i simultaneous balls and preserves count",
    (count) => {
      const { g } = fixture();
      g.startWar({ preparation: 180 });
      launch(g);
      for (let i = 1; i < count; i++)
        g.physics.addSphere({ x: 280, y: 400 }, i);
      const primary = g.physics.ball!;
      for (const b of g.physics.balls) {
        Matter.Body.setPosition(b, { x: 110, y: 775 });
        Matter.Body.setVelocity(b, { x: -1, y: 6 });
      }
      g.updateRescue();
      expect(g.rescue.ballId).toBe(primary.id);
      expect(g.physics.heldBalls.size).toBe(1);
      advance(g, 410);
      expect(g.rescue.used).toBe(1);
      expect(g.physics.ball).toBe(primary);
      expect(g.physics.balls.length).toBeLessThanOrEqual(count);
      g.dispose();
    },
  );
  it.each(ELEMENTS.map((e) => e.id))(
    "restores %s physical properties and caps cannon speed",
    (type) => {
      const { g } = fixture();
      g.startWar({ preparation: 180 });
      launch(g);
      const b = g.physics.ball!;
      g.magic!.balls!.transform(b, type, g.time + 30000);
      const mass = b.mass,
        friction = b.frictionAir;
      danger(g, "right");
      advance(g, 410);
      expect(g.rescue.used).toBe(1);
      expect(b.mass).toBeCloseTo(mass);
      expect(b.frictionAir).toBe(friction);
      expect(b.speed * 60).toBeLessThanOrEqual(1380);
      g.dispose();
    },
  );
  it.each(["survival", "bossRush", "roguelike", "sandbox", "puzzle"] as const)(
    "preserves %s challenge budget on resume",
    (kind) => {
      const f = fixture(),
        m = new GameModeManager(f.g, new ModeSaveManager(f.storage));
      const o = defaultModeOptions();
      o.sandbox.rescueShots = 4;
      m.start(kind, o);
      const total = kind === "puzzle" ? 0 : kind === "sandbox" ? 4 : 2;
      expect(f.g.rescue.total).toBe(total);
      f.g.rescue.used = Math.min(1, total);
      f.g.checkpoint();
      m.persist();
      m.leave();
      m.resume(kind);
      expect(f.g.rescue.used).toBe(kind === "puzzle" ? 0 : 1);
      m.leave();
      f.g.dispose();
    },
  );
  it("keeps authoritative player budgets independent and synchronized", () => {
    const s = new ServerSimulation({ ...DEFAULT_RULES, preparation: 180 });
    for (const g of s.games) danger(g, "right");
    for (let i = 0; i < 14; i++) s.step();
    for (let seat = 0; seat < 2; seat++) {
      expect(s.games[seat].rescue.used).toBe(1);
      expect(s.snapshot(seat).self.rescue?.used).toBe(1);
      expect(s.games[seat].economy!.data.losses).toBe(0);
    }
    s.games.forEach((g) => g.dispose());
  });
});
import { CampaignManager } from "../src/campaign/CampaignManager";
import { CampaignSaveManager } from "../src/campaign/CampaignSaveManager";
import { REGIONS } from "../src/config/campaign";
describe("Rescue isolation and campaign geometry", () => {
  it("rejects forged client rescue commands", () => {
    const s = new ServerSimulation({ ...DEFAULT_RULES });
    expect(
      s.command(0, {
        type: "rescue",
        used: 0,
        total: 999,
        velocity: { x: 0, y: -999 },
      }),
    ).toBeTruthy();
    expect(s.games[0].rescue.total).toBe(2);
    expect(s.games[0].rescue.used).toBe(0);
    danger(s.games[0], "left");
    for (let i = 0; i < 14; i++) s.step();
    expect(s.snapshot(1).opponent.rescue?.used).toBe(1);
    expect(s.games[1].rescue.used).toBe(0);
    s.games.forEach((g) => g.dispose());
  });
  it("requires both elapsed cooldown and an actual central exit before recapture", () => {
    const { g } = fixture();
    g.start(false);
    danger(g, "left");
    advance(g, 410);
    g.time += 3000;
    danger(g, "left");
    expect(g.rescue.pending).toBeUndefined();
    expect(g.rescue.used).toBe(1);
    rearm(g);
    danger(g, "left");
    advance(g, 410);
    expect(g.rescue.used).toBe(2);
    g.dispose();
  });
  it("promotes the surviving temporary ball and rescues that same object", () => {
    const { g } = fixture();
    g.startWar({ preparation: 180 });
    launch(g);
    const primary = g.physics.ball!,
      extra = g.physics.addSphere()!;
    g.physics.removeSphere(primary);
    expect(g.physics.ball).toBe(extra);
    danger(g, "right");
    advance(g, 410);
    expect(g.physics.ball).toBe(extra);
    expect(g.rescue.used).toBe(1);
    expect(g.physics.balls).toHaveLength(1);
    g.dispose();
  });
  it.each(["exhausted", "failed"] as const)(
    "allows post-drain BALL SAVE after %s rescue without double spending",
    (kind) => {
      const { g } = fixture();
      g.startKingdom(true);
      launch(g);
      g.protection.enter(g.time);
      const b = g.physics.ball!;
      if (kind === "exhausted") g.rescue.used = 2;
      else {
        danger(g, "left");
        const c = RESCUE.cannons.left;
        Matter.Composite.add(
          g.physics.engine.world,
          Matter.Bodies.circle(c.exit.x, c.exit.y, 35, { isStatic: true }),
        );
        advance(g, 410);
      }
      Matter.Body.setPosition(b, { x: 110, y: 890 });
      Matter.Body.setVelocity(b, { x: 0, y: 5 });
      advance(g, 20);
      expect(g.protection.data.saves).toBe(1);
      expect(g.economy!.data.losses).toBe(0);
      expect(g.economy!.data.resources.energy).toBe(100);
      expect(g.rescue.used).toBe(kind === "exhausted" ? 2 : 0);
      expect(g.physics.ball).not.toBe(b);
      g.dispose();
    },
  );
  it("clears an externally removed captured body without spending or leaving a held reference", () => {
    const { g } = fixture();
    g.start(false);
    danger(g, "right");
    g.physics.removeBall();
    g.updateRescue();
    expect(g.rescue.pending).toBeUndefined();
    expect(g.rescue.used).toBe(0);
    expect(g.physics.heldBalls.size).toBe(0);
    g.dispose();
  });
  it.each(["classic", "war"] as const)(
    "resumes pending %s capture without refilling quota",
    (mode) => {
      const f = fixture(),
        g = f.g;
      mode === "classic" ? g.start(false) : g.startWar({ preparation: 180 });
      danger(g, "left");
      advance(g, 410);
      rearm(g);
      danger(g, "right");
      advance(g, 160);
      g.checkpoint();
      const h = f.create();
      if (mode === "classic") expect(h.resumeClassic()).toBe(true);
      else h.startWar();
      expect(h.rescue.used).toBe(2);
      expect(h.rescue.pending?.charged).toBe(true);
      advance(h, 410);
      expect(h.rescue.used).toBe(2);
      expect(h.remaining).toBe(5);
      g.dispose();
      h.dispose();
    },
  );
  it.each(REGIONS.map((r, i) => ({ region: r.id, stage: i + 1 + "-1" })))(
    "fires safely in campaign region $region",
    (row) => {
      const f = fixture(),
        c = new CampaignManager(f.g, new CampaignSaveManager(f.storage));
      c.create(0, "RESCUE", "story");
      c.profile!.cores = REGIONS.map((r) => r.id);
      for (let i = 1; i <= 8; i++)
        for (let j = 1; j <= 3; j++)
          c.profile!.records[i + "-" + j] = { stars: 3 } as never;
      expect(c.begin(row.stage)).toBeNull();
      for (const side of ["left", "right"] as const) {
        danger(f.g, side);
        advance(f.g, 410);
        expect(f.g.rescue.used).toBe(side === "left" ? 1 : 2);
        advance(f.g, 250);
        expect(f.g.physics.ball!.position.y).toBeLessThan(675);
        rearm(f.g);
      }
      f.g.checkpoint();
      c.persist();
      c.leave();
      c.resume();
      expect(f.g.rescue.used).toBe(2);
      c.leave();
      expect(c.begin(row.stage)).toBeNull();
      expect(f.g.rescue.used).toBe(0);
      c.leave();
      f.g.dispose();
    },
  );
});
describe("Rescue challenge boundaries", () => {
  it("keeps the same shared quota across survival waves and boss transitions", () => {
    const f = fixture(),
      m = new GameModeManager(f.g, new ModeSaveManager(f.storage));
    m.start("survival", defaultModeOptions());
    f.g.rescue.used = 2;
    const id = f.g.rescue.sessionId;
    m.survival!.startNext();
    expect(f.g.rescue.used).toBe(2);
    expect(f.g.rescue.sessionId).toBe(id);
    m.leave();
    m.start("bossRush", defaultModeOptions());
    f.g.rescue.used = 1;
    const bossId = f.g.rescue.sessionId;
    m.battle.boss!.state.hp = 0;
    m.tick(0.05);
    expect(m.session.status).toBe("reward");
    m.chooseReward(m.session.rewards[0]);
    expect(m.session.bossIndex).toBe(1);
    expect(f.g.rescue.used).toBe(1);
    expect(f.g.rescue.sessionId).toBe(bossId);
    m.leave();
    f.g.dispose();
  });
  it.each([0, 200])(
    "cancels a captured sandbox shot if its budget is disabled after %ims",
    (elapsed) => {
      const { g } = fixture();
      g.start(false);
      const b = danger(g, "left");
      advance(g, elapsed);
      g.rescue.total = 0;
      advance(g, 410);
      expect(g.rescue.used).toBe(0);
      expect(b.isStatic).toBe(false);
      expect(g.rescue.pending).toBeUndefined();
      g.dispose();
    },
  );
  it("allows each online seat exactly two shots without cross-seat refill", () => {
    const s = new ServerSimulation({ ...DEFAULT_RULES });
    for (let round = 0; round < 2; round++) {
      for (const g of s.games) {
        Matter.Body.setPosition(g.physics.ball!, { x: 288, y: 600 });
        g.updateRescue();
        g.rescue.lastFire = -10000;
        danger(g, round ? "right" : "left");
      }
      for (let i = 0; i < 14; i++) s.step();
      for (const g of s.games) expect(g.rescue.used).toBe(round + 1);
    }
    for (const g of s.games) {
      rearm(g);
      danger(g, "right");
      expect(g.rescue.pending).toBeUndefined();
    }
    expect(s.snapshot(0).self.rescue?.used).toBe(2);
    expect(s.snapshot(1).self.rescue?.used).toBe(2);
    s.games.forEach((g) => g.dispose());
  });
});
import { PinballPhysics } from "../src/physics/PinballPhysics";
import { RescueCannon, freshRescue } from "../src/systems/RescueCannon";
describe("Capture failure hotfix", () => {
  it.each(["left", "right"] as const)(
    "holds slow and fast %s entries with zero velocity and debits only at the anchor",
    (side) => {
      for (const speed of [6, 60, 900, 1320]) {
        const { g } = fixture();
        g.startKingdom(true);
        launch(g);
        const b = g.physics.ball!,
          id = b.id;
        Matter.Body.setPosition(b, { x: side === "left" ? 75 : 501, y: 680 });
        Matter.Body.setVelocity(b, { x: 0, y: speed / 60 });
        Matter.Body.setAngularVelocity(b, 1);
        for (let i = 0; i < 240 && !g.rescue.pending; i++) g.update(1000 / 240);
        expect(g.rescue.pending).toBeDefined();
        expect(g.rescue.used).toBe(0);
        expect(b.isStatic).toBe(true);
        expect(b.isSensor).toBe(true);
        expect(b.velocity).toEqual({ x: 0, y: 0 });
        expect(b.angularVelocity).toBe(0);
        advance(g, 120);
        expect(g.rescue.used).toBe(1);
        expect(g.rescue.pending?.charged).toBe(true);
        expect(b.position).toEqual({ x: RESCUE.cannons[side].x, y: 820 });
        advance(g, 200);
        expect(b.position).toEqual({ x: RESCUE.cannons[side].x, y: 820 });
        expect(b.velocity).toEqual({ x: 0, y: 0 });
        expect(b.angularVelocity).toBe(0);
        expect(g.physics.heldBalls.has(id)).toBe(true);
        advance(g, 340);
        expect(g.physics.ball).toBe(b);
        expect(g.rescue.used).toBe(1);
        expect(g.rescue.sequence).toBe(1);
        expect(g.physics.heldBalls.size).toBe(0);
        expect(b.position.y).toBeLessThan(675);
        expect(b.position.x).toBeGreaterThan(165);
        expect(b.position.x).toBeLessThan(411);
        expect(g.economy!.data.losses).toBe(0);
        expect(g.protection.data.saves).toBe(0);
        g.dispose();
      }
    },
  );
  it.each(["left", "right"] as const)(
    "sweeps a skipped %s corridor before a below-drain sample can be lost",
    (side) => {
      const p = new PinballPhysics([]),
        c = new RescueCannon(),
        d = freshRescue("swept");
      p.spawn();
      p.launch(0.8);
      const b = p.ball!;
      const tick = (time: number) =>
        c.update(
          p,
          d,
          time,
          true,
          "steel",
          () => {},
          () => {},
        );
      Matter.Body.setPosition(b, { x: side === "left" ? 75 : 501, y: 680 });
      Matter.Body.setVelocity(b, { x: 0, y: 22 });
      tick(0);
      expect(d.pending).toBeUndefined();
      Matter.Body.setPosition(b, { x: side === "left" ? 120 : 456, y: 890 });
      tick(16);
      expect(d.pending).toBeDefined();
      expect(p.heldBalls.has(b.id)).toBe(true);
      expect(b.position.y).toBeLessThan(884);
      expect(b.velocity).toEqual({ x: 0, y: 0 });
      tick(136);
      expect(d.used).toBe(1);
      tick(420);
      expect(d.sequence).toBe(1);
      expect(p.ball).toBe(b);
      p.dispose();
    },
  );
  it("does not debit a trigger whose launch path is blocked before capture", () => {
    const { g } = fixture();
    g.start(false);
    launch(g);
    const c = RESCUE.cannons.left;
    Matter.Composite.add(
      g.physics.engine.world,
      Matter.Bodies.circle(c.x, c.y, 35, { isStatic: true }),
    );
    danger(g, "left");
    expect(g.rescue.pending).toBeUndefined();
    expect(g.rescue.used).toBe(0);
    expect(g.physics.heldBalls.size).toBe(0);
    g.dispose();
  });
  it("refunds a captured body removed during hold exactly once", () => {
    const { g } = fixture();
    g.start(false);
    danger(g, "right");
    advance(g, 200);
    expect(g.rescue.used).toBe(1);
    g.physics.removeBall();
    g.updateRescue();
    g.updateRescue();
    expect(g.rescue.used).toBe(0);
    expect(g.rescue.pending).toBeUndefined();
    expect(g.physics.heldBalls.size).toBe(0);
    g.dispose();
  });
  it("permits a normal next rescue after central return and the short cooldown", () => {
    const { g } = fixture();
    g.start(false);
    danger(g, "left");
    advance(g, 660);
    expect(g.physics.ball!.position.y).toBeLessThan(675);
    g.time = g.rescue.lastFire + 701;
    danger(g, "right");
    expect(g.rescue.pending).toBeDefined();
    advance(g, 410);
    expect(g.rescue.used).toBe(2);
    g.dispose();
  });
});
describe("Physical outlane installation correction", () => {
  it.each(["left", "right"] as const)(
    "captures a real %s outlane descent and fires without teleporting across the guide",
    (side) => {
      const { g } = fixture();
      g.start(false);
      launch(g);
      const p = g.physics,
        b = p.ball!,
        id = b.id;
      expect(p.rescueSensors.size).toBe(2);
      expect(p.rescueGates.size).toBe(2);
      expect(p.rescueGates.get(side)!.isSensor).toBe(false);
      Matter.Body.setPosition(b, { x: side === "left" ? 75 : 501, y: 680 });
      Matter.Body.setVelocity(b, { x: 0, y: 6 });
      g.updateRescue();
      expect(g.rescue.pending).toBeUndefined();
      for (let i = 0; i < 120 && !g.rescue.pending; i++) g.update(1000 / 240);
      expect(g.rescue.pending).toBeDefined();
      expect(b.position.y).toBeGreaterThan(695);
      expect(g.rescue.ballId).toBe(id);
      advance(g, 300);
      expect(b.position.x).toBeCloseTo(RESCUE.cannons[side].x);
      expect(b.position.y).toBe(820);
      let shot: any;
      const off = g.events.on("rescue", (event) => {
        if (event.phase === "RESCUE_LAUNCHING")
          shot = { x: b.position.x, y: b.position.y, id: b.id };
      });
      for (let i = 0; i < 35 && !shot; i++) g.update(1000 / 240);
      expect(shot).toEqual({ x: RESCUE.cannons[side].x, y: 820, id });
      expect(p.rescueGates.get(side)!.isSensor).toBe(true);
      let last = { ...b.position };
      for (let i = 0; i < 60; i++) {
        g.update(1000 / 240);
        expect(
          Math.hypot(b.position.x - last.x, b.position.y - last.y),
        ).toBeLessThan(6);
        last = { ...b.position };
      }
      expect(b.position.y).toBeLessThan(675);
      expect(b.position.x).toBeGreaterThan(165);
      expect(b.position.x).toBeLessThan(411);
      expect(g.remaining).toBe(5);
      advance(g, 150);
      expect(p.rescueGates.get(side)!.isSensor).toBe(false);
      expect(p.ball).toBe(b);
      expect(g.rescue.used).toBe(1);
      off();
      g.dispose();
    },
  );
  it("does not close a physical shutter through another ball", () => {
    const p = new PinballPhysics([]);
    p.spawn();
    p.launch(0.8);
    p.openRescueGate("left");
    const gate = p.rescueGates.get("left")!;
    Matter.Body.setPosition(p.ball!, gate.position);
    p.engine.timing.timestamp += 500;
    p.updateRescueHardware(false);
    expect(gate.isSensor).toBe(true);
    Matter.Body.setPosition(p.ball!, { x: 288, y: 550 });
    p.updateRescueHardware(false);
    expect(gate.isSensor).toBe(false);
    p.dispose();
  });
  it.each(["left", "right"] as const)(
    "allows an exhausted %s outlane to drain without the catch bed blocking it",
    (side) => {
      const { g } = fixture();
      g.startKingdom(true);
      launch(g);
      g.rescue.used = 2;
      g.protection.data.remaining = 0;
      const b = g.physics.ball!;
      Matter.Body.setPosition(b, { x: side === "left" ? 85 : 491, y: 735 });
      Matter.Body.setVelocity(b, { x: 0, y: 6 });
      advance(g, 1500);
      expect(g.rescue.used).toBe(2);
      expect(g.economy!.data.losses).toBe(1);
      expect(g.economy!.data.resources.energy).toBe(80);
      expect(g.ballStatus).toBe("ready");
      g.dispose();
    },
  );
  it.each(["left", "right"] as const)(
    "does not award points for contact with the %s hardware",
    (side) => {
      const { g } = fixture();
      g.startKingdom(true);
      launch(g);
      const sensor = g.physics.rescueSensors.get(side)!;
      Matter.Body.setPosition(g.physics.ball!, sensor.position);
      Matter.Body.setVelocity(g.physics.ball!, { x: 0, y: -6 });
      const produced = structuredClone(g.economy!.data.produced);
      advance(g, 50);
      expect(g.score.score).toBe(0);
      expect(g.economy!.data.produced).toEqual(produced);
      g.dispose();
    },
  );
});
