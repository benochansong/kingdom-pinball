import { writeFileSync } from "node:fs";
import Matter from "matter-js";
import { PinballPhysics } from "../src/physics/PinballPhysics";
import { BallRecoverySystem } from "../src/systems/BallRecoverySystem";
import { PHYSICS } from "../src/config/physics";
import { TARGETS } from "../src/data/table";
import { ECONOMY_TARGETS } from "../src/config/economy";
import { WAR_TARGETS } from "../src/config/war";
import {
  trackOutlane,
  inFlipperApproach,
  type DrainLane,
} from "../src/physics/outlane";
const count = Number(process.env.BALANCE_TRIALS ?? 100);
const label = process.argv[2] ?? "sample";
const dt = 1 / 240,
  cap = 90;
const trials: any[] = [];
for (const table of (process.env.BALANCE_TABLES ?? "classic,kingdom,war").split(
  ",",
))
  for (const policy of (
    process.env.BALANCE_POLICIES ?? "none,basic,timed,mirrored"
  ).split(","))
    for (const power of [0.25, 0.5, 0.75, 1]) {
      for (let seed = 1; seed <= count; seed++) {
        let rng = seed * 761 + Math.round(power * 1000);
        const random = () => {
          rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
          return rng / 4294967296;
        };
        const actualPower = Math.min(
          1,
          Math.max(0, power + (random() - 0.5) * 0.06),
        );
        const p = new PinballPhysics(
          table === "classic"
            ? TARGETS
            : table === "kingdom"
              ? ECONOMY_TARGETS
              : WAR_TARGETS,
          process.env.BALANCE_BASELINE === "1" ? "authored" : "standard",
        );
        const recovery = new BallRecoverySystem();
        if (process.env.BALANCE_RIGHT_POST) {
          const [x, y, radius] =
            process.env.BALANCE_RIGHT_POST.split(",").map(Number);
          const post = Matter.Composite.allBodies(p.engine.world).find(
            (b) => b.label === "outlane-guard" && b.position.x > 288,
          )!;
          Matter.Composite.remove(p.engine.world, post);
          Matter.Composite.add(
            p.engine.world,
            Matter.Bodies.circle(x, y, radius, {
              isStatic: true,
              restitution: 0.82,
              friction: 0.015,
              label: "outlane-guard",
              collisionFilter: { category: 2 },
            }),
          );
        }
        let now = 0,
          hits = 0,
          bumpers = 0,
          approaches = 0,
          firstApproach: number | null = null,
          firstHit: number | null = null;
        let lastContact = -1,
          inReach = false,
          leftUntil = 0,
          rightUntil = 0,
          side: DrainLane = "center",
          entryAngle: number | null = null,
          lastCollision = "",
          recovered = 0;
        const timing = (random() - 0.5) * 24;
        for (const f of [p.left, p.right]) {
          const collide = f.collide.bind(f);
          f.collide = (ball) => {
            const vx = ball.velocity.x,
              vy = ball.velocity.y;
            const result = collide(ball);
            if (
              result &&
              f.held &&
              Math.abs(f.angularVelocity) > 0.1 &&
              now - lastContact > 0.1 &&
              Math.hypot(vx - ball.velocity.x, vy - ball.velocity.y) > 0.3
            ) {
              hits++;
              firstHit ??= now;
              lastContact = now;
              lastCollision = `flipper-${f.side}`;
            }
            return result;
          };
        }
        p.onHit = (c) => {
          p.kick(c.target, c.ball);
          bumpers++;
          lastCollision = c.target.id;
        };
        p.onImpact = (x, y) => {
          lastCollision = `rail:${Math.round(x)},${Math.round(y)}`;
        };
        p.spawn();
        p.launch(actualPower);
        let result = "censored";
        for (; now < cap; now += dt) {
          const ball = p.ball!;
          const reach = inFlipperApproach(ball.position.x, ball.position.y);
          if (reach && !inReach) {
            approaches++;
            firstApproach ??= now;
          }
          inReach = reach;
          if (
            policy !== "none" &&
            ball.velocity.y > 0 &&
            ball.position.y > (policy === "basic" ? 745 : 705) + timing &&
            ball.position.y < 805
          ) {
            const isLeft = ball.position.x < 288;
            const threshold = policy === "mirrored" ? -timing : timing;
            if (isLeft && ball.position.x > 125 + threshold)
              leftUntil = now + 0.12;
            if (!isLeft && ball.position.x < 450 + threshold)
              rightUntil = now + 0.12;
          }
          p.left.held = now < leftUntil;
          p.right.held = now < rightUntil;
          p.step(dt);
          side = trackOutlane(side, ball.position.x, ball.position.y);
          if (side !== "center")
            entryAngle ??=
              (Math.atan2(ball.velocity.y, ball.velocity.x) * 180) / Math.PI;
          if (ball.position.y > PHYSICS.drainY) {
            result = side;
            break;
          }
          const repair = recovery.update(p, dt, now * 1000);
          if (repair) recovered++;
          if (repair === "return") {
            result = "returned";
            break;
          }
        }
        trials.push({
          table,
          policy,
          power,
          seed,
          actualPower,
          result,
          seconds: +now.toFixed(3),
          hits,
          bumpers,
          approaches,
          firstApproach,
          firstHit,
          entryAngle,
          lastCollision,
          recovered,
        });
        p.dispose();
      }
      const rows = trials.filter(
        (t) => t.table === table && t.policy === policy && t.power === power,
      );
      console.log(label, table, policy, power, JSON.stringify(summarize(rows)));
    }
function summarize(rows: any[]) {
  const drains = rows.filter((t) =>
    ["left", "right", "center"].includes(t.result),
  );
  const counts = Object.fromEntries(
    ["left", "right", "center", "returned", "censored"].map((k) => [
      k,
      rows.filter((t) => t.result === k).length,
    ]),
  );
  const mean = (key: string) =>
    rows.reduce((n, t) => n + (t[key] ?? 0), 0) / rows.length;
  const sorted = rows.map((t) => t.seconds).sort((a, b) => a - b);
  return {
    n: rows.length,
    ...counts,
    meanSeconds: mean("seconds"),
    medianSeconds: sorted[Math.floor(sorted.length / 2)],
    meanFlipperHits: mean("hits"),
    meanBumpers: mean("bumpers"),
    meanApproaches: mean("approaches"),
    early: Object.fromEntries(
      [3, 5, 10, 15].map((s) => [
        s,
        drains.filter((t) => t.seconds <= s).length,
      ]),
    ),
    beforeApproach: drains.filter((t) => t.firstApproach === null).length,
    beforeHit: drains.filter((t) => t.firstHit === null).length,
  };
}
writeFileSync(
  `docs/pinball-${label}.json`,
  JSON.stringify(
    {
      label,
      date: "2026-11-27",
      countPerPowerAndPolicy: count,
      capSeconds: cap,
      physicsHz: 240,
      ballSave: false,
      kickback: false,
      notes:
        "Deterministic scripted policies, not human skill ratings. Returned and censored trials are separate from actual drains. Mean duration includes capped and returned trials; no artificial survival guarantee.",
      summary: summarize(trials),
      groups: [...new Set(trials.map((t) => t.policy))].map((policy) => ({
        policy,
        ...summarize(trials.filter((t) => t.policy === policy)),
      })),
      trials,
    },
    null,
    2,
  ),
);
