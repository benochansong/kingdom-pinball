import type Matter from "matter-js";
import { PHYSICS } from "../config/physics";
import { trackOutlane, inFlipperApproach } from "./outlane";
type Point = { x: number; y: number };
type Side = "left" | "right" | "center" | "abnormal";
export interface BallSample {
  id: number;
  power: number;
  launchedAt: number;
  seconds: number;
  result?: Side | "returned";
  approaches: number;
  hits: number;
  bumpers: number;
  firstApproach: number | null;
  firstHit: number | null;
  out?: Point;
  entryAngle?: number;
  side: Side;
  inReach: boolean;
  lastHit: number;
  resources: Record<string, number>;
}
export class PinballTelemetry {
  enabled = false;
  launches = 0;
  readonly live = new Map<number, BallSample>();
  readonly records: BallSample[] = [];
  readonly trace: (Point & {
    id: number;
    vx: number;
    vy: number;
    time: number;
  })[] = [];
  readonly contacts: (Point & {
    ballId: number;
    target: string;
    time: number;
    incoming: Point;
    outgoing: Point;
  })[] = [];
  lastFlipper?: Point & { side: string; t: number };
  lastBumper?: Point & { target: string };
  private sampledAt = -1000;
  launch(ball: Matter.Body, power: number, now: number) {
    this.launches++;
    this.live.set(ball.id, {
      id: ball.id,
      power,
      launchedAt: now,
      seconds: 0,
      approaches: 0,
      hits: 0,
      bumpers: 0,
      firstApproach: null,
      firstHit: null,
      side: "center",
      inReach: false,
      lastHit: -1000,
      resources: {},
    });
  }
  contact(ball: Matter.Body, target: string, now: number, incoming: Point) {
    if (!this.enabled) return;
    this.contacts.push({
      ...ball.position,
      ballId: ball.id,
      target,
      time: now,
      incoming,
      outgoing: { x: ball.velocity.x * 60, y: ball.velocity.y * 60 },
    });
    if (this.contacts.length > 32) this.contacts.shift();
  }
  bumper(ball: Matter.Body, target: string) {
    const s = this.live.get(ball.id);
    if (s) s.bumpers++;
    this.lastBumper = { ...ball.position, target };
  }
  production(ball: Matter.Body | undefined, resource: string, amount: number) {
    const s = ball && this.live.get(ball.id);
    if (s) s.resources[resource] = (s.resources[resource] ?? 0) + amount;
  }
  flipper(ball: Matter.Body, side: string, t: number, now: number) {
    const s = this.live.get(ball.id);
    if (!s || now - s.lastHit < 100) return;
    s.lastHit = now;
    s.hits++;
    s.firstHit ??= (now - s.launchedAt) / 1000;
    this.lastFlipper = { ...ball.position, side, t };
  }
  step(balls: Matter.Body[], now: number) {
    const sample = this.enabled && now - this.sampledAt >= 50;
    if (sample) this.sampledAt = now;
    for (const ball of balls) {
      const s = this.live.get(ball.id);
      if (!s) continue;
      const { x, y } = ball.position;
      if (this.enabled)
        for (const c of this.contacts)
          if (c.ballId === ball.id && c.time === now)
            c.outgoing = { x: ball.velocity.x * 60, y: ball.velocity.y * 60 };
      s.seconds = (now - s.launchedAt) / 1000;
      const reach = inFlipperApproach(x, y);
      if (reach && !s.inReach) {
        s.approaches++;
        s.firstApproach ??= s.seconds;
      }
      s.inReach = reach;
      s.side = trackOutlane(s.side === "abnormal" ? "center" : s.side, x, y);
      if (s.side !== "center")
        s.entryAngle ??=
          (Math.atan2(ball.velocity.y, ball.velocity.x) * 180) / Math.PI;
      if (sample)
        this.trace.push({
          id: ball.id,
          x,
          y,
          vx: ball.velocity.x * 60,
          vy: ball.velocity.y * 60,
          time: now,
        });
      if (y > PHYSICS.drainY) this.finish(ball, s.side);
      else if (!Number.isFinite(x + y) || x < 0 || x > 600 || y < 0)
        this.finish(ball, "abnormal");
    }
    if (this.trace.length > 240) this.trace.splice(0, this.trace.length - 240);
  }
  finish(ball: Matter.Body, result: BallSample["result"] = "returned") {
    const s = this.live.get(ball.id);
    if (!s) return;
    this.live.delete(ball.id);
    this.records.push({ ...s, result, out: { ...ball.position } });
    if (this.records.length > 2000) this.records.shift();
  }
  summary() {
    const drains = this.records.filter((r) => r.result !== "returned"),
      n = drains.length;
    const times = drains.map((r) => r.seconds).sort((a, b) => a - b);
    const mean = (key: "seconds" | "hits" | "bumpers" | "approaches") =>
      n ? drains.reduce((sum, r) => sum + r[key], 0) / n : 0;
    const resources = [
      ...new Set(drains.flatMap((r) => Object.keys(r.resources))),
    ];
    return {
      launches: this.launches,
      retained: this.records.length,
      drains: n,
      meanProduction: Object.fromEntries(
        resources.map((k) => [
          k,
          drains.reduce((sum, r) => sum + (r.resources[k] ?? 0), 0) /
            Math.max(1, n),
        ]),
      ),
      left: drains.filter((r) => r.result === "left").length,
      right: drains.filter((r) => r.result === "right").length,
      center: drains.filter((r) => r.result === "center").length,
      abnormal: drains.filter((r) => r.result === "abnormal").length,
      early: Object.fromEntries(
        [3, 5, 10, 15].map((t) => [
          t,
          drains.filter((r) => r.seconds <= t).length,
        ]),
      ),
      beforeApproach: drains.filter((r) => r.firstApproach === null).length,
      beforeHit: drains.filter((r) => r.firstHit === null).length,
      meanSeconds: mean("seconds"),
      medianSeconds: n
        ? (times[Math.floor((n - 1) / 2)] + times[Math.floor(n / 2)]) / 2
        : 0,
      maxSeconds: times.at(-1) ?? 0,
      meanFlipperHits: mean("hits"),
      meanBumpers: mean("bumpers"),
      meanApproaches: mean("approaches"),
    };
  }
}
