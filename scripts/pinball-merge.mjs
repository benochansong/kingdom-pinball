import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const label = process.argv[2] === "before" ? "before" : "after";
const prefix = label === "before" ? "baseline" : "final";
const sets = ["classic", "kingdom", "war"].map((t) =>
  JSON.parse(readFileSync(`docs/pinball-${prefix}-${t}.json`, "utf8")),
);
const trials = sets.flatMap((s) => s.trials);
if (
  trials.length !== 4800 ||
  new Set(trials.map((t) => `${t.table}/${t.policy}/${t.power}/${t.seed}`))
    .size !== 4800
)
  throw Error("Expected 4800 distinct final trials");
writeFileSync(
  `docs/pinball-${label}.json`,
  JSON.stringify(
    {
      label,
      date: "2026-11-27",
      baseline: "b0c9be4",
      physicsPreset: label === "before" ? "authored" : "standard",
      classification:
        "guide-aware-v2; below-pivot crossings retain outlane classification",
      countPerTablePowerAndPolicy: 100,
      capSeconds: 90,
      physicsHz: 240,
      ballSave: false,
      kickback: false,
      sourceHashes: Object.fromEntries(
        [
          "src/config/physics.ts",
          "src/config/pinball.ts",
          "src/physics/PinballPhysics.ts",
          "src/physics/FlipperController.ts",
          "src/physics/outlane.ts",
          "src/data/table.ts",
        ].map((p) => [
          p,
          createHash("sha256").update(readFileSync(p)).digest("hex"),
        ]),
      ),
      notes: sets[0].notes,
      trials,
    },
    null,
    2,
  ),
);
console.log(`Merged ${trials.length} final physical trials.`);
