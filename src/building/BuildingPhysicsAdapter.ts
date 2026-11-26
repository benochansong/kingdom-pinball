import Matter from "matter-js";
import { COLLISION } from "../config/physics";
import { buildingConfig } from "../config/buildings";
import type { PinballPhysics } from "../physics/PinballPhysics";
import type { BuildingEntity } from "./types";
/** Only changed static bodies are replaced. The real ball and flipper state survive editing. */
export function applyBuildings(
  physics: PinballPhysics,
  buildings: BuildingEntity[],
): void {
  for (const [id, body] of physics.buildingBodies) {
    if (!buildings.some((b) => b.id === id)) {
      Matter.Composite.remove(physics.engine.world, body);
      physics.buildingBodies.delete(id);
    }
  }
  for (const b of buildings) {
    const c = buildingConfig(b.type)!;
    const signature = `${b.type}:${b.x}:${b.y}:${b.angle}:${b.level}`;
    const old = physics.buildingBodies.get(b.id);
    if (old?.plugin.signature === signature) continue;
    if (old) Matter.Composite.remove(physics.engine.world, old);
    const options = {
      isStatic: true,
      isSensor: !!c.sensor,
      angle: (b.angle * Math.PI) / 180,
      restitution: Math.min(1, c.restitution + (b.level - 1) * 0.025),
      friction: 0.01,
      label: b.id,
      collisionFilter: { category: COLLISION.bumper },
      plugin: { signature },
    };
    const body =
      c.shape === "circle"
        ? Matter.Bodies.circle(b.x, b.y, c.width / 2, options)
        : Matter.Bodies.rectangle(b.x, b.y, c.width, c.height, options);
    physics.buildingBodies.set(b.id, body);
    Matter.Composite.add(physics.engine.world, body);
  }
}
export function buildingImpulse(
  physics: PinballPhysics,
  b: BuildingEntity,
): void {
  const ball = physics.ball;
  if (!ball) return;
  const c = buildingConfig(b.type)!;
  const a = (b.angle * Math.PI) / 180,
    dx = Math.cos(a),
    dy = Math.sin(a),
    speed = ball.speed * 60;
  if (b.type === "slow" && speed > 180) {
    const factor = Math.max(0.75, 180 / speed);
    Matter.Body.setVelocity(ball, {
      x: ball.velocity.x * factor,
      y: ball.velocity.y * factor,
    });
  }
  if (b.type === "booster" && ball.velocity.x * dx + ball.velocity.y * dy > 1)
    Matter.Body.setVelocity(ball, {
      x: ball.velocity.x + dx * (2 + b.level * 0.4),
      y: ball.velocity.y + dy * (2 + b.level * 0.4),
    });
  if (b.type === "guide" && ball.velocity.x * dx + ball.velocity.y * dy > 0)
    Matter.Body.setVelocity(ball, {
      x: ball.velocity.x + dx * 1.5,
      y: ball.velocity.y + dy * 1.5,
    });
  if (
    c.shape === "circle" &&
    (c.production || ["bumper", "arcane", "altar"].includes(b.type))
  )
    physics.kick({
      id: b.id,
      kind: "stone",
      name: c.name,
      x: b.x,
      y: b.y,
      radius: c.width / 2,
      points: 100,
      kick:
        (b.type === "bumper" ? 580 : b.type === "arcane" ? 630 : 410) +
        b.level * 15,
      color: 0xd6b677,
    });
  physics.limitSpeed();
}
