import { it, expect } from "vitest";
import Matter from "matter-js";
import { GameStateManager } from "../src/core/GameStateManager";
import { GameModeManager } from "../src/modes/GameModeManager";
import { ModeSaveManager } from "../src/modes/ModeSaveManager";
import { defaultModeOptions } from "../src/config/modes";
const enabled = !!(
  globalThis as unknown as { process?: { env?: Record<string, string> } }
).process?.env?.MODE_SOAK;
it.skipIf(!enabled)(
  "runs sixty simulated minutes through bounded survival waves",
  async () => {
    const g = new GameStateManager(),
      m = new GameModeManager(g, new ModeSaveManager(undefined)),
      o = defaultModeOptions();
    o.preparation = 0;
    m.start("survival", o);
    const w = g.war!;
    w.damageFilter = (target, n) => (target.side === "ally" ? 0 : n);
    const begin = performance.now();
    let nextClear = 5000,
      maxBodies = 0,
      maxUnits = 0,
      maxQueue = 0,
      rewards = 0;
    for (let frame = 0; frame < 30000 && g.time < 3600000; frame++) {
      g.update(150);
      if (g.time >= nextClear) {
        nextClear = g.time + 5000;
        for (const u of w.enemyArmy.living) w.army.combat.hurt(u, 1e8);
      }
      if (m.session.status === "reward") {
        expect(m.chooseReward(m.session.rewards[0])).toBe(true);
        rewards++;
        m.survival!.startNext();
      }
      maxUnits = Math.max(
        maxUnits,
        w.army.data.units.length + w.enemyArmy.data.units.length,
      );
      maxQueue = Math.max(maxQueue, m.session.wave.pending.length);
      if (frame % 100 === 0)
        maxBodies = Math.max(
          maxBodies,
          Matter.Composite.allBodies(g.physics.engine.world).length,
        );
      expect(m.session.status).toBe("playing");
    }
    const report = {
      method:
        "60 simulated minutes; fixed 240 Hz game loop, idle launcher, protected player structures, test damage clears enemies every 5 seconds. Not a manual balance or browser FPS measurement.",
      simulatedSeconds: g.time / 1000,
      wallMs: Math.round(performance.now() - begin),
      waves: m.session.wave.number,
      rewards,
      maxStoredUnits: maxUnits,
      maxSpawnQueue: maxQueue,
      maxMatterBodies: maxBodies,
      saveBytes: JSON.stringify(m.session).length,
    };
    expect(g.time).toBeGreaterThanOrEqual(3600000);
    expect(m.session.wave.number).toBeGreaterThan(50);
    expect(maxQueue).toBeLessThanOrEqual(100);
    expect(maxUnits).toBeLessThanOrEqual(150);
    expect(maxBodies).toBeLessThan(160);
    const name = "node:fs/promises",
      fs = await import(name);
    await fs.writeFile("docs/mode-soak.json", JSON.stringify(report, null, 2));
    g.dispose();
  },
  180000,
);
