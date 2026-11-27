import { writeFileSync } from "node:fs";
import Matter from "matter-js";
import { PinballPhysics } from "../src/physics/PinballPhysics";
import { RescueCannon, freshRescue } from "../src/systems/RescueCannon";
import { TARGETS } from "../src/data/table";
import { ECONOMY_TARGETS } from "../src/config/economy";
import { WAR_TARGETS } from "../src/config/war";
const trials: any[] = [];
for (const [mode, targets] of [
  ["classic", TARGETS],
  ["kingdom", ECONOMY_TARGETS],
  ["war", WAR_TARGETS],
] as const)
  for (const enabled of [false, true])
    for (const side of ["left", "right"] as const)
      for (let n = 0; n < 20; n++) {
        const p = new PinballPhysics(targets),
          controller = new RescueCannon(),
          d = freshRescue("measurement");
        p.spawn();
        p.launch(0.8);
        const b = p.ball!,
          id = b.id,
          bodyCount = p.engine.world.bodies.length;
        Matter.Body.setPosition(b, {
          x: (side === "left" ? 110 : 466) + ((n % 5) - 2) * 4,
          y: 765 + Math.floor(n / 5) * 5,
        });
        Matter.Body.setVelocity(b, {
          x: (side === "left" ? -1 : 1) * (n % 3),
          y: 5 + (n % 5),
        });
        let seconds = 0,
          central = false,
          firstShot: number | null = null,
          immediateOut = false,
          maxSpeed = 0;
        for (let i = 0; i < 240 * 30; i++) {
          seconds = i / 240;
          controller.update(
            p,
            d,
            seconds * 1000,
            enabled,
            "steel",
            () => {},
            () => {},
          );
          if (d.used && firstShot === null) firstShot = seconds;
          const pos = b.position;
          p.left.held =
            pos.x < 300 && pos.y > 690 && pos.y < 830 && b.velocity.y > 0;
          p.right.held =
            pos.x >= 276 && pos.y > 690 && pos.y < 830 && b.velocity.y > 0;
          p.step(1 / 240);
          if (firstShot !== null && pos.y < 675 && pos.x > 165 && pos.x < 411)
            central = true;
          maxSpeed = Math.max(maxSpeed, b.speed * 60);
          if (b.position.y > 884) {
            immediateOut = firstShot !== null && seconds - firstShot < 0.3;
            break;
          }
        }
        const raw = p.telemetry.live.get(id) ?? p.telemetry.records.at(-1);
        trials.push({
          mode,
          enabled,
          side,
          n,
          seconds,
          shots: d.used,
          central,
          immediateOut,
          hits: raw?.hits ?? 0,
          sameBody: p.ball === b,
          bodyGrowth: p.engine.world.bodies.length - bodyCount,
          maxSpeed,
        });
        p.dispose();
      }
const groups: any[] = [];
for (const mode of ["classic", "kingdom", "war"])
  for (const side of ["left", "right"])
    for (const enabled of [false, true]) {
      const a = trials.filter(
        (t) => t.mode === mode && t.side === side && t.enabled === enabled,
      );
      const sorted = a.map((t) => t.seconds).sort((a, b) => a - b);
      groups.push({
        mode,
        side,
        enabled,
        trials: a.length,
        meanSeconds: +(a.reduce((s, t) => s + t.seconds, 0) / a.length).toFixed(
          2,
        ),
        medianSeconds: +sorted[Math.floor(a.length / 2)].toFixed(2),
        central: a.filter((t) => t.central).length,
        flipperHit: a.filter((t) => t.hits > 0).length,
        immediateOut: a.filter((t) => t.immediateOut).length,
        shots: a.reduce((s, t) => s + t.shots, 0),
        maxSpeed: Math.round(Math.max(...a.map((t) => t.maxSpeed))),
      });
    }
const output = {
  description:
    "240Hz real Matter simulation; 20 varied incoming danger trajectories per side/mode; 30s cap; simple reactive flippers; no BALL SAVE; not human survival estimates",
  groups,
  invariants: {
    sameBodies: trials.every((t) => t.sameBody),
    noBodyGrowth: trials.every((t) => t.bodyGrowth === 0),
    finite: trials.every((t) => Number.isFinite(t.maxSpeed)),
  },
  trials,
};
writeFileSync("docs/RESCUE_MEASUREMENTS.json", JSON.stringify(output, null, 2));
console.log(JSON.stringify({ groups, invariants: output.invariants }, null, 2));
