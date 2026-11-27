import { describe, it, expect } from "vitest";
import { GameModeManager } from "../src/modes/GameModeManager";
import {
  ModeSaveManager,
  MODE_KEY,
  sanitizeMode,
} from "../src/modes/ModeSaveManager";
import { GameStateManager } from "../src/core/GameStateManager";
import { SaveManager } from "../src/systems/SaveManager";
import { EconomySaveManager } from "../src/economy/EconomySaveManager";
import { WarSaveManager } from "../src/war/WarSaveManager";
import { defaultModeOptions } from "../src/config/modes";
import { survivalWave } from "../src/modes/SurvivalManager";
export function fixture() {
  const rows = new Map<string, string>(),
    storage = {
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
  return {
    g,
    m: new GameModeManager(g, new ModeSaveManager(storage)),
    rows,
    storage,
  };
}
describe("Isolated game modes", () => {
  it("starts survival, clears a bounded wave, grants one reward and resumes its exact countdown", () => {
    const { g, m, rows } = fixture();
    m.start("survival", defaultModeOptions());
    expect(m.active).toBe(true);
    expect(m.survival!.startNext()).toBe(true);
    expect(m.survival!.startNext()).toBe(false);
    for (let i = 0; i < 10; i++) {
      g.time += 1000;
      m.survival!.tick();
      for (const u of g.war!.enemyArmy.data.units) u.hp = 0;
    }
    m.survival!.tick();
    expect(m.session.status).toBe("reward");
    const id = m.session.rewards[0];
    expect(m.chooseReward(id)).toBe(true);
    expect(m.chooseReward(id)).toBe(false);
    const ready = m.session.wave.readyAt;
    m.leave();
    expect(m.resume("survival")).toBe(true);
    expect(m.session.wave.readyAt).toBe(ready);
    expect(rows.has(MODE_KEY + "survival")).toBe(true);
    expect([...rows.keys()].some((k) => k.includes("campaign"))).toBe(false);
    g.dispose();
  });
  it("limits wave 100 and later content without infinite health inflation", () => {
    for (let n = 1; n <= 1000; n++) {
      const w = survivalWave(n, 38);
      expect(w.units.length).toBeLessThanOrEqual(100);
      expect(w.rank).toBeLessThanOrEqual(5);
    }
    expect(survivalWave(20, 1).boss).toBe("frost");
    expect(survivalWave(50, 1).boss).toBe("dark");
    expect(survivalWave(100, 3)).toEqual(survivalWave(100, 3));
  });
  it("sandbox modifies only its instance and protects occupied projects", () => {
    const { g, m } = fixture();
    m.start("sandbox", defaultModeOptions());
    m.sandbox!.settings.allyInvincible = true;
    m.sandbox!.tick();
    m.sandbox!.spawn({
      side: "ally",
      kind: "swordsman",
      count: 1,
      rank: 1,
      research: 4,
      formation: "standard",
    });
    expect(g.army!.data.research.weapons).toBe(4);
    m.sandbox!.settings.allMagic = false;
    m.sandbox!.applyMagic();
    expect(g.magic!.data.research.chaos ?? 0).toBe(0);
    m.sandbox!.settings.allMagic = true;
    m.sandbox!.applyMagic();
    expect(g.magic!.data.research.chaos).toBe(3);
    expect(g.magic!.locked("multiball")).toBeNull();
    g.chargeStart();
    g.charge = 0.8;
    g.chargeRelease();
    expect(g.magic!.multiball(false)).toBeNull();
    const a = m.battle.spawn("swordsman", 1, "ally")[0],
      hp = a.hp;
    g.war!.army.combat.hurt(a, 100);
    expect(a.hp).toBe(hp);
    m.sandbox!.physics.set("maxSpeed", 999999);
    expect(m.session.options.physics.maxSpeed).toBe(1380);
    expect(m.saveProject(0, "test")).toBeNull();
    expect(m.saveProject(0, "oops")).toContain("확인");
    m.leave();
    m.start("survival", defaultModeOptions());
    g.time = g.war!.data.time = 61000;
    const b = g.war!.army.living[0];
    g.war!.army.combat.hurt(b, 10);
    expect(b.hp).toBeLessThan(100);
    expect(m.loadProject(0)).toBe(true);
    expect(m.sandbox!.settings.allyInvincible).toBe(true);
    expect(m.session.competitive).toBe(false);
    g.dispose();
  });
  it("boss rush advances only after a real dead boss and keeps the castle/resources", () => {
    const { g, m } = fixture();
    m.start("bossRush", defaultModeOptions());
    const c = g.war!.castle("ally");
    c.hp -= 100;
    const hp = c.hp,
      gold = g.economy!.data.resources.gold;
    m.battle.boss!.state.hp = 0;
    m.tick(0.05);
    expect(m.session.status).toBe("reward");
    const reward = m.session.rewards.find(
      (x) => !["castle", "gold"].includes(x),
    )!;
    m.chooseReward(reward);
    expect(m.session.bossIndex).toBe(1);
    expect(g.war!.castle("ally").hp).toBe(hp);
    expect(g.economy!.data.resources.gold).toBe(gold);
    expect(m.battle.boss!.state.id).toBe("shadow");
    g.dispose();
  });
  it("rejects stale writes and survives corrupt mode JSON", () => {
    const { m, rows, storage } = fixture();
    m.start("survival", defaultModeOptions());
    const other = new ModeSaveManager(storage),
      bucket = other.load("survival");
    bucket.session!.name = "other";
    other.save("survival", bucket);
    m.persist();
    expect(m.saves.lastError).toContain("다른 창");
    expect(JSON.parse(rows.get(MODE_KEY + "survival")!).session.name).toBe(
      "other",
    );
    rows.set(MODE_KEY + "sandbox", "{invalid");
    expect(other.load("sandbox").session).toBeNull();
    expect(sanitizeMode({ version: 99 })).toBeNull();
    m.game.dispose();
  });
  it("records an ended run only once and never gives sandbox achievements", () => {
    const { m } = fixture();
    m.start("survival", defaultModeOptions());
    m.session.wave.number = 26;
    m.finish(false, "test");
    m.finish(false, "test");
    expect(m.bucket.records).toHaveLength(1);
    expect(m.profile.achievements).toContain("survival-25");
    m.start("sandbox", defaultModeOptions());
    m.session.wave.number = 100;
    m.finish(true, "experiment");
    expect(m.profile.achievements).not.toContain("survival-50");
    m.game.dispose();
  });
});
