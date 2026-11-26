import Matter from "matter-js";
import { PHYSICS } from "../config/physics";
const { Body } = Matter;

export class FlipperController {
  readonly pivot: { x: number; y: number };
  angle: number;
  angularVelocity = 0;
  held = false;
  readonly rest: number;
  readonly raised: number;
  constructor(readonly side: "left" | "right") {
    const left = side === "left";
    this.pivot = { x: left ? 181 : 395, y: 786 };
    this.rest = left ? 0.43 : Math.PI - 0.43;
    this.raised = left ? -0.48 : Math.PI + 0.48;
    this.angle = this.rest;
  }
  get tip(): { x: number; y: number } {
    return {
      x: this.pivot.x + Math.cos(this.angle) * PHYSICS.flipper.length,
      y: this.pivot.y + Math.sin(this.angle) * PHYSICS.flipper.length,
    };
  }
  update(dt: number, enabled: boolean): void {
    const target = this.held && enabled ? this.raised : this.rest;
    const delta = target - this.angle;
    const speed =
      this.held && enabled
        ? PHYSICS.flipper.upSpeed
        : PHYSICS.flipper.downSpeed;
    const move = Math.sign(delta) * Math.min(Math.abs(delta), speed * dt);
    this.angle += move;
    this.angularVelocity = move / dt;
  }
  closest(point: { x: number; y: number }): {
    x: number;
    y: number;
    t: number;
  } {
    const dx = Math.cos(this.angle) * PHYSICS.flipper.length;
    const dy = Math.sin(this.angle) * PHYSICS.flipper.length;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - this.pivot.x) * dx + (point.y - this.pivot.y) * dy) /
          (dx * dx + dy * dy),
      ),
    );
    return { x: this.pivot.x + dx * t, y: this.pivot.y + dy * t, t };
  }
  /** Rotating capsule contact, in the moving surface's frame. No scripted launch direction. */
  collide(ball: Matter.Body): boolean {
    const contact = this.closest(ball.position);
    const dx = ball.position.x - contact.x;
    const dy = ball.position.y - contact.y;
    const distance = Math.hypot(dx, dy);
    const radius =
      PHYSICS.ballRadius + PHYSICS.flipper.radius * (1.15 - 0.3 * contact.t);
    if (distance >= radius) return false;
    const nx = distance > 0.001 ? dx / distance : Math.sin(this.angle);
    const ny = distance > 0.001 ? dy / distance : -Math.cos(this.angle);
    Body.setPosition(ball, {
      x: contact.x + nx * (radius + 0.15),
      y: contact.y + ny * (radius + 0.15),
    });
    const surfaceX = -this.angularVelocity * (contact.y - this.pivot.y);
    const surfaceY = this.angularVelocity * (contact.x - this.pivot.x);
    const vx = ball.velocity.x * 60;
    const vy = ball.velocity.y * 60;
    const normalVelocity = (vx - surfaceX) * nx + (vy - surfaceY) * ny;
    if (normalVelocity < 0) {
      const impulse = -(1 + PHYSICS.flipper.restitution) * normalVelocity;
      const tangent = (vx - surfaceX) * -ny + (vy - surfaceY) * nx;
      Body.setVelocity(ball, {
        x: (vx + impulse * nx + tangent * ny * 0.045) / 60,
        y: (vy + impulse * ny - tangent * nx * 0.045) / 60,
      });
      Body.setAngularVelocity(ball, tangent * 0.00015);
    }
    return true;
  }
  isCradling(ball: Matter.Body): boolean {
    const c = this.closest(ball.position);
    return (
      this.held &&
      Math.abs(this.angle - this.raised) < 0.05 &&
      ball.position.y < c.y &&
      Math.hypot(ball.position.x - c.x, ball.position.y - c.y) < 34
    );
  }
}
