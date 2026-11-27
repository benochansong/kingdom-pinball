import Matter from "matter-js";
import type { GameStateManager } from "../core/GameStateManager";
import type { CampaignSession } from "./types";
import type { BlueprintItem } from "../building/types";
import { buildingConfig } from "../config/buildings";
import { region, stage } from "../config/campaign";
import { TERRAIN, type TerrainDevice } from "../config/terrain";
import { COLLISION, PHYSICS } from "../config/physics";
import { element } from "../config/magic";
export class RegionalPhysicsSystem {
  readonly devices: TerrainDevice[];
  private bodies = new Map<string, Matter.Body>();
  private disposed = false;
  constructor(
    readonly game: GameStateManager,
    readonly session: CampaignSession,
  ) {
    this.devices = TERRAIN[stage(session.stage).region];
    const p = game.physics;
    for (const d of this.devices) {
      if (["bumper", "scout", "breakable", "gate"].includes(d.kind)) {
        if (d.kind === "breakable" && session.mission.deviceHealth[d.id] === 0)
          continue;
        p.addTarget({
          id: d.id,
          kind: "bonus",
          name: d.kind,
          x: d.x,
          y: d.y,
          radius: d.radius,
          points: 75,
          kick: d.kind === "bumper" ? 650 : 300,
          color: 0xd7c58e,
        });
        const body = Matter.Composite.allBodies(p.engine.world).find(
          (b) => b.label === d.id,
        );
        if (body) this.bodies.set(d.id, body);
      }
      if (d.kind === "rotate") {
        const body = Matter.Bodies.rectangle(d.x, d.y, d.radius * 1.6, 9, {
          isStatic: true,
          label: d.id,
          restitution: 0.85,
          collisionFilter: { category: COLLISION.wall },
        });
        if (
          !Matter.Query.collides(
            body,
            Matter.Composite.allBodies(p.engine.world),
          ).length
        ) {
          Matter.Composite.add(p.engine.world, body);
          this.bodies.set(d.id, body);
        }
      }
    }
  }
  active(d: TerrainDevice) {
    if (stage(this.session.stage).region !== "dark") return true;
    const phase = this.session.mission.boss?.phase ?? 1;
    return phase <= 2
      ? ["gate", "breakable"].includes(d.kind)
      : phase === 3
        ? ["portal", "gravity"].includes(d.kind)
        : phase === 4
          ? ["breakable", "portal"].includes(d.kind)
          : ["heat"].includes(d.kind);
  }
  placement(item: BlueprintItem) {
    const c = buildingConfig(item.type);
    if (!c) return null;
    return this.devices.some(
      (d) =>
        ["portal", "rotate", "breakable", "gate", "bumper", "scout"].includes(
          d.kind,
        ) &&
        Math.hypot(d.x - item.x, d.y - item.y) <
          d.radius + Math.hypot(c.width, c.height) / 2 + 18,
    )
      ? "지역 장치와 안전 출구 공간을 비워 두세요."
      : null;
  }
  blocked(p: { x: number; y: number }) {
    return this.devices.some(
      (d) =>
        this.bodies.has(d.id) &&
        ["rotate", "breakable", "gate", "bumper", "scout"].includes(d.kind) &&
        Math.hypot(p.x - d.x, p.y - d.y) < d.radius + 12,
    );
  }
  hit(id: string) {
    if (
      this.game.testBall ||
      this.game.tilt.tilted ||
      this.game.time < this.game.recovery.suppressUntil ||
      this.game.state !== "playing"
    )
      return;
    const d = this.devices.find((d) => d.id === id),
      m = this.session.mission,
      now = this.game.time;
    if (!d || !this.active(d) || now < (m.deviceCooldowns[id] ?? 0)) return;
    m.deviceCooldowns[id] = now + 650;
    m.devices++;
    m.specialty = Math.min(10, m.specialty + 1);
    if (d.kind === "breakable") {
      m.deviceHealth[id] = Math.max(0, (m.deviceHealth[id] ?? 3) - 1);
      if (!m.deviceHealth[id]) {
        this.game.physics.removeTarget(id);
        this.bodies.delete(id);
        this.game.army?.navigation.invalidate();
        this.game.war?.enemyArmy.navigation.invalidate();
      }
    }
    if (m.boss) {
      if (d.kind === "scout" || d.kind === "breakable") {
        m.boss.weakUntil = now + 8000;
        m.boss.revealedUntil = now + 10000;
        m.boss.armor = Math.max(0, m.boss.armor - 80);
      }
    }
  }
  private countUse(id: string) {
    if (
      this.game.tilt.tilted ||
      this.game.time < this.game.recovery.suppressUntil ||
      this.game.state !== "playing"
    )
      return;
    const m = this.session.mission,
      key = `use-${id}`;
    if (this.game.time < (m.deviceCooldowns[key] ?? 0)) return;
    m.deviceCooldowns[key] = this.game.time + 1500;
    m.devices++;
    m.specialty = Math.min(10, m.specialty + 1);
  }
  beforeStep(dt: number) {
    if (this.disposed) return;
    const g = this.game,
      p = g.physics,
      r = region(stage(this.session.stage).region),
      now = g.time;
    p.engine.gravity.y = r.gravity;
    for (const d of this.devices) {
      const body = this.bodies.get(d.id);
      if (!body) continue;
      const near = p.balls.some(
        (b) =>
          Math.hypot(b.position.x - d.x, b.position.y - d.y) < d.radius + 25,
      );
      if (d.kind === "rotate" && !near)
        Matter.Body.setAngle(body, Math.sin(now / 2200) * 0.65);
      if (d.kind !== "rotate") body.isSensor = !this.active(d);
      if (d.kind === "gate")
        body.isSensor = !this.active(d) || now % 8000 < 4000;
    }
    if (!p.launched) return;
    for (const b of p.balls) {
      const state = g.magic?.balls?.state(b),
        c = element(state?.type ?? "steel");
      let friction = r.friction;
      for (const d of this.devices) {
        if (
          !this.active(d) ||
          Math.hypot(b.position.x - d.x, b.position.y - d.y) > d.radius
        )
          continue;
        if (d.kind === "sand" || d.kind === "snow") {
          friction *= 2;
          const scale = Math.exp(-dt * 0.8);
          Matter.Body.setVelocity(b, {
            x: b.velocity.x * scale,
            y: b.velocity.y * scale,
          });
          if (b.speed < 1) Matter.Body.setVelocity(b, { x: 1.5, y: 2 });
        }
        if (d.kind === "ice") friction *= 0.35;
        if (d.kind === "wind" || d.kind === "gravity") {
          const active = d.kind === "wind" || now % 10000 < 4500;
          if (active) {
            const force = b.mass * (d.kind === "wind" ? 0.00012 : 0.0004);
            Matter.Body.applyForce(b, b.position, {
              x: Math.cos(d.direction ?? 0) * force,
              y: Math.sin(d.direction ?? 0) * force,
            });
            this.countUse(d.id);
          }
        }
        if (d.kind === "heat" && now % 8000 >= 6000) {
          const key = `vent-${b.id}`;
          if (now >= (this.session.mission.deviceCooldowns[key] ?? 0)) {
            this.session.mission.deviceCooldowns[key] = now + 2000;
            Matter.Body.setVelocity(b, {
              x: b.velocity.x + Math.cos(d.direction!) * 2.5,
              y: b.velocity.y + Math.sin(d.direction!) * 2.5,
            });
            this.countUse(d.id);
          }
        }
        if (
          d.kind === "portal" &&
          now >= (this.session.mission.deviceCooldowns[`portal-${b.id}`] ?? 0)
        ) {
          const exit = d.to!,
            dest = { x: exit.x, y: exit.y + 38 };
          const probe = Matter.Bodies.circle(
            dest.x,
            dest.y,
            PHYSICS.ballRadius + 4,
          );
          const obstacles = Matter.Composite.allBodies(p.engine.world).filter(
            (other) => other !== b && !other.isSensor,
          );
          if (!Matter.Query.collides(probe, obstacles).length) {
            Matter.Body.setPosition(b, dest);
            Matter.Body.setVelocity(b, {
              x: Math.max(-8, Math.min(8, b.velocity.x)),
              y: Math.max(3, Math.min(12, Math.abs(b.velocity.y))),
            });
            this.session.mission.deviceCooldowns[`portal-${b.id}`] = now + 2000;
            this.countUse(d.id);
            g.recovery.reset();
          }
        }
      }
      b.frictionAir =
        PHYSICS.airFriction *
        c.friction *
        Math.max(0.15, Math.min(3, friction));
      p.limitSpeed(b);
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const p = this.game.physics;
    for (const d of this.devices) {
      if (d.kind === "rotate") {
        const b = this.bodies.get(d.id);
        if (b) Matter.Composite.remove(p.engine.world, b);
      } else if (this.bodies.has(d.id)) p.removeTarget(d.id);
    }
    this.bodies.clear();
    p.engine.gravity.y = 1;
  }
}
