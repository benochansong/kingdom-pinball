import Matter from "matter-js";
import type { GameStateManager } from "../core/GameStateManager";
import type { PhysicsSettings } from "./types";
import { DEFAULT_PHYSICS, PHYSICS_LIMITS } from "../config/modes";
import { PHYSICS } from "../config/physics";
import { element } from "../config/magic";
export class PhysicsLabController {
  constructor(
    readonly game: GameStateManager,
    readonly settings: PhysicsSettings,
  ) {}
  set(key: keyof PhysicsSettings, value: number) {
    const [min, max] = PHYSICS_LIMITS[key];
    if (!Number.isFinite(value)) return false;
    this.settings[key] = Math.max(min, Math.min(max, value));
    if (key === "balls") this.settings.balls = Math.floor(this.settings.balls);
    return true;
  }
  reset() {
    Object.assign(this.settings, DEFAULT_PHYSICS);
  }
  beforeStep(dt: number) {
    const g = this.game,
      p = g.physics,
      s = this.settings;
    p.engine.gravity.y *= s.gravity;
    p.maxSpeed = s.maxSpeed;
    p.bumperFactor = s.bumper;
    p.left.strength = p.right.strength = s.flipper;
    for (const b of p.balls) {
      if (b.isStatic) continue;
      const c = element(g.magic?.balls?.state(b)?.type ?? "steel");
      const density = 0.004 * c.mass * s.mass;
      if (Math.abs(b.density - density) > 1e-9)
        Matter.Body.setDensity(b, density);
      b.restitution = Math.min(
        0.95,
        PHYSICS.ballRestitution * c.bounce * s.restitution,
      );
      b.friction = 0.02 * c.friction * s.friction;
      b.frictionAir = Math.min(0.005, b.frictionAir * s.friction);
      if (s.wind)
        Matter.Body.applyForce(b, b.position, { x: b.mass * s.wind, y: 0 });
      if (b.position.y < 450 && s.accelerator !== 1)
        Matter.Body.setVelocity(b, {
          x: b.velocity.x,
          y: b.velocity.y + (s.accelerator - 1) * dt * 4,
        });
      if (b.position.y > 550 && s.slow !== 1) {
        const drag = Math.exp(-(s.slow - 1) * dt * 0.3);
        Matter.Body.setVelocity(b, {
          x: b.velocity.x * drag,
          y: b.velocity.y * drag,
        });
      }
      p.limitSpeed(b);
    }
  }
  balls() {
    const g = this.game;
    if (!g.physics.launched) return "먼저 공을 발사하세요.";
    while (g.physics.balls.length > this.settings.balls)
      g.physics.removeSphere(g.physics.balls[g.physics.balls.length - 1]);
    for (let i = g.physics.balls.length; i < this.settings.balls; i++)
      if (!g.magic?.balls?.create("steel", g.time + 60000, "multiball", i))
        break;
    return null;
  }
}
