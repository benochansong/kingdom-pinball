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
  pending?: {
    position: Point;
    velocity: Point;
    started: number;
    charged?: boolean;
  };
  sequence: number;
  gates?: { left: boolean; right: boolean };
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
  if (r.pending && d.side && (d.used < d.total || r.pending.charged === true)) {
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
        charged: p.charged === true && d.used > 0,
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
  private previous?: { id: number; position: Point; velocity: Point };
  remaining(d: RescueData) {
    return Math.max(0, d.total - d.used);
  }
  private safe(p: PinballPhysics, b: Matter.Body, side: CannonSide) {
    const c = RESCUE.cannons[side];
    const obstacles = Matter.Composite.allBodies(p.engine.world).filter(
      (o) => o !== b && !o.isSensor && o !== p.rescueGates.get(side),
    );
    // Sweep the real outlane-to-field flight through its open guide shutter.
    for (let distance = 0; distance <= 170; distance += 5) {
      const seconds = distance / Math.min(c.speed, p.maxSpeed);
      const point = {
        x: c.exit.x + c.direction.x * distance,
        y:
          c.exit.y +
          c.direction.y * distance +
          0.5 *
            p.engine.gravity.y *
            p.engine.gravity.scale *
            1e6 *
            seconds *
            seconds,
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
      this.previous = undefined;
    }
    enabled = enabled && p.rescueSensors.size === 2;
    p.updateRescueHardware(enabled && this.remaining(d) > 0 && !d.pending);
    d.gates = {
      left: p.rescueGates.get("left")?.isSensor ?? false,
      right: p.rescueGates.get("right")?.isSensor ?? false,
    };
    const ball = p.ball;
    const prior = this.previous;
    this.previous = ball
      ? {
          id: ball.id,
          position: { ...ball.position },
          velocity: { ...ball.velocity },
        }
      : undefined;
    if (this.held && !p.balls.includes(this.held.body)) {
      this.release(p);
      if (d.pending?.charged) d.used = Math.max(0, d.used - 1);
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
        Matter.Body.setVelocity(ball, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(ball, 0);
        ball.force.x = ball.force.y = ball.torque = 0;
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
      const phaseChanged = d.phase !== next;
      d.phase = next;
      const t = Math.min(1, age / RESCUE.captureAnimationDuration);
      Matter.Body.setPosition(ball, {
        x: pending.position.x + (c.x - pending.position.x) * t,
        y: pending.position.y + (c.y - pending.position.y) * t,
      });
      Matter.Body.setVelocity(ball, { x: 0, y: 0 });
      Matter.Body.setAngularVelocity(ball, 0);
      if (
        age >= RESCUE.captureAnimationDuration &&
        !pending.charged &&
        this.remaining(d) > 0
      ) {
        // Charge only when this body is physically held at the anchor. Persist the debit
        // with the pending capture so reloading the last shot cannot charge it twice.
        pending.charged = true;
        d.used++;
        onChange();
      }
      if (phaseChanged) onEvent(next, side, ball);
      if (age < RESCUE.captureAnimationDuration + RESCUE.chargeDuration) return;
      if (
        !enabled ||
        !pending.charged ||
        d.total <= 0 ||
        d.used > d.total ||
        !this.safe(p, ball, side)
      ) {
        this.release(p);
        Matter.Body.setPosition(ball, pending.position);
        Matter.Body.setVelocity(ball, pending.velocity);
        if (pending.charged) d.used = Math.max(0, d.used - 1);
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
      // The held capture already consumed one shot; launch must not debit it again.
      d.sequence++;
      d.pending = undefined;
      d.phase = "RESCUE_LAUNCHING";
      d.lastFire = now;
      d.needsExit = true;
      onChange();
      this.release(p);
      p.openRescueGate(side);
      d.gates[side] = true;
      // No relocation to the field: the ball leaves the outlane chamber under velocity.
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
    if (!Number.isFinite(x + y + vx + vy)) return;
    for (const side of ["left", "right"] as const) {
      const sensor = p.rescueSensors.get(side);
      if (!sensor) continue;
      const direct =
        y < PHYSICS.drainY &&
        vy >= RESCUE.minimumBallSpeed &&
        Matter.Query.collides(ball, [sensor]).length > 0;
      const swept =
        prior?.id === ball.id &&
        prior.position.y < PHYSICS.drainY &&
        y > prior.position.y &&
        prior.velocity.y * 60 >= RESCUE.minimumBallSpeed &&
        Matter.Query.ray(
          [sensor],
          prior.position,
          { x, y },
          PHYSICS.ballRadius * 2,
        ).length > 0;
      if (!direct && !swept) continue;
      // The corridor follows the outer side of the guide, never the main field.
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
        position: direct ? { x, y } : prior!.position,
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
