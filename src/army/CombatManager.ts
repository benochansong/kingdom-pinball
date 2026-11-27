import { unitConfig } from "../config/army";
import type { ArmyData, UnitEntity, Projectile } from "./types";
import { attackPower, damageAmount, maxHp, awardXp } from "./DamageCalculator";
import { SpatialGrid } from "./SpatialGrid";
import { formationPositions } from "./FormationManager";
import { PathfindingSystem } from "./PathfindingSystem";
export interface CombatEffect {
  x: number;
  y: number;
  type:
    | "hit"
    | "heal"
    | "death"
    | "spawn"
    | "counter"
    | "arrow"
    | "magic"
    | "charge"
    | "tower";
  text: string;
  ttl: number;
  side: "ally" | "enemy";
}
export class CombatManager {
  opponentData?: ArmyData;
  enabled: () => boolean = () => true;
  controlUnit?: (
    u: UnitEntity,
    dt: number,
    now: number,
    all: UnitEntity[],
  ) => boolean;
  onDamage?: (target: UnitEntity, amount: number, sphere: boolean) => void;
  onProjectileImpact?: (projectile: Projectile) => boolean;
  movementFactor: (u: UnitEntity) => number = () => 1;
  intervalFactor: (u: UnitEntity) => number = () => 1;
  damageFilter: (
    u: UnitEntity,
    amount: number,
    source?: UnitEntity,
    sphere?: boolean,
  ) => number = (_u, amount) => amount;
  sphereFactor: (u: UnitEntity) => number = () => 1;
  onSphereContact?: (u: UnitEntity, actual: number) => void;
  private armyFor(u: UnitEntity) {
    return u.side === "enemy" && this.opponentData
      ? this.opponentData
      : this.data;
  }
  effects: CombatEffect[] = [];
  private projectilePool: Projectile[] = [];
  private frame = 0;
  private towerAt = new Map<string, number>();
  dirty = false;
  private grid = new SpatialGrid();
  onSound: (kind: string) => void = () => {};
  constructor(
    readonly data: ArmyData,
    readonly navigation: PathfindingSystem,
  ) {}
  get units() {
    return [...this.data.units, ...(this.data.battle?.enemies ?? [])];
  }
  effect(effect: Omit<CombatEffect, "ttl">) {
    if (this.effects.length >= 48) this.effects.shift();
    this.effects.push({ ...effect, ttl: 0.65 });
    this.onSound(effect.type);
  }
  private contribution(u: UnitEntity, damage = 0, healing = 0, xp = 0) {
    const b = this.data.battle;
    if (!b || u.side !== "ally") return;
    const s = (b.contributions[u.id] ??= { damage: 0, healing: 0, xp: 0 });
    s.damage += damage;
    s.healing += healing;
    u.damage += damage;
    u.healing += healing;
    if (b.mode === "challenge" && b.rewardEligible && s.xp < 100) {
      const gain = Math.min(xp, 100 - s.xp);
      s.xp += gain;
      b.xp += gain;
      awardXp(u, gain);
    }
  }
  hurt(
    target: UnitEntity,
    amount: number,
    source?: UnitEntity,
    sphere = false,
  ) {
    if (target.hp <= 0 || !this.enabled()) return;
    const actual = Math.min(
      target.hp,
      Math.max(0, this.damageFilter(target, amount, source, sphere)),
    );
    target.hp -= actual;
    this.onDamage?.(target, actual, sphere);
    this.dirty = true;
    this.effect({
      x: target.x,
      y: target.y,
      type: "hit",
      text: `−${Math.round(actual)}`,
      side: target.side,
    });
    if (source) this.contribution(source, actual, 0, actual * 0.08);
    if (sphere && this.data.battle) this.data.battle.sphereDamage += actual;
    if (target.hp <= 0) {
      target.state = "dead";
      target.target = undefined;
      if (source) {
        source.kills++;
        this.contribution(source, 0, 0, 5);
      }
      if (target.side === "enemy") {
        this.data.morale = Math.min(100, this.data.morale + 2);
        if (this.opponentData) {
          this.opponentData.morale = Math.max(0, this.opponentData.morale - 5);
          this.opponentData.stats.losses++;
        }
        if (sphere) this.data.stats.sphereKills++;
      } else {
        if (this.opponentData)
          this.opponentData.morale = Math.min(
            100,
            this.opponentData.morale + 2,
          );
        this.data.morale = Math.max(0, this.data.morale - 5);
        this.data.stats.losses++;
      }
      this.effect({
        x: target.x,
        y: target.y,
        type: "death",
        text: "✦",
        side: target.side,
      });
    } else if (target.side === "ally" && actual > maxHp(target) * 0.3)
      this.data.morale = Math.max(0, this.data.morale - 1);
  }
  private heal(source: UnitEntity, target: UnitEntity, amount: number) {
    if (target.hp <= 0) return;
    const actual = Math.min(maxHp(target) - target.hp, amount);
    if (actual <= 0) return;
    target.hp += actual;
    this.dirty = true;
    this.contribution(source, 0, actual, actual * 0.04);
    this.effect({
      x: target.x,
      y: target.y,
      type: "heal",
      text: `+${Math.round(actual)}`,
      side: target.side,
    });
  }
  private search(u: UnitEntity, all: UnitEntity[], now: number) {
    const c = unitConfig(u.kind);
    const nearby = this.grid.near(u.x, u.y, c.detect);
    const base = nearby.some((t) => t.hp > 0 && t.side !== u.side)
      ? nearby
      : all;
    let candidates = base.filter(
      (t) =>
        t.hp > 0 &&
        t.id !== u.id &&
        (c.heal ? t.side === u.side && t.hp < maxHp(t) : t.side !== u.side),
    );
    if (u.side === "ally" && this.data.command === "hold")
      candidates = candidates.filter(
        (t) => Math.hypot(t.x - u.x, t.y - u.y) <= c.range,
      );
    if (u.side === "ally" && this.data.command === "defend")
      candidates = candidates.filter(
        (t) => Math.hypot(t.x - u.holdX, t.y - u.holdY) < 220,
      );
    const score = (t: UnitEntity) => {
      let v = Math.hypot(t.x - u.x, t.y - u.y);
      if (c.heal) v += (t.hp / maxHp(t)) * 180;
      if (u.kind === "knight" && ["archer", "mage"].includes(t.kind)) v -= 60;
      if (u.kind === "spearman" && t.kind === "knight") v -= 45;
      if (u.kind === "archer") v += t.hp * 0.15;
      if (t.kind === "guard" && !["mage", "healer"].includes(u.kind)) v -= 30;
      return v;
    };
    candidates.sort((a, b) => score(a) - score(b));
    const target = candidates.find((t) => {
      if (
        Math.hypot(t.x - u.x, t.y - u.y) > c.detect &&
        !(u.side === "ally" && this.data.command === "attack") &&
        u.side !== "enemy"
      )
        return false;
      return (
        this.navigation.clearLine(u, t) || this.navigation.path(u, t).length > 0
      );
    });
    u.target = target?.id;
    u.pathAt = Math.min(u.pathAt, now);
  }
  move(u: UnitEntity, goal: { x: number; y: number }, dt: number, now: number) {
    if (Math.hypot(goal.x - u.x, goal.y - u.y) < 6) {
      u.state = "idle";
      return;
    }
    if (now >= u.pathAt || !u.path.length) {
      u.path = this.navigation.path(u, goal);
      u.pathAt = now + 650 + (Number(u.id.replace(/\D/g, "")) % 5) * 60;
      if (u.path.length && Math.hypot(u.path[0].x - u.x, u.path[0].y - u.y) < 8)
        u.path.shift();
    }
    const next = u.path[0];
    if (!next) {
      u.state = "idle";
      return;
    }
    const dx = next.x - u.x,
      dy = next.y - u.y,
      d = Math.hypot(dx, dy);
    let speed = unitConfig(u.kind).speed;
    if (u.side === "ally") {
      speed *=
        this.data.morale >= 80
          ? 1.05
          : this.data.morale < 20
            ? 0.75
            : this.data.morale < 40
              ? 0.85
              : 1;
      if (["regroup", "retreat"].includes(this.data.command))
        speed *= 1 + (this.data.research.tactics ?? 0) * 0.1;
    }
    const step = Math.min(d, speed * dt * this.movementFactor(u));
    let x = u.x + (dx / Math.max(d, 0.001)) * step,
      y = u.y + (dy / Math.max(d, 0.001)) * step;
    for (const other of this.grid.near(u.x, u.y, 16)) {
      if (
        other.id === u.id ||
        other.hp <= 0 ||
        Math.abs(other.x - u.x) > 13 ||
        Math.abs(other.y - u.y) > 13
      )
        continue;
      const sx = x - other.x,
        sy = y - other.y,
        l = Math.hypot(sx, sy);
      if (l > 0 && l < 11) {
        x += (sx / l) * 0.6;
        y += (sy / l) * 0.6;
      }
    }
    if (this.navigation.clearLine(u, { x, y })) {
      u.x = x;
      u.y = y;
      u.facing = Math.atan2(dy, dx);
      u.state =
        u.side === "ally" && this.data.command === "retreat"
          ? "retreating"
          : "moving";
    } else {
      u.pathAt = 0;
      u.state = "idle";
    }
    if (d < step + 2) u.path.shift();
  }
  private fire(source: UnitEntity, target: UnitEntity, now: number) {
    const c = unitConfig(source.kind);
    source.cooldown = now + c.interval * 1000 * this.intervalFactor(source);
    source.state = c.heal ? "healing" : "attacking";
    let raw = attackPower(source, this.armyFor(source), now);
    if (source.kind === "knight" && source.charge) {
      raw +=
        c.charge *
        ((source.side === "ally" || !!this.opponentData) &&
        this.armyFor(source).buffs.cavalry > now
          ? 1.5
          : 1);
      source.charge = false;
      this.effect({
        x: source.x,
        y: source.y,
        type: "charge",
        text: "CHARGE",
        side: source.side,
      });
    }
    if (
      source.kind === "mage" &&
      source.nextBoost > 0 &&
      this.armyFor(source).buffs.arcane > now
    ) {
      raw *= 1.3;
      source.nextBoost = 0;
    }
    const critical =
      (this.frame + source.id.charCodeAt(source.id.length - 1) * 17) % 100 <
      c.crit * 100;
    if (critical) raw *= 1.5;
    if (c.range > 70 || c.heal) {
      const b = this.data.battle;
      if (!b || b.projectiles.length >= 160) return;
      const p = this.projectilePool.pop() ?? ({} as Projectile);
      Object.assign(p, {
        id: b.nextProjectile++,
        from: source.id,
        target: target.id,
        side: source.side,
        kind: source.kind,
        x: source.x,
        y: source.y,
        startX: source.x,
        startY: source.y,
        tx: target.x,
        ty: target.y,
        age: 0,
        duration: Math.max(
          0.12,
          Math.hypot(target.x - source.x, target.y - source.y) /
            (source.kind === "catapult" ? 220 : 500),
        ),
        damage: c.heal
          ? c.heal *
            (1 +
              (source.side === "ally" || !!this.opponentData
                ? (this.armyFor(source).research.healing ?? 0) * 0.15
                : 0))
          : raw,
        splash:
          c.splash *
          ((source.side === "ally" || !!this.opponentData) &&
          source.kind === "mage"
            ? 1 + (this.armyFor(source).research.magic ?? 0) * 0.1
            : 1),
        heal: !!c.heal,
      });
      b.projectiles.push(p);
      this.onSound(source.kind);
    } else
      this.hurt(
        target,
        damageAmount(source, target, this.armyFor(target), now, raw),
        source,
      );
  }
  update(dt: number, now: number) {
    if (!this.enabled()) return;
    this.frame++;
    this.effects = this.effects.filter((e) => (e.ttl -= dt) > 0);
    const all = this.units.filter((u) => u.hp > 0),
      battle = this.data.battle;
    this.grid.rebuild(all);
    const positions = formationPositions(all, this.data.formation);
    const map = new Map(all.map((u) => [u.id, u]));
    for (let i = 0; i < all.length; i++) {
      const u = all[i],
        c = unitConfig(u.kind);
      if (u.hp <= 0) continue;
      // Construction can cover a standing soldier; recover to navigable ground.
      if (!this.navigation.free(u)) {
        const safe = this.navigation.closest(u);
        if (safe) {
          u.x = safe.x;
          u.y = safe.y;
          u.path = [];
          u.pathAt = 0;
        }
      }
      if (u.stun > now) {
        u.state = "stunned";
        continue;
      }
      if (this.controlUnit?.(u, dt, now, all)) continue;
      if (u.side === "ally" && !battle && this.data.command === "hold") {
        u.state = "idle";
        continue;
      }
      if (
        u.side === "ally" &&
        (!battle || ["retreat", "regroup"].includes(this.data.command))
      ) {
        u.target = undefined;
        this.move(u, positions.get(u.id)!, dt, now);
        continue;
      }
      if (u.side === "enemy" && u.hp < maxHp(u) * 0.18 && u.kind !== "guard") {
        this.move(u, { x: u.x < 290 ? 150 : 430, y: 110 }, dt, now);
        if (Math.abs(u.y - 110) > 20) continue;
      }
      if (i % 4 === this.frame % 4 || !map.has(u.target ?? ""))
        this.search(u, all, now);
      const target = map.get(u.target ?? "");
      if (!target || target.hp <= 0) {
        if (u.side === "ally" && this.data.command === "hold") u.state = "idle";
        else this.move(u, positions.get(u.id)!, dt, now);
        continue;
      }
      const range =
          c.range *
          (u.side === "ally" && this.data.formation === "ranged" && c.range > 70
            ? 1.1
            : 1),
        distance = Math.hypot(target.x - u.x, target.y - u.y);
      if (distance <= range && this.navigation.clearLine(u, target)) {
        u.facing = Math.atan2(target.y - u.y, target.x - u.x);
        if (u.windup > 0) {
          if (now >= u.windup) {
            u.windup = 0;
            this.fire(u, target, now);
          }
        } else if (now >= u.cooldown) {
          u.windup = now + 180;
          u.state = "windup";
        } else u.state = "idle";
      } else {
        u.windup = 0;
        if (u.side === "ally" && this.data.command === "hold") {
          u.state = "idle";
          continue;
        }
        if (
          u.side === "ally" &&
          this.data.command === "defend" &&
          Math.hypot(u.x - u.holdX, u.y - u.holdY) > 160
        )
          this.move(u, { x: u.holdX, y: u.holdY }, dt, now);
        else this.move(u, target, dt, now);
      }
    }
    if (battle) {
      for (const p of battle.projectiles) {
        p.age += dt;
        const t = Math.min(1, p.age / p.duration);
        p.x = p.startX + (p.tx - p.startX) * t;
        p.y = p.startY + (p.ty - p.startY) * t;
        if (t < 1) continue;
        if (this.onProjectileImpact?.(p)) continue;
        const source = map.get(p.from),
          target = map.get(p.target);
        if (p.heal) {
          if (
            source &&
            target &&
            Math.hypot(target.x - p.tx, target.y - p.ty) < 35
          )
            this.heal(source, target, p.damage);
        } else {
          const victims = p.splash
            ? all.filter(
                (u) =>
                  u.side !== p.side &&
                  Math.hypot(u.x - p.tx, u.y - p.ty) <= p.splash,
              )
            : target && Math.hypot(target.x - p.tx, target.y - p.ty) < 28
              ? [target]
              : [];
          for (const v of victims) {
            if (source)
              this.hurt(
                v,
                damageAmount(
                  source,
                  v,
                  this.armyFor(v),
                  now,
                  p.damage,
                  p.kind === "archer",
                ),
                source,
              );
            else if (p.kind === "tower")
              this.hurt(
                v,
                Math.max(
                  1,
                  (p.damage * 100) / (100 + unitConfig(v.kind).armor * 3),
                ),
              );
          }
        }
      }
      const finished = battle.projectiles.filter((p) => p.age >= p.duration);
      for (const p of finished)
        if (this.projectilePool.length < 160) this.projectilePool.push(p);
      battle.projectiles = battle.projectiles.filter((p) => p.age < p.duration);
    }
  }
  sphere(
    from: { x: number; y: number },
    to: { x: number; y: number },
    speed: number,
    now: number,
    valid: boolean,
  ) {
    if (!valid || !this.enabled() || !this.data.battle || speed < 40) return;
    const dx = to.x - from.x,
      dy = to.y - from.y,
      l2 = dx * dx + dy * dy;
    if (l2 < 0.001) return;
    let hits = 0;
    const minX = Math.min(from.x, to.x) - 18,
      maxX = Math.max(from.x, to.x) + 18;
    const minY = Math.min(from.y, to.y) - 18,
      maxY = Math.max(from.y, to.y) + 18;
    for (const enemy of this.data.battle.enemies) {
      if (enemy.hp <= 0 || now - enemy.lastSphere < 550) continue;
      // Exact broad phase; preserve enemy order and the two-hit cap.
      if (enemy.x < minX || enemy.x > maxX || enemy.y < minY || enemy.y > maxY)
        continue;
      const t = Math.max(
        0,
        Math.min(1, ((enemy.x - from.x) * dx + (enemy.y - from.y) * dy) / l2),
      );
      const x = from.x + dx * t,
        y = from.y + dy * t;
      if (Math.hypot(enemy.x - x, enemy.y - y) > 18) continue;
      const nx = enemy.x - from.x,
        ny = enemy.y - from.y;
      if (dx * nx + dy * ny <= 0) continue;
      enemy.lastSphere = now;
      const amount =
        speed < 180
          ? 5
          : speed < 420
            ? 15
            : speed < 700
              ? 25
              : speed < 1000
                ? 40
                : 60;
      const before = enemy.hp;
      this.hurt(enemy, amount * this.sphereFactor(enemy), undefined, true);
      this.onSphereContact?.(enemy, before - enemy.hp);
      if (speed >= 700) enemy.stun = now + 300;
      const length = Math.sqrt(l2),
        p = { x: enemy.x + (dx / length) * 5, y: enemy.y + (dy / length) * 5 };
      if (this.navigation.clearLine(enemy, p)) {
        enemy.x = p.x;
        enemy.y = p.y;
      }
      if (++hits >= 2) break;
    }
  }
  tower(
    id: string,
    x: number,
    y: number,
    level: number,
    now: number,
    boost = false,
  ) {
    const b = this.data.battle;
    if (!b || now < (this.towerAt.get(id) ?? 0)) return;
    const target = b.enemies
      .filter(
        (u) =>
          u.hp > 0 &&
          Math.hypot(u.x - x, u.y - y) < 145 + level * 8 &&
          this.navigation.clearLine({ x, y }, u),
      )
      .sort((a, b) => a.hp - b.hp)[0];
    if (!target) return;
    this.towerAt.set(id, now + 1400);
    if (b.projectiles.length >= 160) return;
    b.projectiles.push({
      id: b.nextProjectile++,
      from: id,
      target: target.id,
      side: "ally",
      kind: "tower",
      x,
      y,
      startX: x,
      startY: y,
      tx: target.x,
      ty: target.y,
      age: 0,
      duration: 0.35,
      damage: (12 + level * 4) * (boost ? 1.35 : 1),
      splash: 0,
      heal: false,
    });
    this.effect({ x, y, type: "tower", text: "➶", side: "ally" });
  }
}
