import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { ServerSimulation } from "../server/simulation";
import { DEFAULT_RULES } from "../src/network/protocol";
const percentile = (a: number[], q: number) =>
  [...a].sort((a, b) => a - b)[
    Math.min(a.length - 1, Math.floor(a.length * q))
  ] ?? 0;
const results = [];
for (const count of [1, 5, 10]) {
  const rooms = Array.from(
    { length: count },
    () => new ServerSimulation({ ...DEFAULT_RULES }),
  );
  for (const s of rooms) {
    s.command(0, { type: "battleReady" });
    s.command(1, { type: "battleReady" });
    for (const [i, g] of s.games.entries()) {
      g.physics.launch(0.85);
      g.magic!.data.stormCharge = 100;
      s.command(i, { type: "multi", storm: true });
      for (let n = 0; n < 20; n++) {
        const u = g.army!.createUnit("swordsman", i ? "enemy" : "ally", {
          x: 100 + (n % 10) * 35,
          y: i ? 280 : 560,
        });
        u.squad = "deployed";
        g.army!.data.units.push(u);
      }
      s.command(i, { type: "order", order: "frontline", lane: "center" });
    }
  }
  const start = performance.now(),
    cpu = process.cpuUsage(),
    memory = process.memoryUsage(),
    samples: number[] = [];
  let bytes = 0,
    peakBalls = 0;
  for (let t = 0; t < 180; t++) {
    const before = performance.now();
    for (const s of rooms) {
      s.step();
      peakBalls = Math.max(
        peakBalls,
        ...s.games.map((g) => g.physics.balls.length),
      );
      if (t % 2 === 0)
        for (const seat of [0, 1])
          bytes += Buffer.byteLength(JSON.stringify(s.snapshot(seat)));
    }
    samples.push(performance.now() - before);
  }
  const result = {
    rooms: count,
    simulatedSeconds: 6,
    wallMs: performance.now() - start,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    p99: percentile(samples, 0.99),
    peakBallsPerTable: peakBalls,
    initialUnitsPerRoom: 40,
    bytes,
    cpu: process.cpuUsage(cpu),
    heapBefore: memory.heapUsed,
    heapAfter: process.memoryUsage().heapUsed,
  };
  results.push(result);
  console.log(JSON.stringify(result));
  for (const s of rooms) s.dispose();
}
const soak = new ServerSimulation({ ...DEFAULT_RULES, limit: 1800 });
let maxBodies = 0,
  maxUnits = 0;
const started = performance.now();
for (let t = 0; t < 54002 && !soak.result; t++) {
  if (t % 300 === 0)
    for (const seat of [0, 1]) {
      const g = soak.games[seat];
      soak.command(seat, {
        type: "train",
        id: g.army!.buildings[0].id,
        kind: "swordsman",
        count: 1,
      });
    }
  soak.step();
  maxBodies = Math.max(
    maxBodies,
    ...soak.games.map((g) => g.physics.engine.world.bodies.length),
  );
  maxUnits = Math.max(maxUnits, soak.war.army.combat.units.length);
}
const longSession = {
  simulatedSeconds: soak.time / 1000,
  wallMs: performance.now() - started,
  result: soak.result?.reason,
  maxBodies,
  maxUnits,
  note: "Accelerated 30-minute server simulation, no wall-clock soak or GPU measurement; resources naturally run out.",
};
soak.dispose();
writeFileSync(
  "docs/online-performance.json",
  JSON.stringify(
    {
      runtime: process.version,
      platform: process.platform,
      note: "Local CPU simulation and JSON serialization, not Internet capacity or browser FPS. No GC forced; heap deltas are not a leak conclusion.",
      results,
      longSession,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(longSession));
