import Matter from "matter-js";
import { element } from "../config/magic";
import { PHYSICS } from "../config/physics";
import type { PinballPhysics } from "../physics/PinballPhysics";
import type { BallState, Element, MagicData } from "./types";
import { BallRecoverySystem } from "../systems/BallRecoverySystem";
/** Runtime registry. Saves use a paid safe checkpoint, never serialize Matter objects. */
export class BallManager {
  readonly states = new Map<number, BallState>();
  private recoveries = new Map<number, BallRecoverySystem>();
  valid(b: Matter.Body | undefined, now: number) {
    return !b || now >= (this.recoveries.get(b.id)?.suppressUntil ?? 0);
  }
  recover(dt: number, now: number) {
    for (const b of this.physics.balls) {
      if (b === this.physics.ball) continue;
      let r = this.recoveries.get(b.id);
      if (!r) {
        r = new BallRecoverySystem();
        this.recoveries.set(b.id, r);
      }
      if (r.update(this.physics, dt, now, b) === "return")
        this.physics.removeSphere(b);
    }
    for (const id of this.recoveries.keys())
      if (!this.physics.balls.some((b) => b.id === id))
        this.recoveries.delete(id);
  }
  constructor(
    readonly physics: PinballPhysics,
    readonly data: MagicData,
  ) {}
  sync() {
    const live = new Set(this.physics.balls.map((b) => b.id));
    for (const id of this.states.keys())
      if (!live.has(id)) this.states.delete(id);
    for (const b of this.physics.balls)
      if (!this.states.has(b.id))
        this.states.set(b.id, {
          id: `sphere-${this.data.nextBall++}`,
          bodyId: b.id,
          type: "steel",
          until: 0,
          hits: 0,
          phaseLeft: 0,
          temporary: b !== this.physics.ball,
          source: "normal",
          baseMass: Number.isFinite(b.mass)
            ? b.mass
            : Math.PI * PHYSICS.ballRadius ** 2 * 0.004,
        });
    for (const b of this.physics.balls)
      this.states.get(b.id)!.temporary = b !== this.physics.ball;
  }
  state(b = this.physics.ball) {
    if (b && !this.states.has(b.id)) this.sync();
    return b ? this.states.get(b.id) : undefined;
  }
  transform(b: Matter.Body, type: Element, until: number) {
    this.sync();
    if (this.physics.heldBalls.has(b.id)) return;
    const s = this.states.get(b.id)!;
    s.type = type;
    s.until = until;
    s.hits = 0;
    s.phaseLeft = type === "phantom" ? 1 : 0;
    const c = element(type);
    Matter.Body.setDensity(b, 0.004 * c.mass);
    b.restitution = Math.min(0.95, PHYSICS.ballRestitution * c.bounce);
    b.friction = 0.02 * c.friction;
    b.frictionAir = PHYSICS.airFriction * c.friction;
    this.physics.limitSpeed(b);
  }
  tick(now: number) {
    this.sync();
    for (const b of this.physics.balls) {
      if (this.physics.heldBalls.has(b.id)) continue;
      const s = this.states.get(b.id)!;
      if (s.type !== "steel" && s.until <= now) this.transform(b, "steel", 0);
    }
  }
  create(
    type: Element,
    until: number,
    source: "multiball" | "storm",
    index: number,
  ) {
    const b = this.physics.addSphere({ x: 300, y: 430 }, index);
    if (!b) return false;
    this.transform(b, type, until);
    this.states.get(b.id)!.source = source;
    return true;
  }
  end() {
    // Expiry and a primary drain can occur in the same physics step.
    // Promote a live sphere before removing temporary ones.
    if (this.physics.ball && this.physics.ball.position.y > PHYSICS.drainY) {
      const live = this.physics.balls.find(
        (b) => b.position.y <= PHYSICS.drainY,
      );
      if (live) {
        for (const b of [...this.physics.balls])
          if (b !== live) this.physics.removeSphere(b);
      }
    }
    const primary = this.physics.ball;
    for (const b of this.physics.balls)
      if (b !== primary) this.physics.removeSphere(b);
    if (primary && this.states.get(primary.id)?.source === "storm")
      this.transform(primary, "steel", 0);
    this.sync();
  }
  /** Keep the last draining body for the ordinary, exactly-once loss handler. */
  drain(now: number) {
    let promoted = false;
    for (const b of this.physics.balls) {
      if (this.physics.heldBalls.has(b.id) || b.position.y <= PHYSICS.drainY)
        continue;
      const m = this.data.multi;
      if (m?.storm && now - m.started < 5000 && m.saves < 5) {
        if (this.physics.balls.length > 1) {
          promoted ||= b === this.physics.ball;
          this.physics.removeSphere(b);
          if (this.create("steel", m.until, "storm", m.saves)) m.saves++;
          continue;
        } else if (this.create("steel", m.until, "storm", m.saves)) {
          m.saves++;
          this.physics.removeSphere(b);
          promoted = true;
          continue;
        }
      }
      if (this.physics.balls.length > 1) {
        promoted ||= b === this.physics.ball;
        this.physics.removeSphere(b);
      }
    }
    this.sync();
    return promoted;
  }
  resourceFactor(b?: Matter.Body) {
    const s = this.state(b);
    if (!s?.temporary) return 1;
    const count = this.data.multi?.count ?? 1;
    return count >= 10 ? 0.3 : count >= 7 ? 0.45 : count >= 5 ? 0.55 : 0.7;
  }
  damageFactor(b?: Matter.Body) {
    const s = this.state(b);
    if (!s?.temporary) return 1;
    const count = this.data.multi?.count ?? 1;
    return count >= 10 ? 0.45 : count >= 7 ? 0.55 : count >= 5 ? 0.65 : 0.8;
  }
}
