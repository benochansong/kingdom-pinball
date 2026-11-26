import Matter from "matter-js";
import { COLLISION, PHYSICS } from "../config/physics";
import { RAILS, TARGETS, type TargetDefinition } from "../data/table";
import { FlipperController } from "./FlipperController";
const { Engine, Bodies, Body, Composite, Events } = Matter;

export interface Contact {
  target: TargetDefinition;
  speed: number;
  normalSpeed: number;
}
export class PinballPhysics {
  readonly engine = Engine.create({
    gravity: { x: 0, y: 1, scale: PHYSICS.gravity },
    positionIterations: 8,
    velocityIterations: 8,
    enableSleeping: false,
  });
  readonly left = new FlipperController("left");
  readonly right = new FlipperController("right");
  ball?: Matter.Body;
  gate: Matter.Body;
  launched = false;
  gateClosed = false;
  onHit: (contact: Contact) => void = () => {};
  onImpact: (x: number, y: number, speed: number) => void = () => {};
  onBuildingHit: (id: string, speed: number) => void = () => {};
  readonly buildingBodies = new Map<string, Matter.Body>();
  private targets = new Map<number, TargetDefinition>();
  private incoming = { x: 0, y: 0 };
  private nextTargets: TargetDefinition[];

  constructor(targets = TARGETS) {
    this.nextTargets = targets;
    for (const rail of RAILS) {
      const dx = rail.b[0] - rail.a[0];
      const dy = rail.b[1] - rail.a[1];
      const body = Bodies.rectangle(
        (rail.a[0] + rail.b[0]) / 2,
        (rail.a[1] + rail.b[1]) / 2,
        Math.hypot(dx, dy) + 8,
        rail.width,
        {
          isStatic: true,
          angle: Math.atan2(dy, dx),
          restitution: rail.sling ? 1 : PHYSICS.wallRestitution,
          friction: 0.015,
          label: rail.sling ? "sling" : "wall",
          collisionFilter: { category: COLLISION.wall },
        },
      );
      Composite.add(this.engine.world, body);
    }
    for (const target of this.nextTargets) {
      const body = Bodies.circle(target.x, target.y, target.radius, {
        isStatic: true,
        restitution: 0.9,
        friction: 0,
        label: target.id,
        collisionFilter: { category: COLLISION.bumper },
      });
      this.targets.set(body.id, target);
      Composite.add(this.engine.world, body);
    }
    this.gate = Bodies.rectangle(500, 171, 55, 12, {
      isStatic: true,
      angle: 0.75,
      isSensor: true,
      label: "gate",
      collisionFilter: { category: COLLISION.gate },
    });
    Composite.add(this.engine.world, this.gate);
    Events.on(this.engine, "collisionStart", (event) => {
      if (!this.ball || !this.launched) return;
      for (const pair of event.pairs) {
        const other =
          pair.bodyA === this.ball
            ? pair.bodyB
            : pair.bodyB === this.ball
              ? pair.bodyA
              : undefined;
        if (!other) continue;
        if (other.label.startsWith("building-")) {
          const n = pair.collision.normal;
          const normalSpeed = Math.abs(
            this.incoming.x * n.x + this.incoming.y * n.y,
          );
          if (normalSpeed > 40) this.onBuildingHit(other.label, normalSpeed);
          continue;
        }
        if (other.isSensor) continue;
        const speed = Math.hypot(this.incoming.x, this.incoming.y);
        const target = this.targets.get(other.id);
        if (target) {
          const dx = this.ball.position.x - target.x,
            dy = this.ball.position.y - target.y;
          const d = Math.max(1, Math.hypot(dx, dy));
          const nx = dx / d,
            ny = dy / d;
          const normalSpeed = Math.max(
            0,
            -(this.incoming.x * nx + this.incoming.y * ny),
          );
          // Only approaching, meaningful contacts count. Persistent contact isn't collisionStart.
          if (normalSpeed > 40) this.onHit({ target, speed, normalSpeed });
        } else {
          this.onImpact(this.ball.position.x, this.ball.position.y, speed);
          if (other.label === "sling" && speed > 70) {
            const direction = this.ball.position.x < 288 ? 1 : -1;
            Body.setVelocity(this.ball, {
              x: this.ball.velocity.x + direction * 3,
              y: Math.min(this.ball.velocity.y, -4.5),
            });
          }
        }
      }
    });
  }
  spawn(): void {
    this.removeBall();
    this.ball = Bodies.circle(
      PHYSICS.launcher.x,
      PHYSICS.launcher.y,
      PHYSICS.ballRadius,
      {
        restitution: PHYSICS.ballRestitution,
        friction: 0.02,
        frictionStatic: 0.06,
        frictionAir: PHYSICS.airFriction,
        density: 0.004,
        label: "core-sphere",
        collisionFilter: {
          category: COLLISION.ball,
          mask: COLLISION.wall | COLLISION.bumper | COLLISION.gate,
        },
      },
    );
    Body.setStatic(this.ball, true);
    Composite.add(this.engine.world, this.ball);
    this.launched = false;
    this.gateClosed = false;
    this.gate.isSensor = true;
  }
  launch(power: number): void {
    if (!this.ball || this.launched) return;
    Body.setStatic(this.ball, false);
    const speed =
      PHYSICS.launcher.minSpeed +
      Math.max(0, Math.min(1, power)) *
        (PHYSICS.launcher.maxSpeed - PHYSICS.launcher.minSpeed);
    Body.setVelocity(this.ball, { x: 0, y: -speed / 60 });
    this.launched = true;
  }
  step(dt: number, flippersEnabled = true): void {
    this.left.update(dt, flippersEnabled);
    this.right.update(dt, flippersEnabled);
    if (this.ball)
      this.incoming = {
        x: this.ball.velocity.x * 60,
        y: this.ball.velocity.y * 60,
      };
    Engine.update(this.engine, dt * 1000);
    const ball = this.ball;
    if (!ball || !this.launched) return;
    this.left.collide(ball);
    this.right.collide(ball);
    if (!this.gateClosed && ball.position.x < 468 && ball.position.y < 240) {
      this.gateClosed = true;
      this.gate.isSensor = false;
    }
    // A short, fixed step bounds displacement below one ball radius at the speed cap.
    this.limitSpeed();
  }
  kick(target: TargetDefinition): void {
    if (!this.ball) return;
    const dx = this.ball.position.x - target.x,
      dy = this.ball.position.y - target.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const outward =
      ((this.ball.velocity.x * dx + this.ball.velocity.y * dy) / d) * 60;
    const impulse = Math.max(0, target.kick - outward);
    Body.setVelocity(this.ball, {
      x: this.ball.velocity.x + ((dx / d) * impulse) / 60,
      y: this.ball.velocity.y + ((dy / d) * impulse) / 60,
    });
  }
  limitSpeed(): void {
    if (!this.ball) return;
    const speed = this.ball.speed * 60;
    if (speed > PHYSICS.maxSpeed)
      Body.setVelocity(this.ball, {
        x: (this.ball.velocity.x * PHYSICS.maxSpeed) / speed,
        y: (this.ball.velocity.y * PHYSICS.maxSpeed) / speed,
      });
  }
  removeBall(): void {
    if (this.ball) Composite.remove(this.engine.world, this.ball);
    this.ball = undefined;
    this.launched = false;
  }
  dispose(): void {
    Events.off(this.engine, "collisionStart");
    Composite.clear(this.engine.world, false);
    Engine.clear(this.engine);
  }
}
