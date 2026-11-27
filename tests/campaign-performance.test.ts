import { it, expect } from "vitest";
import { GameStateManager } from "../src/core/GameStateManager";
import { SaveManager } from "../src/systems/SaveManager";
import { EconomySaveManager } from "../src/economy/EconomySaveManager";
import { WarSaveManager } from "../src/war/WarSaveManager";
import { CampaignManager } from "../src/campaign/CampaignManager";
import { CampaignSaveManager } from "../src/campaign/CampaignSaveManager";
import { REGIONS, STAGES } from "../src/config/campaign";
import { UNITS } from "../src/config/army";
it("benchmarks eight regions without a renderer and checks bounded simulation state", async () => {
  const measurements = [];
  for (let region = 0; region < 8; region++) {
    const memory = new Map<string, string>(),
      storage = {
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => {
          memory.set(k, v);
        },
      };
    const g = new GameStateManager(
      new SaveManager(storage),
      new EconomySaveManager(storage),
      new WarSaveManager(storage),
    );
    const c = new CampaignManager(g, new CampaignSaveManager(storage));
    c.create(0, "CPU BENCH", "normal");
    const p = c.profile!;
    p.cores = REGIONS.map((r) => r.id);
    for (const r of REGIONS) p.territories[r.id] = { level: 1, facilities: {} };
    for (const s of STAGES)
      p.records[s.id] = {
        wins: 1,
        attempts: 1,
        stars: 1,
        bestSeconds: 100,
        difficulty: {},
        lastReason: "fixture",
      };
    c.begin(`${region + 1}-3`);
    const w = g.war!;
    g.time = w.data.time = 121000;
    for (let i = 0; i < 150; i++) {
      const side = i % 2 ? "ally" : "enemy",
        army = w.troops(side),
        position = army.navigation.closest({
          x: 110 + (i % 17) * 22,
          y:
            side === "ally"
              ? 510 + Math.floor(i / 17) * 15
              : 360 - Math.floor(i / 17) * 15,
        })!;
      const u = army.createUnit(UNITS[i % 8].id, side, position);
      u.squad = "deployed";
      army.data.units.push(u);
    }
    w.command("frontline");
    g.physics.launch(0.8);
    w.player.data.launchState = "inflight";
    for (let i = 0; i < 9; i++)
      g.magic!.balls!.create("steel", g.time + 30000, "storm", i);
    const durations: number[] = [],
      start = performance.now();
    for (let frame = 0; frame < 300; frame++) {
      const tick = performance.now();
      g.update(1000 / 60);
      durations.push(performance.now() - tick);
    }
    durations.sort((a, b) => a - b);
    measurements.push({
      region: REGIONS[region].id,
      simulationSeconds: 5,
      initialBalls: 10,
      initialUnits: 151,
      endingBalls: g.physics.balls.length,
      livingUnits: w.army.combat.units.filter((u) => u.hp > 0).length,
      cpuMs: Math.round(performance.now() - start),
      p95FrameCpuMs: Math.round(durations[285] * 100) / 100,
    });
    expect(g.physics.balls.length).toBeLessThanOrEqual(10);
    expect(
      w.army.combat.units.every((u) => Number.isFinite(u.x + u.y + u.hp)),
    ).toBe(true);
    c.dispose();
    g.dispose();
  }
  console.info("CAMPAIGN_CPU " + JSON.stringify(measurements));
  // Optional artifact capture; ordinary tests never modify repository files.
  const processModule = 'node:process', filesystemModule = 'node:fs/promises';
  const process = await import(processModule);
  if(process.env.CAMPAIGN_BENCHMARK==='1'){
    const fs=await import(filesystemModule);
    await fs.writeFile('docs/campaign-performance.json',JSON.stringify({kind:'Node CPU, not render FPS',measurements},null,2)+'\n');
  }
}, 60000);
