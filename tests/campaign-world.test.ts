import { MagicTraining } from "../src/magic/MagicTraining";
import { describe, it, expect } from "vitest";
import Matter from "matter-js";
import { GameStateManager } from "../src/core/GameStateManager";
import { SaveManager } from "../src/systems/SaveManager";
import { EconomySaveManager } from "../src/economy/EconomySaveManager";
import { WarSaveManager } from "../src/war/WarSaveManager";
import { CampaignManager } from "../src/campaign/CampaignManager";
import {
  CampaignSaveManager,
  CAMPAIGN_KEY,
  sanitizeCampaign,
} from "../src/campaign/CampaignSaveManager";
import { regionLocked } from "../src/campaign/CampaignProgression";
import { REGIONS, STAGES } from "../src/config/campaign";
import { PHYSICS } from "../src/config/physics";
function fixture() {
  const rows = new Map<string, string>();
  const storage = {
    getItem: (k: string) => rows.get(k) ?? null,
    setItem: (k: string, v: string) => {
      rows.set(k, v);
    },
  };
  const g = new GameStateManager(
    new SaveManager(storage),
    new EconomySaveManager(storage),
    new WarSaveManager(storage),
  );
  const c = new CampaignManager(g, new CampaignSaveManager(storage));
  c.create(0, "WORLD TEST", "story");
  return { g, c, rows, storage };
}
function clock(g: GameStateManager, time: number) {
  g.time = g.war!.data.time = time;
  g.economy!.data.time = time;
}
function unlock(c: CampaignManager) {
  const p = c.profile!;
  p.cores = REGIONS.map((r) => r.id);
  for (const r of REGIONS)
    p.territories[r.id] = { level: 1, facilities: { administration: 1 } };
  for (const s of STAGES)
    p.records[s.id] = {
      wins: 1,
      attempts: 1,
      stars: 1,
      bestSeconds: 100,
      difficulty: {},
      lastReason: "fixture",
    };
}
function launch(g: GameStateManager) {
  g.physics.launch(0.8);
  g.economy!.data.launchState = "inflight";
  clock(g, g.war!.data.options.preparation * 1000 + 1000);
}
function hit(g: GameStateManager, id: string) {
  g.events.emit("hit", {
    id,
    kind: "bonus",
    points: 75,
    combo: 1,
    multiplier: 1,
    x: 470,
    y: 410,
  });
}
describe("Campaign world integration", () => {
  it("finishes all 24 real objective paths, joins eight cores and keeps NG+ separate", () => {
    const { g, c, rows } = fixture();
    for (const s of STAGES) {
      expect(c.begin(s.id), s.id).toBeNull();
      if (s.mission !== "development") launch(g);
      const w = g.war!,
        m = c.session!.mission;
      if (s.mission === "development") {
        g.enterBuild();
        expect(
          g.builder!.build({
            type: "lumber",
            x: 110,
            y: 430,
            angle: 0,
            level: 1,
          }),
        ).toBeNull();
        g.leaveBuild();
        launch(g);
        for (let i = 0; i < 70; i++) {
          clock(g, g.time + 4000);
          w.player.harvest("forest", 700, true);
        }
      }
      if (s.mission === "resource")
        for (let i = 0; i < 100; i++) {
          clock(g, g.time + 4000);
          w.player.harvest(
            s.resource === "stone" ? "stone" : "gold",
            700,
            true,
          );
        }
      if (s.mission === "defense" || s.mission === "survival")
        clock(g, w.data.options.preparation * 1000 + s.seconds * 1000);
      if (s.mission === "siege")
        for (const b of w.data.structures.filter(
          (b) => b.side === "enemy" && b.type === "wall",
        ))
          w.damageStructure(b.id, 1e6, "unit", "ally");
      if (s.mission === "conquest")
        w.damageStructure(w.castle("enemy").id, 1e6, "unit", "ally");
      if (s.mission === "rescue" || s.mission === "escort") {
        if (s.mission === "rescue")
          for (let i = 0; i < 3; i++) {
            clock(g, g.time + 1000);
            hit(g, "env-scout");
          }
        const unit = w.army.data.units.find((u) => u.id === m.escortId)!;
        for (
          let i = 0;
          i < 11000 && m.waypoint < (s.mission === "rescue" ? 1 : 3);
          i++
        ) {
          clock(g, g.time + 200);
          w.army.combat.controlUnit!(unit, 0.2, g.time, [unit]);
        }
        expect(m.waypoint, s.id + " waypoint").toBe(
          s.mission === "rescue" ? 1 : 3,
        );
      }
      if (s.mission === "magic") {
        const d = c.terrain!.devices.find(
          (d) => d.kind === (s.region === "volcano" ? "heat" : "gravity"),
        )!;
        for (let i = 0; i < 7; i++) {
          clock(
            g,
            s.region === "volcano"
              ? Math.ceil((w.data.options.preparation * 1000) / 8000) * 8000 +
                  6000 +
                  i * 8000
              : Math.ceil((w.data.options.preparation * 1000) / 10000) * 10000 +
                  1000 +
                  i * 10000,
          );
          Matter.Body.setPosition(g.physics.ball!, d);
          c.terrain!.beforeStep(1 / 240);
        }
      }
      if (s.mission === "boss") {
        const b = c.boss!,
          u = b.unit!;
        for (const ratio of [0.79, 0.59, 0.39, 0.19]) {
          w.army.combat.hurt(
            u,
            Math.max(1, u.hp - b.state.maxHp * ratio) * 20,
            undefined,
            true,
          );
          if (u.hp <= 0) break;
          b.tick();
        }
        if (u.hp > 0) w.army.combat.hurt(u, 1e6, undefined, true);
      }
      g.sessionExtension!.afterStep(0.05);
      expect(w.data.result?.outcome, s.id + " " + s.mission).toBe("victory");
      c.leave();
    }
    expect(c.progress).toEqual({
      territories: 8,
      stages: 24,
      stars: expect.any(Number),
    });
    expect(c.profile!.completed).toBe(true);
    expect(c.profile!.achievements).toContain("WORLD CORE RESTORED");
    const original = rows.get(CAMPAIGN_KEY + "0");
    expect(c.newGamePlus(0)).toBeTruthy();
    expect(c.newGamePlus(1)).toBeNull();
    expect(c.profile!.ngPlus).toBe(1);
    expect(c.progress.stages).toBe(0);
    expect(rows.get(CAMPAIGN_KEY + "0")).toBe(original);
    g.dispose();
  }, 30000);
  it.each(["shadow", "iron"])(
    "allows the %s branch without requiring its sibling",
    (branch) => {
      const { g, c } = fixture();
      c.profile!.cores = ["greenwood", branch];
      expect(regionLocked(c.profile!, "desert")).toBeNull();
      expect(regionLocked(c.profile!, "frost")).toBeNull();
      expect(regionLocked(c.profile!, "volcano")).toBeTruthy();
      c.profile!.cores.push("desert", "frost");
      expect(regionLocked(c.profile!, "arcane")).toBeNull();
      expect(regionLocked(c.profile!, "dark")).toBeTruthy();
      g.dispose();
    },
  );
  it.each(REGIONS.map((r) => r.id))(
    "%s keeps ten spheres bounded and cleans up regional physics",
    (id) => {
      const { g, c } = fixture();
      unlock(c);
      const s = STAGES.find((s) => s.region === id)!;
      c.begin(s.id);
      launch(g);
      for (let i = 0; i < 9; i++)
        g.magic!.balls!.create("steel", g.time + 30000, "storm", i);
      expect(g.physics.balls.length).toBe(10);
      for (let j = 0; j < 240; j++) {
        g.time += 1000 / 240;
        c.terrain!.beforeStep(1 / 240);
        g.physics.step(1 / 240);
        for (const b of g.physics.balls) {
          expect(Number.isFinite(b.position.x + b.position.y)).toBe(true);
          expect(b.speed * 60).toBeLessThanOrEqual(PHYSICS.maxSpeed + 1);
        }
      }
      expect(g.physics.engine.gravity.y).toBe(
        REGIONS.find((r) => r.id === id)!.gravity,
      );
      c.leave();
      expect(g.sessionExtension).toBeUndefined();
      expect(
        Matter.Composite.allBodies(g.physics.engine.world).filter((b) =>
          b.label.startsWith("env-"),
        ),
      ).toHaveLength(0);
      g.dispose();
    },
  );
  it.each(REGIONS.map((r) => r.id))(
    "%s telegraphs a boss attack and preserves boss HP on reload",
    (id) => {
      const { g, c } = fixture();
      unlock(c);
      c.begin(STAGES.find((s) => s.region === id && s.index === 2)!.id);
      launch(g);
      let b = c.boss!;
      clock(g, b.state.next);
      b.tick();
      expect(b.state.warning).toBeTruthy();
      const due = b.state.warning!.at;
      clock(g, due - 500);
      b.tick();
      expect(b.state.warning).toBeTruthy();
      clock(g, due);
      b.tick();
      expect(b.state.warning).toBeNull();
      g.war!.army.combat.hurt(b.unit!, 100, undefined, true);
      clock(g, g.time + 250);
      b.tick();
      const hp = b.unit!.hp;
      g.checkpoint();
      c.leave();
      c.load(0);
      c.resume();
      b = c.boss!;
      expect(b.unit!.hp).toBe(hp);
      expect(b.unit!.maxHpOverride).toBe(b.state.maxHp);
      g.dispose();
    },
  );
  it("moves through all five emperor phases using ordinary damage", () => {
    const { g, c } = fixture();
    unlock(c);
    c.begin("8-3");
    launch(g);
    const b = c.boss!,
      u = b.unit!;
    for (let phase = 2; phase <= 5; phase++) {
      const threshold = b.state.maxHp * (1 - (phase - 1) * 0.2) - 1;
      let guard = 0;
      while (u.hp > threshold && guard++ < 500)
        g.war!.army.combat.hurt(u, 20, undefined, true);
      clock(g, g.time + 500);
      b.tick();
      expect(b.state.phase).toBe(phase);
      c.terrain!.beforeStep(1 / 240);
      const gate = Matter.Composite.allBodies(g.physics.engine.world).find(
        (x) => x.label === "env-gate",
      )!;
      if (phase >= 3) expect(gate.isSensor).toBe(true);
    }
    g.dispose();
  });
  it("rejects blocked portal exits and prevents immediate portal ping-pong", () => {
    const { g, c } = fixture();
    unlock(c);
    c.begin("7-1");
    launch(g);
    const portal = c.terrain!.devices.find((d) => d.kind === "portal")!,
      ball = g.physics.ball!,
      dest = { x: portal.to!.x, y: portal.to!.y + 38 };
    const blocker = Matter.Bodies.circle(dest.x, dest.y, 18, {
      isStatic: true,
    });
    Matter.Composite.add(g.physics.engine.world, blocker);
    Matter.Body.setPosition(ball, portal);
    c.terrain!.beforeStep(1 / 240);
    expect(ball.position.x).toBe(portal.x);
    Matter.Composite.remove(g.physics.engine.world, blocker);
    c.terrain!.beforeStep(1 / 240);
    expect(ball.position.x).toBe(dest.x);
    Matter.Body.setPosition(ball, portal);
    c.terrain!.beforeStep(1 / 240);
    expect(ball.position.x).toBe(portal.x);
    expect(
      c.terrain!.placement({
        type: "wall",
        x: portal.x,
        y: portal.y,
        level: 1,
        angle: 0,
      }),
    ).toBeTruthy();
    g.dispose();
  });
  it("blocks stale cross-tab writes until explicit reload", () => {
    const { g, c, storage, rows } = fixture();
    const other = new CampaignSaveManager(storage),
      profile = other.load(0)!;
    profile.name = "OTHER TAB";
    expect(other.save(0, profile)).toBe(true);
    c.profile!.name = "STALE";
    c.persist();
    expect(c.save.lastError).toMatch(/다른 창/);
    expect(JSON.parse(rows.get(CAMPAIGN_KEY + "0")!).name).toBe("OTHER TAB");
    c.load(0);
    c.profile!.name = "RELOADED";
    c.persist();
    expect(JSON.parse(rows.get(CAMPAIGN_KEY + "0")!).name).toBe("RELOADED");
    g.dispose();
  });
  it("recovers a result committed before its reward and never grants it twice", () => {
    const { g, c, rows } = fixture();
    c.begin("1-1");
    g.war!.finish("victory", "interrupted transaction fixture");
    const raw = JSON.parse(rows.get(CAMPAIGN_KEY + "0")!);
    raw.session.settled = false;
    raw.records["1-1"].wins = 0;
    raw.records["1-1"].stars = 0;
    raw.specialties = {};
    raw.points = 0;
    rows.set(CAMPAIGN_KEY + "0", JSON.stringify(raw));
    c.save.block(0);
    c.leave();
    c.load(0);
    expect(c.resume()).toBe(true);
    expect(c.profile!.session!.settled).toBe(true);
    expect(c.profile!.records["1-1"].wins).toBe(1);
    const points = c.profile!.points;
    g.war!.onEnd();
    expect(c.profile!.points).toBe(points);
    g.dispose();
  });
  it("caps research, equipment, trade and retains castle growth across a paid resume", () => {
    const { g, c } = fixture();
    unlock(c);
    const p = c.profile!;
    p.points = 1000;
    p.specialties = Object.fromEntries(REGIONS.map((r) => [r.id, 200]));
    c.growth.turn();
    for (let i = 0; i < 3; i++) expect(c.growth.research("palace")).toBeNull();
    expect(c.growth.research("palace")).toBeTruthy();
    expect(c.growth.equip("ironShell")).toBeNull();
    for (let i = 0; i < 3; i++)
      expect(c.growth.trade("greenwood", "iron")).toBeNull();
    expect(c.growth.trade("greenwood", "iron")).toBeTruthy();
    c.begin("1-1");
    const castle = g.war!.castle("ally");
    castle.hp -= 100;
    const hp = castle.hp,
      max = castle.maxHp;
    g.checkpoint();
    c.leave();
    c.load(0);
    c.resume();
    expect(g.war!.castle("ally").maxHp).toBe(max);
    expect(g.war!.castle("ally").hp).toBe(hp);
    const clean = sanitizeCampaign({
      ...p,
      loadout: { garbage: "ironShell", shell: "arcaneCrystal" },
      research: { palace: 999, hack: 3 },
    })!;
    expect(clean.loadout).toEqual({});
    expect(clean.research).toEqual({ palace: 3 });
    g.dispose();
  });

  it("isolates campaign progression during magic practice and restores its engine", () => {
    const { g, c } = fixture();
    c.begin("1-1");
    const engine = g.physics,
      extension = g.sessionExtension;
    const before = JSON.stringify(c.profile);
    const practice = new MagicTraining(g);
    expect(practice.start(5)).toBe(true);
    expect(c.active).toBe(false);
    g.update(100);
    practice.exit();
    expect(g.physics).toBe(engine);
    expect(g.sessionExtension).toBe(extension);
    expect(c.active).toBe(true);
    expect(c.profile!.cores).toHaveLength(0);
    expect(JSON.parse(before).records).toEqual(c.profile!.records);
    g.dispose();
  });
  it("settles optional counterattacks once without farming stage wins", () => {
    const { g, c } = fixture();
    unlock(c);
    c.profile!.events = [
      { id: "counter-test", region: "greenwood", expires: 10, done: false },
    ];
    const wins = c.profile!.records["1-2"].wins;
    expect(c.startEvent("counter-test")).toBeNull();
    clock(g, g.war!.data.options.preparation * 1000 + 180000);
    g.sessionExtension!.afterStep(0.05);
    expect(c.profile!.events[0].done).toBe(true);
    const amount = c.profile!.specialties.greenwood;
    g.war!.onEnd();
    expect(c.profile!.specialties.greenwood).toBe(amount);
    expect(c.profile!.records["1-2"].wins).toBe(wins);
    c.leave();
    expect(c.startEvent("counter-test")).toBeTruthy();
    g.dispose();
  });
  it("does not auto-trade manual routes and allows disabling automation", () => {
    const { g, c } = fixture();
    unlock(c);
    c.profile!.specialties.greenwood = 50;
    c.profile!.specialties.iron = 0;
    c.growth.trade("greenwood", "iron");
    const amount = c.profile!.specialties.greenwood;
    c.growth.turn();
    expect(c.profile!.specialties.greenwood).toBe(amount);
    c.growth.trade("greenwood", "iron", true);
    c.growth.turn();
    expect(c.profile!.specialties.greenwood).toBe(amount - 5);
    c.growth.trade("greenwood", "iron", true);
    c.growth.turn();
    expect(c.profile!.specialties.greenwood).toBe(amount - 5);
    g.dispose();
  });
  it("ignores paused hits and detaches old region listeners", () => {
    const { g, c } = fixture();
    unlock(c);
    c.begin("2-1");
    launch(g);
    g.pause();
    hit(g, "env-scout");
    expect(c.session!.mission.devices).toBe(0);
    g.resume();
    hit(g, "env-scout");
    expect(c.session!.mission.devices).toBe(1);
    const mission = c.session!.mission;
    c.leave();
    g.start(false);
    hit(g, "env-scout");
    expect(mission.devices).toBe(1);
    g.dispose();
  });
});
