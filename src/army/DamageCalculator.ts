import { unitConfig } from "../config/army";
import type { ArmyData, UnitEntity, UnitKind } from "./types";
export const rankForXp = (xp: number) =>
  xp >= 500 ? 5 : xp >= 250 ? 4 : xp >= 100 ? 3 : xp >= 35 ? 2 : 1;
export const maxHp = (u: UnitEntity) =>
  unitConfig(u.kind).hp *
  (u.rank >= 3 ? 1 + [0, 0, 0, 0.1, 0.15, 0.2][u.rank] : 1);
export function counter(attacker: UnitKind, defender: UnitKind): number {
  return (
    (
      {
        swordsman: { spearman: 1.25 },
        spearman: { knight: 1.75 },
        archer: { spearman: 1.3 },
        knight: { archer: 1.5, mage: 1.4 },
        mage: { guard: 1.3 },
      } as Partial<Record<UnitKind, Partial<Record<UnitKind, number>>>>
    )[attacker]?.[defender] ?? 1
  );
}
export function attackPower(u: UnitEntity, a: ArmyData, now: number): number {
  const c = unitConfig(u.kind);
  let p = c.attack * (1 + (u.rank - 1) * 0.05);
  if (u.side === "ally" || a.ownedSide === u.side) {
    p *=
      1 + (a.research.weapons ?? 0) * 0.08 + (a.research.tactics ?? 0) * 0.03;
    if (c.id === "mage") p *= 1 + (a.research.magic ?? 0) * 0.1;
    p *=
      a.morale >= 80
        ? 1.06
        : a.morale >= 60
          ? 1
          : a.morale >= 40
            ? 0.94
            : a.morale >= 20
              ? 0.85
              : 0.7;
    const bonus =
      (a.buffs.iron > now ? 0.15 : 0) + (a.buffs.offensive > now ? 0.15 : 0);
    p *= 1 + Math.min(0.3, bonus);
    if(a.buffs.magicStorm>now)p*=1.1;
    if (a.formation === "assault") p *= 1.1;
    if (a.formation === "siege" && u.kind === "catapult") p *= 1.1;
  }
  return p;
}
export function damageAmount(
  attacker: UnitEntity,
  defender: UnitEntity,
  a: ArmyData,
  now: number,
  raw: number,
  normalRanged = false,
): number {
  let damage = raw * counter(attacker.kind, defender.kind),
    armor =
      unitConfig(defender.kind).armor +
      (defender.side === "ally" || a.ownedSide === defender.side
        ? (a.research.armor ?? 0) * 3
        : 0);
  damage *= 100 / (100 + armor * 3);
  if (defender.kind === "guard" && normalRanged) damage *= 0.65;
  if (defender.side === "ally" || a.ownedSide === defender.side) {
    if (a.buffs.shield > now) damage *= 0.8;
    if (a.formation === "shield") damage *= 0.9;
    if (a.formation === "spear" && attacker.kind === "knight") damage *= 0.85;
    if (a.formation === "assault") damage *= 1.1;
  }
  return Math.max(1, Math.round(damage));
}
export function awardXp(u: UnitEntity, xp: number) {
  const before = maxHp(u);
  u.xp = Math.min(10000, u.xp + Math.max(0, xp));
  u.rank = rankForXp(u.xp);
  u.hp = Math.min(maxHp(u), u.hp * (maxHp(u) / before));
}
