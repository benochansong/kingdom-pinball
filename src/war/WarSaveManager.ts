import type { StorageLike } from "../systems/SaveManager";
import { sanitizeEconomy } from "../economy/EconomySaveManager";
import { freshBuildings, freshProduction } from "../building/types";
import { RESOURCE_IDS, type Cost } from "../config/economy";
import { buildingConfig } from "../config/buildings";
import {
  DEFAULT_WAR,
  DIFFICULTIES,
  ENEMIES,
  CASTLE_HP,
  BUILDING_HEALTH,
} from "../config/war";
import type {
  WarData,
  WarOptions,
  WarResult,
  Structure,
  WarStats,
} from "./types";
export const WAR_KEY = "kingdom-pinball:war:v1";
const RECORD_KEY = "kingdom-pinball:war-records:v1";
const obj = (x: unknown): Record<string, any> =>
  x && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, any>)
    : {};
const n = (x: unknown, f = 0, max = 1e9, min = 0) =>
  typeof x === "number" && Number.isFinite(x)
    ? Math.max(min, Math.min(max, x))
    : f;
const text = (x: unknown, f = "") =>
  typeof x === "string" ? x.replace(/[<>]/g, "").slice(0, 120) : f;
const cost = (x: unknown): Cost =>
  Object.fromEntries(RESOURCE_IDS.map((k) => [k, n(obj(x)[k], 0, 1e9)]));
export const freshStats = (): WarStats => ({
  destroyed: 0,
  walls: 0,
  lostBuildings: 0,
  sphereBuildings: 0,
  sphereUnits: 0,
  combos: 0,
  repairs: {},
  built: 0,
  upgrades: 0,
  kills: 0,
  defended: 0,
  minCastle: 1,
  maxPower: 0,
});
export function warOptions(raw: Partial<WarOptions>): WarOptions {
  const r = obj(raw),
    difficulty = Object.hasOwn(DIFFICULTIES, r.difficulty)
      ? r.difficulty
      : "normal";
  return {
    name: text(r.name, "GREENWOOD").slice(0, 24) || "GREENWOOD",
    crest: ["crown", "tree", "shield"].includes(r.crest) ? r.crest : "crown",
    enemy: Object.hasOwn(ENEMIES, r.enemy) ? r.enemy : "iron",
    difficulty,
    type: ["conquest", "defense", "siege"].includes(r.type)
      ? r.type
      : "conquest",
    resources: r.resources === "scarce" ? "scarce" : "standard",
    preparation: n(
      r.preparation,
      DIFFICULTIES[difficulty as keyof typeof DIFFICULTIES].prep,
      300,
      60,
    ),
    limit: n(r.limit, 0, 3600),
    tutorial: r.tutorial !== false,
  };
}
export function sanitizeWar(raw: unknown): WarData | null {
  const r = obj(raw);
  if (r.version !== 1 || typeof r.id !== "string" || !r.player || !r.enemy)
    return null;
  const economy = (raw: unknown) => {
    const x = obj(raw),
      b = obj(x.building);
    const d = sanitizeEconomy({ ...x, building: { ...b, buildings: [] } });
    if (!d) return null;
    d.building ??= freshBuildings();
    d.building.territories = ["central", "west", "east", "north", "outer"];
    d.building.tutorialDone = true;
    const ids = new Set<string>();
    d.building.buildings = (Array.isArray(b.buildings) ? b.buildings : [])
      .slice(0, 20)
      .flatMap((v: unknown) => {
        const z = obj(v);
        if (
          !/^building-\d+$/.test(z.id) ||
          ids.has(z.id) ||
          !buildingConfig(z.type)
        )
          return [];
        ids.add(z.id);
        return [
          {
            id: z.id,
            type: z.type,
            x: n(z.x, 300, 510, 70),
            y: n(z.y, 400, 700, 100),
            angle: n(z.angle, 0, 360),
            level: Math.floor(n(z.level, 1, 5, 1)),
            paid: cost(z.paid),
            production: {
              ...freshProduction(),
              level: Math.floor(n(z.level, 1, 5, 1)),
              hits: n(obj(z.production).hits),
              yielded: n(obj(z.production).yielded),
              lastHit: n(obj(z.production).lastHit, -10000, 1e9, -10000),
              recent: (Array.isArray(obj(z.production).recent)
                ? obj(z.production).recent
                : []
              )
                .slice(-20)
                .map((v: unknown) => n(v)),
              overloadedUntil: n(obj(z.production).overloadedUntil),
            },
            charge: n(z.charge, 0, 5),
            lastHit: n(z.lastHit, -10000, 1e9, -10000),
            readyAt: n(z.readyAt),
          },
        ];
      });
    const rawUnits = Array.isArray(obj(x.army).units) ? obj(x.army).units : [];
    for (const u of d.army!.units) {
      const old = rawUnits.find((v: any) => v.id === u.id);
      if (
        old &&
        ["reserve", "deployed", "scout", "commander"].includes(old.squad)
      ) {
        u.squad = old.squad;
        if (u.squad === "commander") u.rank = 5;
      }
    }
    d.building.nextId = Math.max(
      n(b.nextId, 1),
      ...d.building.buildings.map((z) => Number(z.id.split("-")[1]) + 1),
    );
    for (const k of [
      "wood",
      "stone",
      "gold",
      "food",
      "mana",
      "energy",
    ] as const)
      d.resources[k] = n(
        obj(x.resources)[k],
        d.resources[k],
        k === "energy" ? 100 : 100000,
      );
    return d;
  };
  const player = economy(r.player),
    enemy = economy(r.enemy);
  if (!player || !enemy) return null;
  const ids = new Set<string>();
  const structures: Structure[] = (
    Array.isArray(r.structures) ? r.structures : []
  )
    .slice(0, 65)
    .flatMap((raw: unknown) => {
      const s = obj(raw);
      if (
        typeof s.id !== "string" ||
        s.id.length > 70 ||
        ids.has(s.id) ||
        !buildingConfig(s.type)
      )
        return [];
      ids.add(s.id);
      const level = Math.floor(n(s.level, 1, 5, 1)),
        maxHp = s.castle
          ? CASTLE_HP[level - 1]
          : (BUILDING_HEALTH[s.type]?.[0] ?? 350) * (1 + (level - 1) * 0.35);
      return [
        {
          id: s.id,
          side: s.side === "enemy" ? "enemy" : "ally",
          type: s.type,
          x: n(s.x, 300, 515, 65),
          y: n(s.y, 400, 700, 100),
          angle: n(s.angle, 0, 360),
          level,
          hp: n(s.hp, maxHp, maxHp),
          maxHp,
          armor: (BUILDING_HEALTH[s.type]?.[1] ?? 10) + (level - 1) * 3,
          lastDamage: n(s.lastDamage, -10000, 1e9, -10000),
          lastSphere: n(s.lastSphere, -10000, 1e9, -10000),
          repairReady: n(s.repairReady),
          fixed: typeof s.fixed === "string" ? s.fixed : undefined,
          castle: s.castle === true,
          defense: s.defense === true,
        },
      ];
    });
  if (
    !structures.some((s) => s.castle && s.side === "ally") ||
    !structures.some((s) => s.castle && s.side === "enemy")
  )
    return null;
  const a = obj(r.ai),
    stats = freshStats();
  for (const key of Object.keys(stats) as (keyof WarStats)[])
    if (key !== "repairs") stats[key] = n(obj(r.stats)[key], stats[key]);
  stats.repairs = cost(obj(r.stats).repairs);
  const intel = (v: unknown) => {
    const x = obj(v);
    return typeof x.at === "number"
      ? {
          at: n(x.at),
          count: n(x.count, 0, 120),
          power: n(x.power),
          kinds: obj(x.kinds),
          defenses: n(x.defenses, 0, 30),
          lane: ["left", "center", "right"].includes(x.lane)
            ? x.lane
            : "center",
          damage: n(x.damage, 0, 1),
          castleLevel: n(x.castleLevel, 1, 5),
        }
      : null;
  };
  const w: WarData = {
    version: 1,
    id: text(r.id),
    options: warOptions(r.options ?? DEFAULT_WAR),
    time: n(r.time),
    phase: [
      "preparation",
      "reconnaissance",
      "border",
      "war",
      "siege",
      "conquest",
    ].includes(r.phase)
      ? r.phase
      : "preparation",
    player,
    enemy,
    structures,
    work: [],
    nextId: n(r.nextId, 1),
    order: [
      "defend",
      "frontline",
      "economy",
      "military",
      "siege",
      "castle",
      "retreat",
    ].includes(r.order)
      ? r.order
      : "defend",
    lane: ["left", "center", "right"].includes(r.lane) ? r.lane : "center",
    ai: {
      strategy: [
        "economy",
        "military",
        "defense",
        "recon",
        "raid",
        "assault",
        "siege",
        "recovery",
        "emergency",
      ].includes(a.strategy)
        ? a.strategy
        : "economy",
      since: n(a.since),
      nextThink: n(a.nextThink),
      nextHarvest: n(a.nextHarvest),
      harvestIndex: n(a.harvestIndex),
      nextAttack: n(a.nextAttack, 180000),
      wave: n(a.wave),
      lane: ["left", "center", "right"].includes(a.lane) ? a.lane : "center",
      warningAt: n(a.warningAt),
      lastStand: a.lastStand === true,
      commanderId:
        typeof a.commanderId === "string" ? a.commanderId : undefined,
      abilityAt: n(a.abilityAt),
      abilityWarning: n(a.abilityWarning),
      intel: intel(a.intel),
    },
    intel: intel(r.intel),
    projectiles: [],
    nextProjectile: n(r.nextProjectile, 1),
    comboHits: [],
    buffs: {},
    cooldowns: {},
    logs: [],
    tutorial: Math.floor(n(r.tutorial, 0, 8)),
    tutorialDone: r.tutorialDone === true,
    emergencyCharges: n(r.emergencyCharges, 0, 2),
    relaunchGrace: n(r.relaunchGrace),
    stats,
    result: null,
  };
  w.work = (Array.isArray(r.work) ? r.work : [])
    .slice(0, 20)
    .flatMap((v: unknown) => {
      const x = obj(v);
      if (
        !["build", "repair", "rebuild"].includes(x.kind) ||
        !buildingConfig(x.type)
      )
        return [];
      return [
        {
          id: text(x.id),
          side: x.side === "enemy" ? "enemy" : "ally",
          kind: x.kind,
          target: text(x.target),
          type: x.type,
          x: n(x.x, 300, 510, 70),
          y: n(x.y, 400, 700, 100),
          angle: n(x.angle, 0, 360),
          remaining: n(x.remaining, 10, 120),
          paid: cost(x.paid),
          heal: n(x.heal, 0, 5000),
          emergency: x.emergency === true,
        },
      ];
    });
  for (const key of ["buffs", "cooldowns"] as const)
    for (const [k, v] of Object.entries(obj(r[key])).slice(0, 30))
      if (/^[a-zA-Z-]+$/.test(k)) w[key][k] = n(v);
  w.comboHits = (Array.isArray(r.comboHits) ? r.comboHits : [])
    .slice(-40)
    .map((h: any) => ({ id: text(h.id), kind: text(h.kind), time: n(h.time) }));
  w.logs = (Array.isArray(r.logs) ? r.logs : [])
    .slice(0, 30)
    .map((l: any) => ({ time: n(l.time), text: text(l.text) }));
  if (["victory", "defeat", "draw"].includes(obj(r.result).outcome))
    w.result = {
      ...obj(r.result),
      id: w.id,
      name: w.options.name,
      enemy: w.options.enemy,
      difficulty: w.options.difficulty,
      type: w.options.type,
      stats: w.stats,
      outcome: r.result.outcome,
      reason: text(r.result.reason),
      grade: ["S", "A", "B", "C", "D", "F"].includes(r.result.grade)
        ? r.result.grade
        : "F",
      seconds: n(r.result.seconds),
      castle: n(r.result.castle),
      enemyCastle: n(r.result.enemyCastle),
      produced: cost(r.result.produced),
      spent: cost(r.result.spent),
      units: n(r.result.units),
      survivors: n(r.result.survivors),
      losses: n(r.result.losses),
      research: n(r.result.research),
      hits: n(r.result.hits),
      combo: n(r.result.combo),
      lossesBall: n(r.result.lossesBall),
      survival: n(r.result.survival),
      rank: n(r.result.rank, 1, 5, 1),
      style: text(r.result.style, "defend"),
      achievements: (Array.isArray(r.result.achievements)
        ? r.result.achievements
        : []
      )
        .slice(0, 10)
        .map((x: unknown) => text(x)),
    } as WarResult;
  // Projectiles are reconstructed by the existing army sanitizer, including ages and IDs.
  const bridge = sanitizeEconomy({
    ...r.player,
    building: { buildings: [] },
    army: {
      ...obj(obj(r.player).army),
      battle: {
        mode: "challenge",
        scenario: 0,
        enemies: [],
        projectiles: r.projectiles,
      },
    },
  });
  w.projectiles = bridge?.army?.battle?.projectiles ?? [];
  return w;
}
export class WarSaveManager {
  exists() {
    try {
      return !!this.storage?.getItem(WAR_KEY);
    } catch {
      return false;
    }
  }
  lastError = "";
  constructor(
    private storage: StorageLike | undefined = typeof localStorage ===
    "undefined"
      ? undefined
      : localStorage,
  ) {}
  load() {
    try {
      const raw = this.storage?.getItem(WAR_KEY);
      return raw ? sanitizeWar(JSON.parse(raw)) : null;
    } catch {
      this.lastError = "전쟁 저장을 읽지 못했습니다.";
      return null;
    }
  }
  save(data: WarData) {
    try {
      const copy = structuredClone(data);
      if (copy.player.army) copy.player.army.battle = null;
      if (copy.enemy.army) copy.enemy.army.battle = null;
      this.storage?.setItem(WAR_KEY, JSON.stringify(copy));
      this.lastError = "";
    } catch {
      this.lastError = "전쟁 저장에 실패했습니다. 저장 공간을 확인하세요.";
    }
  }
  records(): WarResult[] {
    try {
      const a = JSON.parse(this.storage?.getItem(RECORD_KEY) ?? "[]");
      return Array.isArray(a)
        ? a
            .filter(
              (r) =>
                r &&
                typeof r.id === "string" &&
                ["victory", "defeat", "draw"].includes(r.outcome),
            )
            .slice(0, 30)
        : [];
    } catch {
      return [];
    }
  }
  record(result: WarResult) {
    const rows = this.records();
    if (rows.some((r) => r.id === result.id)) return;
    try {
      this.storage?.setItem(
        RECORD_KEY,
        JSON.stringify([result, ...rows].slice(0, 30)),
      );
    } catch {
      this.lastError = "전쟁 기록 저장에 실패했습니다.";
    }
  }
}
