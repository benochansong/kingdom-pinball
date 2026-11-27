import Matter from "matter-js";
import { COLLISION, PHYSICS } from "../config/physics";
import { RAILS, TARGETS, type TargetDefinition } from "../data/table";
import { FlipperController } from "./FlipperController";
const { Engine, Bodies, Body, Composite, Events } = Matter;

export interface Contact {
  ball?: Matter.Body;
  target: TargetDefinition;
  speed: number;
  normalSpeed: number;
}
export class PinballPhysics {
  maxSpeed: number = PHYSICS.maxSpeed;
  bumperFactor = 1;
  readonly engine = Engine.create({
    gravity: { x: 0, y: 1, scale: PHYSICS.gravity },
    positionIterations: 8,
    velocityIterations: 8,
    enableSleeping: false,
  });
  readonly left = new FlipperController("left");
  readonly right = new FlipperController("right");
  ball?: Matter.Body;
  private extraBalls = new Map<number, Matter.Body>();
  get balls(): Matter.Body[] {
    return this.ball
      ? [this.ball, ...this.extraBalls.values()]
      : [...this.extraBalls.values()];
  }
  shouldPhase?: (ball: Matter.Body, other: Matter.Body) => boolean;
  gate: Matter.Body;
  launched = false;
  gateClosed = false;
  onHit: (contact: Contact) => void = () => {};
  onImpact: (x: number, y: number, speed: number) => void = () => {};
  onBuildingHit: (id: string, speed: number, ball?: Matter.Body) => void =
    () => {};
  readonly buildingBodies = new Map<string, Matter.Body>();
  private targets = new Map<number, TargetDefinition>();
  private incoming = new Map<number, { x: number; y: number }>();
  private nextTargets: TargetDefinition[];
  addTarget(target: TargetDefinition) {
    if (this.nextTargets.some((t) => t.id === target.id)) return;
    this.nextTargets = [...this.nextTargets, target];
    this.setTargetEnabled(target.id, true);
  }
  removeTarget(id: string) {
    this.setTargetEnabled(id, false);
    this.nextTargets = this.nextTargets.filter((t) => t.id !== id);
  }
  setTargetEnabled(id: string, enabled: boolean) {
    const target = this.nextTargets.find((t) => t.id === id);
    if (!target) return;
    const old = Composite.allBodies(this.engine.world).find(
      (b) => b.label === id,
    );
    if (!enabled && old) {
      Composite.remove(this.engine.world, old);
      this.targets.delete(old.id);
    }
    if (enabled && !old) {
      const body = Bodies.circle(target.x, target.y, target.radius, {
        isStatic: true,
        restitution: 0.9,
        friction: 0,
        label: id,
        collisionFilter: { category: COLLISION.bumper },
      });
      this.targets.set(body.id, target);
      Composite.add(this.engine.world, body);
    }
  }

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
        const ball = this.balls.find(
          (b) => b === pair.bodyA || b === pair.bodyB,
        );
        if (!ball) continue;
        const incoming = this.incoming.get(ball.id) ?? { x: 0, y: 0 };
        const other =
          pair.bodyA === ball
            ? pair.bodyB
            : pair.bodyB === ball
              ? pair.bodyA
              : undefined;
        if (!other) continue;
        if (other.label.startsWith("building-")) {
          if (this.shouldPhase?.(ball, other)) pair.isSensor = true;
          const n = pair.collision.normal;
          const normalSpeed = Math.abs(incoming.x * n.x + incoming.y * n.y);
          if (normalSpeed > 40)
            this.onBuildingHit(other.label, normalSpeed, ball);
          continue;
        }
        if (other.isSensor) continue;
        const speed = Math.hypot(incoming.x, incoming.y);
        const target = this.targets.get(other.id);
        if (target) {
          const dx = ball.position.x - target.x,
            dy = ball.position.y - target.y;
          const d = Math.max(1, Math.hypot(dx, dy));
          const nx = dx / d,
            ny = dy / d;
          const normalSpeed = Math.max(0, -(incoming.x * nx + incoming.y * ny));
          // Only approaching, meaningful contacts count. Persistent contact isn't collisionStart.
          if (normalSpeed > 40)
            this.onHit({ target, speed, normalSpeed, ball });
        } else {
          this.onImpact(ball.position.x, ball.position.y, speed);
          if (other.label === "sling" && speed > 70) {
            const direction = ball.position.x < 288 ? 1 : -1;
            Body.setVelocity(ball, {
              x: ball.velocity.x + direction * 3,
              y: Math.min(ball.velocity.y, -4.5),
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
    for (const b of this.balls)
      this.incoming.set(b.id, { x: b.velocity.x * 60, y: b.velocity.y * 60 });
    Engine.update(this.engine, dt * 1000);
    const ball = this.ball;
    if (!ball || !this.launched) return;
    for (const b of this.balls) {
      this.left.collide(b);
      this.right.collide(b);
      this.limitSpeed(b);
    }
    if (!this.gateClosed && ball.position.x < 468 && ball.position.y < 240) {
      this.gateClosed = true;
      this.gate.isSensor = false;
    }
    // A short, fixed step bounds displacement below one ball radius at the speed cap.
    this.limitSpeed();
  }
  kick(target: TargetDefinition, ball = this.ball): void {
    if (!ball) return;
    const dx = ball.position.x - target.x,
      dy = ball.position.y - target.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const outward = ((ball.velocity.x * dx + ball.velocity.y * dy) / d) * 60;
    const impulse = Math.max(0, target.kick * this.bumperFactor - outward);
    Body.setVelocity(ball, {
      x: ball.velocity.x + ((dx / d) * impulse) / 60,
      y: ball.velocity.y + ((dy / d) * impulse) / 60,
    });
  }
  limitSpeed(ball = this.ball): void {
    if (!ball) return;
    const speed = ball.speed * 60;
    if (speed > this.maxSpeed)
      Body.setVelocity(ball, {
        x: (ball.velocity.x * this.maxSpeed) / speed,
        y: (ball.velocity.y * this.maxSpeed) / speed,
      });
  }
  removeBall(): void {
    for (const b of this.balls) Composite.remove(this.engine.world, b);
    this.extraBalls.clear();
    this.incoming.clear();
    this.ball = undefined;
    this.launched = false;
  }
  removeSphere(ball: Matter.Body): void {
    Composite.remove(this.engine.world, ball);
    this.extraBalls.delete(ball.id);
    this.incoming.delete(ball.id);
    if (this.ball === ball) {
      this.ball = this.extraBalls.values().next().value;
      if (this.ball) this.extraBalls.delete(this.ball.id);
      else this.launched = false;
    }
  }
  addSphere(
    preferred = { x: 300, y: 430 },
    index = 0,
  ): Matter.Body | undefined {
    if (!this.launched || this.balls.length >= 10) return;
    const bodies = Composite.allBodies(this.engine.world);
    let point: { x: number; y: number } | undefined;
    for (let ring = 0; ring < 9 && !point; ring++)
      for (let i = 0; i < 12; i++) {
        const a = ((i + index) * Math.PI) / 6,
          p = {
            x: preferred.x + Math.cos(a) * ring * 26,
            y: preferred.y + Math.sin(a) * ring * 26,
          };
        if (p.x < 80 || p.x > 500 || p.y < 100 || p.y > 680) continue;
        const test = Bodies.circle(p.x, p.y, PHYSICS.ballRadius + 5);
        if (
          Matter.Query.collides(
            test,
            bodies.filter((b) => !b.isSensor),
          ).length ||
          this.balls.some(
            (b) => Math.hypot(b.position.x - p.x, b.position.y - p.y) < 30,
          )
        )
          continue;
        point = p;
        break;
      }
    if (!point) return;
    const b = Bodies.circle(point.x, point.y, PHYSICS.ballRadius, {
      restitution: PHYSICS.ballRestitution,
      friction: 0.02,
      frictionStatic: 0.06,
      frictionAir: PHYSICS.airFriction,
      density: 0.004,
      label: "temporary-sphere",
      collisionFilter: {
        category: COLLISION.ball,
        mask:
          COLLISION.wall | COLLISION.bumper | COLLISION.gate | COLLISION.ball,
      },
    });
    this.extraBalls.set(b.id, b);
    Composite.add(this.engine.world, b);
    const angle = -Math.PI / 2 + ((index % 7) - 3) * 0.19;
    Body.setVelocity(b, { x: Math.cos(angle) * 8, y: Math.sin(angle) * 8 });
    return b;
  }
  dispose(): void {
    Events.off(this.engine, "collisionStart");
    Composite.clear(this.engine.world, false);
    Engine.clear(this.engine);
  }
}
