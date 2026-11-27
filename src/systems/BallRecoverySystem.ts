import Matter from "matter-js";
import type { PinballPhysics } from "../physics/PinballPhysics";
const { Body } = Matter;

export class BallRecoverySystem {
  private anchor = { x: 0, y: 0 };
  private stillFor = 0;
  private attempts = 0;
  suppressUntil = 0;
  reset(): void {
    this.stillFor = 0;
    this.attempts = 0;
    this.suppressUntil = 0;
    this.anchor = { x: 0, y: 0 };
  }
  update(
    physics: PinballPhysics,
    dt: number,
    now: number,
    sphere = physics.ball,
  ): "impulse" | "return" | undefined {
    const ball = sphere;
    if (!ball || !physics.launched || physics.heldBalls.has(ball.id)) {
      this.stillFor = 0;
      return;
    }
    if (
      !Number.isFinite(ball.position.x) ||
      !Number.isFinite(ball.position.y) ||
      ball.position.x < 5 ||
      ball.position.x > 595 ||
      ball.position.y < 5
    ) {
      this.suppressUntil = now + 1800;
      this.attempts = 0;
      return "return";
    }
    // A missed weak launch returning down the shooter lane may be launched again for free.
    if (ball.position.x > 540 && ball.position.y > 815 && ball.speed < 1)
      return "return";
    if (physics.left.isCradling(ball) || physics.right.isCradling(ball)) {
      this.stillFor = 0;
      return;
    }
    const moved = Math.hypot(
      ball.position.x - this.anchor.x,
      ball.position.y - this.anchor.y,
    );
    if (moved > 44) {
      this.anchor = { ...ball.position };
      this.stillFor = 0;
      this.attempts = 0;
    } else this.stillFor += dt;
    // Detect low-speed stalls and small rapid loops, but allow natural travel and catches.
    const threshold = ball.speed * 60 < 45 ? 2.8 : 5;
    if (this.stillFor < threshold) return;
    this.stillFor = 0;
    this.attempts++;
    this.suppressUntil = now + 1800;
    if (this.attempts >= 3) {
      this.attempts = 0;
      return "return";
    }
    const direction = ball.position.x < 288 ? 1 : -1;
    Body.setVelocity(ball, {
      x: direction * (3 + this.attempts),
      y: -6 - this.attempts,
    });
    return "impulse";
  }
}
