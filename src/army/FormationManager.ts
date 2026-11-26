import type { Formation, UnitEntity } from "./types";
const priority: Record<Formation, string[]> = {
  standard: [
    "guard",
    "swordsman",
    "spearman",
    "knight",
    "archer",
    "mage",
    "healer",
    "catapult",
  ],
  shield: [
    "guard",
    "spearman",
    "swordsman",
    "knight",
    "archer",
    "mage",
    "healer",
    "catapult",
  ],
  spear: [
    "spearman",
    "guard",
    "swordsman",
    "knight",
    "archer",
    "mage",
    "healer",
    "catapult",
  ],
  assault: [
    "knight",
    "swordsman",
    "guard",
    "spearman",
    "mage",
    "archer",
    "healer",
    "catapult",
  ],
  ranged: [
    "guard",
    "spearman",
    "archer",
    "mage",
    "swordsman",
    "healer",
    "knight",
    "catapult",
  ],
  siege: [
    "guard",
    "spearman",
    "swordsman",
    "knight",
    "archer",
    "mage",
    "healer",
    "catapult",
  ],
};
export function formationPosition(
  unit: UnitEntity,
  units: UnitEntity[],
  formation: Formation,
): { x: number; y: number } {
  const list = units
    .filter((u) => u.hp > 0 && u.side === unit.side)
    .slice()
    .sort(
      (a, b) =>
        priority[formation].indexOf(a.kind) -
          priority[formation].indexOf(b.kind) || a.id.localeCompare(b.id),
    );
  const i = Math.max(
      0,
      list.findIndex((u) => u.id === unit.id),
    ),
    row = Math.floor(i / 8),
    column = i % 8;
  return {
    x: 215 + column * 22,
    y:
      unit.side === "ally"
        ? Math.min(730, 620 + row * 15)
        : Math.max(100, 180 - row * 15),
  };
}

export function formationPositions(units: UnitEntity[], formation: Formation) {
  const result = new Map<string, { x: number; y: number }>();
  for (const side of ["ally", "enemy"] as const) {
    const order = priority[side === "ally" ? formation : "standard"];
    const sorted = units
      .filter((u) => u.hp > 0 && u.side === side)
      .sort(
        (a, b) =>
          order.indexOf(a.kind) - order.indexOf(b.kind) ||
          a.id.localeCompare(b.id),
      );
    sorted.forEach((u, i) =>
      result.set(u.id, {
        x: 215 + (i % 8) * 22,
        y:
          side === "ally"
            ? Math.min(730, 620 + Math.floor(i / 8) * 15)
            : Math.max(100, 180 - Math.floor(i / 8) * 15),
      }),
    );
  }
  return result;
}
