import { it, expect } from "vitest";
import { SaveManager, SAVE_KEY } from "../src/systems/SaveManager";
import {
  defaultPresentation,
  sanitizePresentation,
  canonicalKey,
  QUALITY_BUDGET,
} from "../src/presentation/settings";
import { PerformanceMonitor } from "../src/presentation/PerformanceMonitor";
import { MusicDirector, musicMood } from "../src/audio/MusicDirector";
import { GameStateManager } from "../src/core/GameStateManager";
import { EconomySaveManager } from "../src/economy/EconomySaveManager";
import { WarSaveManager } from "../src/war/WarSaveManager";
it("migrates old settings without erasing scores or external kingdom storage", () => {
  const rows = new Map([
    [
      SAVE_KEY,
      JSON.stringify({
        version: 1,
        highScore: 1200,
        plays: 4,
        settings: { music: 0.2, muted: true },
      }),
    ],
    ["campaign", "protected"],
  ]);
  const storage = {
    getItem: (k: string) => rows.get(k) ?? null,
    setItem: (k: string, v: string) => {
      rows.set(k, v);
    },
  };
  const save = new SaveManager(storage);
  expect(save.data.highScore).toBe(1200);
  expect(save.data.settings.music).toBe(0.2);
  expect(save.data.settings.presentation.ui).toBe("simple");
  save.data.settings.presentation.quality = "low";
  save.persist();
  expect(rows.get("campaign")).toBe("protected");
  expect(new SaveManager(storage).data.settings.presentation.quality).toBe(
    "low",
  );
});
it("rejects corrupt settings and duplicate/reserved controls", () => {
  const p = sanitizePresentation({
    quality: "fake",
    master: Infinity,
    uiScale: -10,
    keys: { left: "KeyD", right: "KeyD" },
  });
  expect(p.quality).toBe("high");
  expect(p.master).toBe(0.8);
  expect(p.uiScale).toBe(0.85);
  expect(p.keys.left).toBe("KeyA");
  p.keys.left = "KeyQ";
  expect(canonicalKey("KeyQ", p)).toBe("KeyA");
  expect(canonicalKey("KeyA", p)).toBe("Unbound");
  expect(canonicalKey("ArrowLeft", p)).toBe("ArrowLeft");
});
it("reduces decoration budgets only after sustained degradation, never oscillates upward", () => {
  const m = new PerformanceMonitor();
  for (let i = 0; i < 300; i++) m.update(40, "ultra", true, true);
  expect(m.quality).toBe("ultra");
  for (let i = 0; i < 300; i++) m.update(40, "ultra", true, true);
  expect(m.quality).toBe("high");
  for (let i = 0; i < 1000; i++) m.update(16, "ultra", true, true);
  expect(m.quality).toBe("high");
  m.update(16, "low", false, true);
  expect(m.quality).toBe("low");
  expect(QUALITY_BUDGET.low.particles).toBeLessThan(
    QUALITY_BUDGET.ultra.particles,
  );
});
it("ignores suspended/hidden frame samples and reports real percentiles", () => {
  const m = new PerformanceMonitor();
  for (let i = 0; i < 500; i++) m.update(1000, "high", true, false);
  expect(m.report.samples).toBe(0);
  for (let i = 0; i < 320; i++) m.update(16, "high", true, true);
  expect(m.report.fps).toBeCloseTo(62.5);
  expect(m.report.p95).toBe(16);
});
it("music uses actual game state and hysteresis with urgent transitions", () => {
  const d = new MusicDirector();
  expect(d.select("battle", 0)).toBe(true);
  expect(d.select("peace", 300)).toBe(false);
  expect(d.select("critical", 400)).toBe(true);
  expect(d.select("peace", 6000)).toBe(true);
  const storage = { getItem: () => null, setItem: () => {} };
  const g = new GameStateManager(
    new SaveManager(storage),
    new EconomySaveManager(storage),
    new WarSaveManager(storage),
  );
  expect(musicMood(g)).toBe("peace");
  g.state = "over";
  expect(musicMood(g)).toBe("defeat");
  g.dispose();
});
it("all quality settings preserve the same deterministic input/physics result", () => {
  const run = (quality: "low" | "ultra") => {
    const storage = { getItem: () => null, setItem: () => {} };
    const save = new SaveManager(storage);
    save.data.settings.presentation = { ...defaultPresentation(), quality };
    const g = new GameStateManager(
      save,
      new EconomySaveManager(storage),
      new WarSaveManager(storage),
    );
    g.start();
    g.chargeStart();
    g.charge = 0.8;
    g.chargeRelease();
    for (let i = 0; i < 240; i++) g.update(1000 / 240);
    const result = { position: g.physics.ball?.position, score: g.score.score };
    g.dispose();
    return result;
  };
  expect(run("low")).toEqual(run("ultra"));
});
