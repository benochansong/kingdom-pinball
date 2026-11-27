import Matter from "matter-js";
import { RESCUE, type CannonSide } from "../config/rescue";
import { PHYSICS } from "../config/physics";
import type { PinballPhysics } from "../physics/PinballPhysics";
export type RescuePhase =
  | "IN_PLAY"
  | "RESCUE_DETECTED"
  | "RESCUE_CAPTURED"
  | "RESCUE_CHARGING"
  | "RESCUE_LAUNCHING";
type Point = { x: number; y: number };
export interface RescueData {
  sessionId: string;
  total: number;
  used: number;
  phase: RescuePhase;
  side: CannonSide | null;
  ballId: number | null;
  lastFire: number;
  needsExit: boolean;
  pending?: { position: Point; velocity: Point; started: number };
  sequence: number;
  log: {
    side: CannonSide;
    ballId: number;
    time: number;
    result: "fired" | "blocked";
  }[];
}
export function freshRescue(
  sessionId: string,
  total = RESCUE.rescueShotsPerGame,
): RescueData {
  return {
    sessionId,
    total: Math.max(0, Math.min(10, Math.floor(total))),
    used: 0,
    phase: "IN_PLAY",
    side: null,
    ballId: null,
    lastFire: -10000,
    needsExit: false,
    sequence: 0,
    log: [],
  };
}
export function sanitizeRescue(
  raw: unknown,
  id: string,
  total = 2,
): RescueData {
  const d = freshRescue(id, total);
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<RescueData>;
  if (typeof r.sessionId === "string") d.sessionId = r.sessionId.slice(0, 100);
  const num = (n: unknown, f = 0, max = 1e12) =>
    typeof n === "number" && Number.isFinite(n)
      ? Math.max(0, Math.min(max, n))
      : f;
  d.total = Math.floor(num(r.total, total, 10));
  d.used = Math.floor(num(r.used, 0, d.total));
  d.lastFire = num(r.lastFire, -10000);
  d.needsExit = r.needsExit === true;
  d.sequence = num(r.sequence);
  d.side = r.side === "left" || r.side === "right" ? r.side : null;
  d.ballId = typeof r.ballId === "number" ? num(r.ballId) : null;
  if (r.pending && d.side && d.used < d.total) {
    const p = r.pending;
    if (
      p.position &&
      p.velocity &&
      [p.position.x, p.position.y, p.velocity.x, p.velocity.y, p.started].every(
        Number.isFinite,
      )
    ) {
      d.pending = {
        position: {
          x: Math.max(0, Math.min(600, p.position.x)),
          y: Math.max(0, Math.min(883, p.position.y)),
        },
        velocity: {
          x: Math.max(-23, Math.min(23, p.velocity.x)),
          y: Math.max(-23, Math.min(23, p.velocity.y)),
        },
        started: num(p.started),
      };
      d.phase = "RESCUE_DETECTED";
    }
  }
  d.log = Array.isArray(r.log)
    ? r.log
        .filter(
          (x) =>
            x &&
            (x.side === "left" || x.side === "right") &&
            (x.result === "fired" || x.result === "blocked") &&
            Number.isFinite(x.time) &&
            Number.isFinite(x.ballId),
        )
        .slice(-20)
    : [];
  return d;
}
/** One active capture per table. Runtime body references never enter save data. */
export class RescueCannon {
  private held?: { body: Matter.Body; sensor: boolean; mask: number };
  private physics?: PinballPhysics;
  remaining(d: RescueData) {
    return Math.max(0, d.total - d.used);
  }
  private safe(p: PinballPhysics, b: Matter.Body, side: CannonSide) {
    const c = RESCUE.cannons[side];
    const obstacles = Matter.Composite.allBodies(p.engine.world).filter(
      (o) => o !== b && !o.isSensor,
    );
    // Check the muzzle and first 40px of flight, including current flipper positions.
    for (const distance of [0, 10, 20, 30, 40]) {
      const point = {
        x: c.exit.x + c.direction.x * distance,
        y: c.exit.y + c.direction.y * distance,
      };
      if (
        Matter.Query.collides(
          Matter.Bodies.circle(point.x, point.y, PHYSICS.ballRadius + 2),
          obstacles,
        ).length
      )
        return false;
      if (
        [p.left, p.right].some(
          (f) =>
            Math.hypot(
              f.closest(point).x - point.x,
              f.closest(point).y - point.y,
            ) <
            PHYSICS.ballRadius + PHYSICS.flipper.radius + 2,
        )
      )
        return false;
    }
    return true;
  }
  private release(p: PinballPhysics) {
    const h = this.held;
    if (!h) return;
    Matter.Body.setStatic(h.body, false);
    h.body.isSensor = h.sensor;
    h.body.collisionFilter.mask = h.mask;
    p.heldBalls.delete(h.body.id);
    this.held = undefined;
  }
  update(
    p: PinballPhysics,
    d: RescueData,
    now: number,
    enabled: boolean,
    type: string,
    onChange: () => void,
    onEvent: (phase: RescuePhase, side: CannonSide, b: Matter.Body) => void,
  ) {
    if (this.physics !== p) {
      if (this.physics) this.release(this.physics);
      this.physics = p;
    }
    const ball = p.ball;
    if (this.held && !p.balls.includes(this.held.body)) {
      this.release(p);
      d.pending = undefined;
      d.phase = "IN_PLAY";
      d.ballId = null;
      onChange();
    }
    if (d.pending && d.side && ball && p.launched) {
      const side = d.side,
        c = RESCUE.cannons[side],
        pending = d.pending;
      if (!this.held) {
        this.held = {
          body: ball,
          sensor: ball.isSensor,
          mask: ball.collisionFilter.mask ?? 0xffffffff,
        };
        p.heldBalls.add(ball.id);
        Matter.Body.setStatic(ball, true);
        ball.isSensor = true;
        ball.collisionFilter.mask = 0;
        d.ballId = ball.id;
        pending.started = now;
        d.phase = "RESCUE_DETECTED";
      }
      const age = now - pending.started;
      const next: RescuePhase =
        age < 35
          ? "RESCUE_DETECTED"
          : age < RESCUE.captureAnimationDuration
            ? "RESCUE_CAPTURED"
            : "RESCUE_CHARGING";
      if (d.phase !== next) {
        d.phase = next;
        onEvent(next, side, ball);
      }
      const t = Math.min(1, age / RESCUE.captureAnimationDuration);
      Matter.Body.setPosition(ball, {
        x: pending.position.x + (c.x - pending.position.x) * t,
        y: pending.position.y + (c.y - pending.position.y) * t,
      });
      if (age < RESCUE.captureAnimationDuration + RESCUE.chargeDuration) return;
      if (!enabled || !this.remaining(d) || !this.safe(p, ball, side)) {
        this.release(p);
        Matter.Body.setPosition(ball, pending.position);
        Matter.Body.setVelocity(ball, pending.velocity);
        d.pending = undefined;
        d.phase = "IN_PLAY";
        d.lastFire = now;
        d.needsExit = true;
        d.ballId = null;
        d.log.push({ side, ballId: ball.id, time: now, result: "blocked" });
        d.log = d.log.slice(-20);
        onChange();
        return;
      }
      // Commit exactly once before the physical shot. Reload cannot refund a completed shot.
      d.used++;
      d.sequence++;
      d.pending = undefined;
      d.phase = "RESCUE_LAUNCHING";
      d.lastFire = now;
      d.needsExit = true;
      onChange();
      this.release(p);
      Matter.Body.setPosition(ball, c.exit);
      const speed = Math.min(c.speed, RESCUE.maximumBallSpeed, p.maxSpeed);
      Matter.Body.setVelocity(ball, {
        x: (c.direction.x * speed) / 60,
        y: (c.direction.y * speed) / 60,
      });
      ball.force.x = 0;
      ball.force.y = 0;
      Matter.Body.setAngularVelocity(ball, 0);
      d.log.push({ side, ballId: ball.id, time: now, result: "fired" });
      d.log = d.log.slice(-20);
      onEvent("RESCUE_LAUNCHING", side, ball);
      onChange();
      return;
    }
    if (d.phase === "RESCUE_LAUNCHING" && now - d.lastFire > 100) {
      d.phase = "IN_PLAY";
      d.ballId = null;
    }
    if (
      ball &&
      ball.position.y < 675 &&
      ball.position.x > 165 &&
      ball.position.x < 411
    )
      d.needsExit = false;
    if (
      !enabled ||
      !ball ||
      !p.launched ||
      p.heldBalls.size ||
      !this.remaining(d) ||
      d.needsExit ||
      now - d.lastFire < RESCUE.launchCooldown
    )
      return;
    if (!RESCUE.eligibleBallTypes.includes(type)) return;
    if (!RESCUE.allowPromotedLastBall && ball.label === "temporary-sphere")
      return;
    const { x, y } = ball.position,
      vx = ball.velocity.x * 60,
      vy = ball.velocity.y * 60;
    if (
      vy < RESCUE.minimumBallSpeed ||
      y >= PHYSICS.drainY ||
      !Number.isFinite(x + y + vx + vy)
    )
      return;
    for (const side of ["left", "right"] as const) {
      const c = RESCUE.cannons[side],
        z = c.zone;
      if (x < z.minX || x > z.maxX || y < z.minY || y > z.maxY) continue;
      const inward = side === "left" ? vx : -vx;
      const guide =
        side === "left"
          ? 86 + ((Math.min(y, 790) - 675) * 91) / 115
          : 492 - ((Math.min(y, 790) - 675) * 93) / 115;
      if (inward > 30 || (side === "left" ? x > guide - 20 : x < guide + 20))
        continue;
      if (!this.safe(p, ball, side)) {
        d.lastFire = now;
        d.log.push({ side, ballId: ball.id, time: now, result: "blocked" });
        d.log = d.log.slice(-20);
        onChange();
        return;
      }
      d.side = side;
      d.ballId = ball.id;
      d.phase = "RESCUE_DETECTED";
      d.pending = {
        position: { x, y },
        velocity: { ...ball.velocity },
        started: now,
      };
      onEvent("RESCUE_DETECTED", side, ball);
      onChange();
      this.update(p, d, now, enabled, type, onChange, onEvent);
      return;
    }
  }
}
