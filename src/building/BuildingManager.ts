import { BUILD_LIMITS, TERRITORIES, buildingConfig } from "../config/buildings";
import {
  FACILITIES,
  ECONOMY_TARGETS,
  RESOURCE_IDS,
  type Cost,
  type ResourceId,
} from "../config/economy";
import type { EconomyManager } from "../economy/EconomyManager";
import type { EconomyData } from "../economy/types";
import {
  freshBuildings,
  freshProduction,
  type BlueprintItem,
  type BuildingEntity,
} from "./types";
import {
  pathSafety,
  validatePlacement,
  type Point,
} from "./PlacementValidator";
import { probeLayout } from "./PhysicsSafetyProbe";
export const scaleCost = (c: Cost, s: number): Cost =>
  Object.fromEntries(Object.entries(c).map(([r, n]) => [r, Math.ceil(n * s)]));
export const addCost = (a: Cost, b: Cost): Cost =>
  Object.fromEntries(RESOURCE_IDS.map((r) => [r, (a[r] ?? 0) + (b[r] ?? 0)]));
export class BuildingManager {
  placementRule?: (item: BlueprintItem, ignore?: string) => string | null;
  active = false;
  private undoState?: EconomyData;
  ball?: Point;
  onChange: () => void = () => {};
  constructor(readonly economy: EconomyManager) {
    economy.data.building ??= freshBuildings();
  }
  get data() {
    return this.economy.data.building!;
  }
  get buildings() {
    return this.data.buildings;
  }
  get limit() {
    return BUILD_LIMITS[this.economy.data.rank - 1];
  }
  enter(ball?: Point) {
    this.active = true;
    this.ball = ball;
    this.undoState = undefined;
    this.data.tutorial = Math.max(1, this.data.tutorial);
  }
  leave(): string | null {
    const error = pathSafety(this.buildings) ?? probeLayout(this.buildings);
    if (error) return error;
    this.active = false;
    this.undoState = undefined;
    this.economy.checkpoint();
    return null;
  }
  cost(type: string, all = this.buildings): Cost {
    const c = buildingConfig(type)!;
    return scaleCost(
      c.cost,
      1 + 0.25 * all.filter((b) => b.type === type).length,
    );
  }
  upgradeCost(b: BuildingEntity): Cost {
    return scaleCost(buildingConfig(b.type)!.cost, 0.6 * b.level);
  }
  preview(item: BlueprintItem, ignore?: string): string | null {
    const custom = this.placementRule?.(item, ignore);
    if (custom) return custom;
    const c = buildingConfig(item.type);
    if (!c) return "존재하지 않는 건물입니다.";
    if (this.economy.data.rank < c.rank)
      return `왕국 발전 등급 ${c.rank}에서 해금됩니다.`;
    if (!ignore && this.buildings.length >= this.limit)
      return `추가 건물 최대 ${this.limit}개입니다.`;
    if (
      !ignore &&
      this.buildings.filter((b) => b.type === item.type).length >= c.limit
    )
      return "해당 건물의 건설 수 제한입니다.";
    const err = validatePlacement(
      item,
      this.buildings.filter((b) => b.id !== ignore),
      this.data.territories,
      this.ball,
    );
    if (err) return err;
    const cost = ignore ? scaleCost(c.cost, 0.1) : this.cost(item.type);
    if (!this.economy.resources.canAfford(cost))
      return "필요한 자원이 부족합니다.";
    return null;
  }
  private snapshot() {
    this.undoState = structuredClone(this.economy.data);
  }
  private changed() {
    this.onChange();
    this.economy.checkpoint();
  }
  build(item: BlueprintItem): string | null {
    if (!this.active) return "건설 모드에서만 가능합니다.";
    const error = this.preview(item);
    if (error) return error;
    const cost = this.cost(item.type);
    const candidate: BuildingEntity = {
      ...item,
      level: 1,
      id: `building-${this.data.nextId}`,
      paid: cost,
      production: freshProduction(),
      charge: 0,
      lastHit: -10000,
      readyAt: 0,
    };
    const physicsError = probeLayout([...this.buildings, candidate]);
    if (physicsError) return physicsError;
    this.snapshot();
    if (!this.economy.resources.transact(cost)) return "자원이 부족합니다.";
    this.buildings.push({
      ...item,
      level: 1,
      id: `building-${this.data.nextId++}`,
      paid: cost,
      production: freshProduction(),
      charge: 0,
      lastHit: -10000,
      readyAt: 0,
    });
    this.data.stats.built++;
    if (item.angle) this.data.stats.rotated++;
    this.data.tutorial = Math.max(4, this.data.tutorial);
    this.changed();
    return null;
  }
  move(id: string, item: BlueprintItem): string | null {
    const b = this.buildings.find((b) => b.id === id);
    if (!this.active || !b) return "건물을 선택하세요.";
    if (b.x === item.x && b.y === item.y && b.angle === item.angle)
      return "위치와 방향이 같습니다.";
    const error = this.preview({ ...item, type: b.type }, id);
    if (error) return error;
    const physicsError = probeLayout(
      this.buildings.map((x) =>
        x.id === id ? { ...x, x: item.x, y: item.y, angle: item.angle } : x,
      ),
    );
    if (physicsError) return physicsError;
    this.snapshot();
    if (
      !this.economy.resources.transact(
        scaleCost(buildingConfig(b.type)!.cost, 0.1),
      )
    )
      return "자원이 부족합니다.";
    if (b.angle !== item.angle) this.data.stats.rotated++;
    b.x = item.x;
    b.y = item.y;
    b.angle = item.angle;
    this.data.stats.moved++;
    this.changed();
    return null;
  }
  upgrade(id: string, expected: number): string | null {
    const b = this.buildings.find((b) => b.id === id);
    if (!this.active || !b || b.level !== expected || b.level >= 5)
      return "강화할 수 없습니다.";
    const cost = this.upgradeCost(b);
    if (!this.economy.resources.canAfford(cost))
      return "강화 자원이 부족합니다.";
    this.snapshot();
    this.economy.resources.transact(cost);
    b.paid = addCost(b.paid, cost);
    b.level++;
    b.production.level = b.level;
    this.data.stats.upgrades++;
    this.changed();
    return null;
  }
  refund(b: BuildingEntity): Cost {
    return Object.fromEntries(
      Object.entries(b.paid).map(([r, n]) => [r, Math.floor(n * 0.5)]),
    );
  }
  demolish(id: string): string | null {
    const b = this.buildings.find((b) => b.id === id);
    if (!this.active || !b) return "철거할 수 없습니다.";
    this.snapshot();
    this.data.buildings = this.buildings.filter((x) => x.id !== id);
    this.economy.resources.reward(this.refund(b));
    this.clampStorage();
    this.data.stats.demolished++;
    this.changed();
    return null;
  }
  private clampStorage() {
    for (const r of RESOURCE_IDS) {
      const excess = Math.max(
        0,
        this.economy.data.resources[r] - this.economy.resources.capacity(r),
      );
      this.economy.data.resources[r] -= excess;
      this.economy.data.overflow[r] += excess;
    }
  }
  undo(): boolean {
    if (!this.active || !this.undoState) return false;
    Object.assign(this.economy.data, this.undoState);
    this.undoState = undefined;
    this.changed();
    return true;
  }
  expand(id: string): string | null {
    const t = TERRITORIES.find((t) => t.id === id);
    if (!this.active || !t || this.data.territories.includes(id))
      return "이미 열린 영토입니다.";
    if (
      this.economy.data.rank < t.rank ||
      this.economy.resources.totalProduction < t.production ||
      !this.buildings.length
    )
      return `등급 ${t.rank}, 누적 생산 ${t.production}, 건물 1개가 필요합니다.`;
    if (!this.economy.resources.canAfford(t.cost))
      return "영토 확장 자원이 부족합니다.";
    this.snapshot();
    this.economy.resources.transact(t.cost);
    this.data.territories.push(id);
    this.changed();
    return null;
  }
  savePreset(name: string, index: number): boolean {
    if (!this.active || index < 0 || index > 2) return false;
    this.data.presets[index] = {
      name: name.trim().slice(0, 32) || `설계 ${index + 1}`,
      items: this.buildings.map(({ type, x, y, angle, level }) => ({
        type,
        x,
        y,
        angle,
        level,
      })),
    };
    this.economy.checkpoint();
    return true;
  }
  /** Quote on a clone; applying the complete validated transaction cannot partially spend. Extra buildings are retained. */
  quote(items: BlueprintItem[]): {
    error: string | null;
    cost: Cost;
    next: BuildingEntity[];
  } {
    const next = structuredClone(this.buildings),
      used = new Set<string>();
    let cost: Cost = {},
      nextId = this.data.nextId;
    for (const item of items) {
      const c = buildingConfig(item.type);
      if (!c || this.economy.data.rank < c.rank)
        return { error: "설계에 잠긴 건물이 있습니다.", cost, next };
      let b = next.find((b) => b.type === item.type && !used.has(b.id));
      if (b) {
        used.add(b.id);
        if (b.x !== item.x || b.y !== item.y || b.angle !== item.angle)
          cost = addCost(cost, scaleCost(c.cost, 0.1));
        Object.assign(b, { x: item.x, y: item.y, angle: item.angle });
      } else {
        const paid = this.cost(item.type, next);
        cost = addCost(cost, paid);
        b = {
          ...item,
          level: 1,
          id: `building-${nextId++}`,
          paid,
          production: freshProduction(),
          charge: 0,
          lastHit: -10000,
          readyAt: 0,
        };
        next.push(b);
        used.add(b.id);
      }
      while (b.level < Math.min(5, item.level)) {
        const paid = this.upgradeCost(b);
        cost = addCost(cost, paid);
        b.paid = addCost(b.paid, paid);
        b.level++;
        b.production.level = b.level;
      }
    }
    let error = next.length > this.limit ? "건물 수 제한을 초과합니다." : null;
    for (const b of next) {
      error ??= this.placementRule?.(b,b.id) ?? null;
      if (
        next.filter((x) => x.type === b.type).length >
        buildingConfig(b.type)!.limit
      )
        error = "종류별 건설 제한을 초과합니다.";
      error ??= validatePlacement(
        b,
        next.filter((x) => x.id !== b.id),
        this.data.territories,
        this.ball,
        false,
      );
    }
    error ??= pathSafety(next);
    if (!this.economy.resources.canAfford(cost))
      error ??= "설계 적용 자원이 부족합니다.";
    return { error, cost, next };
  }
  applyPreset(items: BlueprintItem[]): string | null {
    if (!this.active) return "건설 모드에서만 가능합니다.";
    const q = this.quote(items);
    if (q.error) return q.error;
    const physicsError = probeLayout(q.next);
    if (physicsError) return physicsError;
    this.snapshot();
    if (!this.economy.resources.transact(q.cost)) return "자원 부족";
    this.data.stats.built += q.next.length - this.buildings.length;
    this.data.buildings = q.next;
    this.data.nextId = Math.max(
      this.data.nextId,
      ...q.next.map((b) => Number(b.id.split("-")[1]) + 1),
    );
    this.changed();
    return null;
  }
  get style(): string {
    const counts = Object.fromEntries(
      ["economy", "operation", "physics", "magic", "military"].map((c) => [
        c,
        this.buildings.filter((b) => buildingConfig(b.type)!.category === c)
          .length,
      ]),
    );
    const max = Math.max(...Object.values(counts));
    if (max < 2 || max / Math.max(1, this.buildings.length) < 0.5)
      return "BALANCED KINGDOM";
    const category = Object.keys(counts).find((k) => counts[k] === max)!;
    return (
      ({
        economy: "ECONOMIC",
        operation: "ECONOMIC",
        physics: "COMBO",
        magic: "ARCANE",
        military: this.buildings.some((b) => b.type === "barracks")
          ? "MILITARY"
          : "FORTRESS",
      }[category] ?? "BALANCED") + " KINGDOM"
    );
  }
  get goals() {
    const s = this.data.stats,
      b = this.buildings;
    return [
      ["first", "첫 건물 건설", s.built >= 1],
      [
        "deflector",
        "목재 반사판 설치",
        b.some((x) => x.type === "woodDeflector"),
      ],
      ["rotate", "건물 회전", s.rotated > 0],
      [
        "produce",
        "생산시설 추가",
        b.some((x) => buildingConfig(x.type)?.production),
      ],
      ["test", "TEST BALL 사용", s.tests > 0],
      ["five", "건물 5개 운영", b.length >= 5],
      [
        "walls",
        "성벽 3개 운영",
        b.filter((x) => x.type === "wall").length >= 3,
      ],
      ["bumper", "강화 범퍼 설치", b.some((x) => x.type === "bumper")],
      [
        "synergy",
        "건물 조합 활성화",
        activeSynergies(this.economy.data).length > 0,
      ],
      ["territory", "영토 확장", this.data.territories.length > 1],
      ["ten", "건물 10개 운영", b.length >= 10],
      ["level5", "레벨 5 건물", b.some((x) => x.level === 5)],
      ["arcane", "마법탑 건설", b.some((x) => x.type === "arcane")],
      [
        "multi",
        "조합 2종 활성화",
        activeSynergies(this.economy.data).length >= 2,
      ],
      ["combo", "반사 장치 활용 15콤보", s.reflectorCombo >= 15],
      ["rank", "왕국 최고 등급", this.economy.data.rank === 5],
    ].map(([id, name, done]) => ({
      id: String(id),
      name: String(name),
      done: !!done,
    }));
  }
  claim(id: string): boolean {
    if (
      !this.active ||
      this.data.claimed.includes(id) ||
      !this.goals.find((g) => g.id === id)?.done
    )
      return false;
    this.snapshot();
    this.data.claimed.push(id);
    this.economy.resources.reward({ gold: 20, wood: 10 });
    this.changed();
    return true;
  }
}
export const SYNERGIES = [
  {
    id: "forest",
    name: "FOREST NETWORK",
    needs: ["lumber", "lumber", "woodDeflector"],
  },
  { id: "mining", name: "MINING COMPLEX", needs: ["quarry", "mine", "smith"] },
  {
    id: "trade",
    name: "ROYAL TRADE CENTER",
    needs: ["market", "warehouse", "treasury"],
  },
  { id: "arcane", name: "ARCANE NETWORK", needs: ["arcane", "tower", "altar"] },
  {
    id: "fortified",
    name: "FORTIFIED KINGDOM",
    needs: ["wall", "wall", "wall", "watchtower", "archerTower"],
  },
];
export function activeSynergies(d: EconomyData): string[] {
  const all = [
    ...(d.building?.buildings ?? []).map((b) => ({
      type: b.type,
      x: b.x,
      y: b.y,
    })),
    ...FACILITIES.map((f) => {
      const t = ECONOMY_TARGETS.find((t) => t.id === f.target)!;
      return { type: f.id, x: t.x, y: t.y };
    }),
  ];
  return SYNERGIES.filter((s) =>
    all.some((center) => {
      const nearby = all.filter(
        (b) => Math.hypot(b.x - center.x, b.y - center.y) <= 190,
      );
      const used = new Set<number>();
      return s.needs.every((type) => {
        const i = nearby.findIndex((b, i) => b.type === type && !used.has(i));
        if (i < 0) return false;
        used.add(i);
        return true;
      });
    }),
  ).map((s) => s.id);
}
export function buildingProductionBonus(
  d: EconomyData,
  resource: ResourceId,
): number {
  const s = activeSynergies(d);
  return resource === "wood" && s.includes("forest")
    ? 1.1
    : (resource === "stone" || resource === "gold") && s.includes("mining")
      ? 1.15
      : resource === "mana" && s.includes("arcane")
        ? 1.15
        : 1;
}
