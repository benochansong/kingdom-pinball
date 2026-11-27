import {
  ECONOMY,
  FACILITIES,
  RESOURCE_IDS,
  RESOURCES,
  SPECIALS,
  PRODUCTION_EVENTS,
  type ResourceAmounts,
} from "../config/economy";
import type { StorageLike } from "../systems/SaveManager";
import type { EconomyData } from "./types";
import { sanitizeBuildings } from "../building/BuildingSave";
import { ResourceManager } from "./ResourceManager";
import { sanitizeArmy } from "../army/MilitarySaveManager";
import { sanitizeMagic } from "../magic/MagicSave";
import { sanitizeProtection } from "../systems/BallProtection";
export const ECONOMY_KEY = "kingdom-pinball:economy:v2";
export const amounts = (value = 0): ResourceAmounts =>
  Object.fromEntries(RESOURCE_IDS.map((r) => [r, value])) as ResourceAmounts;
export const freshEconomy = (): EconomyData => ({
  version: 4,
  id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
  resources: Object.fromEntries(
    RESOURCE_IDS.map((r) => [r, RESOURCES[r].initial]),
  ) as ResourceAmounts,
  storageLevel: 1,
  rank: 1,
  produced: amounts(),
  spent: amounts(),
  bought: amounts(),
  sold: amounts(),
  overflow: amounts(),
  facilities: Object.fromEntries(
    FACILITIES.map((f) => [
      f.id,
      {
        level: 1,
        hits: 0,
        yielded: 0,
        lastHit: -10000,
        recent: [],
        overloadedUntil: 0,
      },
    ]),
  ),
  specials: Object.fromEntries(
    SPECIALS.map((s) => [
      s.id,
      {
        count: 0,
        last: "",
        timestamps: [],
        seen: {},
        readyAt: 0,
        achievements: 0,
      },
    ]),
  ),
  claimed: [],
  score: 0,
  palaceHits: 0,
  totalHits: 0,
  scoreComboMax: 0,
  combo: { count: 0, max: 0, last: -10000 },
  time: 0,
  launchState: "ready",
  losses: 0,
  launchedAt: 0,
  survivalMs: 0,
  royalCount: 0,
  royalUntil: 0,
  event: null,
  nextEvent: 0,
  validHits: 0,
  lastEventHit: 0,
  trades: [],
  tradeCount: 0,
  tutorialStep: 0,
  tutorialDone: false,
  createdAt: new Date().toISOString().slice(0, 10),
});
const finite = (
  x: unknown,
  fallback = 0,
  max = Number.MAX_SAFE_INTEGER,
): number =>
  typeof x === "number" && Number.isFinite(x) && x >= 0
    ? Math.min(Math.floor(x), max)
    : fallback;
const object = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {};
/** Explicit field allow-list also handles the preliminary v1 economy schema. Classic v1 stays intact. */
export function sanitizeEconomy(raw: unknown): EconomyData | null {
  const input = object(raw);
  if (![1, 2, 3, 4].includes(input.version as number)) return null;
  const data = freshEconomy();
  if (typeof input.id === "string" && /^[a-z0-9-]{1,40}$/.test(input.id))
    data.id = input.id;
  data.storageLevel = Math.max(1, finite(input.storageLevel, 1, 5));
  data.rank = Math.max(1, finite(input.rank, 1, 5));
  for (const key of [
    "resources",
    "produced",
    "spent",
    "bought",
    "sold",
    "overflow",
  ] as const) {
    const values = object(input[key]);
    for (const r of RESOURCE_IDS)
      data[key][r] = finite(
        values[r],
        data[key][r],
        key === "resources"
          ? RESOURCES[r].capacity *
              (r === "energy"
                ? 1
                : ECONOMY.storageMultipliers[data.storageLevel - 1])
          : Number.MAX_SAFE_INTEGER,
      );
  }
  for (const key of [
    "score",
    "palaceHits",
    "totalHits",
    "scoreComboMax",
    "time",
    "losses",
    "launchedAt",
    "survivalMs",
    "royalCount",
    "royalUntil",
    "nextEvent",
    "validHits",
    "lastEventHit",
    "tradeCount",
  ] as const)
    data[key] = finite(input[key]);
  const facilities = object(input.facilities);
  for (const f of FACILITIES) {
    const value = object(facilities[f.id]);
    const out = data.facilities[f.id];
    out.level = Math.max(1, finite(value.level, 1, 5));
    out.hits = finite(value.hits);
    out.yielded = finite(value.yielded);
    out.lastHit = finite(value.lastHit, -10000, data.time);
    out.overloadedUntil = finite(
      value.overloadedUntil,
      0,
      data.time + ECONOMY.overloadDurationMs,
    );
    out.recent = Array.isArray(value.recent)
      ? value.recent
          .filter(
            (n) =>
              typeof n === "number" &&
              Number.isFinite(n) &&
              n >= data.time - ECONOMY.overloadWindowMs &&
              n <= data.time,
          )
          .slice(-12)
      : [];
  }
  const specials = object(input.specials);
  for (const s of SPECIALS) {
    const value = object(specials[s.id]);
    data.specials[s.id].achievements = finite(value.achievements);
    data.specials[s.id].readyAt = finite(
      value.readyAt,
      0,
      data.time + ECONOMY.specialCooldownMs,
    );
    // Partial combo chains deliberately reset at safe resume points.
  }
  data.claimed = Array.isArray(input.claimed)
    ? [
        ...new Set(
          input.claimed.filter(
            (v): v is string => typeof v === "string" && v.length < 50,
          ),
        ),
      ].slice(0, 50)
    : [];
  const combo = object(input.combo);
  data.combo.max = finite(combo.max);
  data.launchState = ["ready", "inflight", "awaiting", "ended"].includes(
    input.launchState as string,
  )
    ? (input.launchState as EconomyData["launchState"])
    : "awaiting";
  const event = object(input.event);
  if (
    typeof event.index === "number" &&
    Number.isInteger(event.index) &&
    PRODUCTION_EVENTS[event.index] &&
    typeof event.until === "number" &&
    event.until > data.time
  )
    data.event = {
      index: event.index,
      until: Math.min(event.until, data.time + 20000),
    };
  data.trades = Array.isArray(input.trades)
    ? input.trades.slice(-30).flatMap((item) => {
        const t = object(item);
        return typeof t.id === "string"
          ? [
              {
                id: t.id.slice(0, 30),
                batches: finite(t.batches),
                time: finite(t.time),
              },
            ]
          : [];
      })
    : [];
  data.tutorialDone = input.tutorialDone === true;
  data.tutorialStep = data.tutorialDone ? -1 : finite(input.tutorialStep, 0, 9);
  if (
    typeof input.createdAt === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(input.createdAt)
  )
    data.createdAt = input.createdAt;
  data.building = sanitizeBuildings(input.building);
  data.army = sanitizeArmy(input.army);
  data.magic = sanitizeMagic(input.magic);
  data.pinball = sanitizeProtection(input.pinball, data.time);
  const capacity = new ResourceManager(data);
  for (const r of RESOURCE_IDS)
    data.resources[r] = finite(
      object(input.resources)[r],
      data.resources[r],
      capacity.capacity(r),
    );
  return data;
}
export class EconomySaveManager {
  available = true;
  recoveredBuildings = 0;
  constructor(private storage?: StorageLike) {
    try {
      if (!storage) this.storage = globalThis.localStorage;
    } catch {
      this.available = false;
    }
  }
  load(): EconomyData | null {
    try {
      const raw =
        this.storage?.getItem(ECONOMY_KEY) ??
        this.storage?.getItem("kingdom-pinball:economy:v1");
      const parsed = raw ? JSON.parse(raw) : null;
      const clean = parsed ? sanitizeEconomy(parsed) : null;
      this.recoveredBuildings = Math.max(
        0,
        (Array.isArray(parsed?.building?.buildings)
          ? parsed.building.buildings.length
          : 0) - (clean?.building?.buildings.length ?? 0),
      );
      return clean;
    } catch {
      this.available = false;
      return null;
    }
  }
  save(data: EconomyData): void {
    try {
      this.storage?.setItem(ECONOMY_KEY, JSON.stringify(data));
    } catch {
      this.available = false;
    }
  }
  history(): EconomyData[] {
    try {
      const raw: unknown = JSON.parse(
        this.storage?.getItem("kingdom-pinball:economy:history:v2") ?? "[]",
      );
      return Array.isArray(raw)
        ? raw
            .slice(0, 10)
            .map(sanitizeEconomy)
            .filter((d): d is EconomyData => d !== null)
        : [];
    } catch {
      return [];
    }
  }
  archive(data: EconomyData): void {
    try {
      const records = this.history().filter((d) => d.id !== data.id);
      this.storage?.setItem(
        "kingdom-pinball:economy:history:v2",
        JSON.stringify([data, ...records].slice(0, 10)),
      );
    } catch {
      this.available = false;
    }
  }
}
