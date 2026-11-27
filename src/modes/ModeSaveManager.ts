import { parseTable, validateTable } from "./TableCreator";
import type { StorageLike } from "../systems/SaveManager";
import type {
  ModeId,
  ModeSession,
  ModeBucket,
  ModeOptions,
  ModeStats,
  ModeRecord,
  GlobalProfile,
  SandboxProject,
} from "./types";
import {
  MODE_CATALOG,
  defaultModeOptions,
  PHYSICS_LIMITS,
  STARTS,
} from "../config/modes";
import { REGIONS } from "../config/campaign";
import { EQUIPMENT, GENERALS } from "../config/campaignGrowth";
import { ELEMENTS } from "../config/magic";
import { UNITS } from "../config/army";
import {
  freshCampaign,
  sanitizeCampaign,
  freshMission,
} from "../campaign/CampaignSaveManager";
export const MODE_KEY = "kingdom-pinball:mode:v1:";
export const GLOBAL_KEY = "kingdom-pinball:profile:v1";
export const PROJECT_KEY = "kingdom-pinball:sandbox:v1:";
export const object = (v: unknown): Record<string, any> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, any>)
    : {};
export const bounded = (v: unknown, lo = 0, hi = 1e9, fallback = lo) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.max(lo, Math.min(hi, v))
    : fallback;
export const cleanText = (v: unknown, max = 100) =>
  typeof v === "string" ? v.replace(/[<>\x00-\x1f]/g, "").slice(0, max) : "";
export const strings = (v: unknown, max = 100) =>
  Array.isArray(v)
    ? [
        ...new Set(
          v.filter((x) => typeof x === "string").map((x) => cleanText(x)),
        ),
      ].slice(0, max)
    : [];
export const numbers = (v: unknown, max = 1000) =>
  Object.fromEntries(
    Object.entries(object(v))
      .filter(([id]) => /^[\w-]{1,80}$/.test(id))
      .slice(0, 100)
      .map(([id, n]) => [id, bounded(n, 0, max)]),
  );
const modeIds = MODE_CATALOG.map((m) => m.id);
export const freshModeStats = (): ModeStats => ({
  kills: 0,
  bosses: 0,
  maxPower: 0,
  combo: 0,
  damage: 0,
  produced: 0,
  units: 0,
  multiballs: 0,
  storms: 0,
  spells: {},
  balls: 0,
  flippers: 0,
  placements: 0,
  hints: 0,
  reflections: 0,
});
export function sanitizeOptions(raw: unknown): ModeOptions {
  const x = object(raw),
    d = defaultModeOptions();
  d.region = REGIONS.some((r) => r.id === x.region) ? x.region : d.region;
  d.difficulty = ["beginner", "normal", "hard", "expert", "legendary"].includes(
    x.difficulty,
  )
    ? x.difficulty
    : d.difficulty;
  d.start = Object.hasOwn(STARTS, x.start) ? x.start : "balanced";
  d.general = GENERALS.some((g) => g.id === x.general) ? x.general : "guardian";
  d.equipment = EQUIPMENT.some((e) => e.id === x.equipment) ? x.equipment : "";
  d.magic = strings(x.magic, 4).filter((id) =>
    ELEMENTS.some((e) => e.id === id),
  );
  d.variant = cleanText(x.variant) || "standard";
  d.seed = bounded(x.seed, 0, 0xffffffff, d.seed) >>> 0;
  d.allyFaction = ["iron", "crimson", "golden", "arcane", "shadow"].includes(
    x.allyFaction,
  )
    ? x.allyFaction
    : "iron";
  d.allyDifficulty = [
    "beginner",
    "normal",
    "hard",
    "expert",
    "legendary",
  ].includes(x.allyDifficulty)
    ? x.allyDifficulty
    : "normal";
  d.enemy = ["iron", "crimson", "golden", "arcane", "shadow"].includes(x.enemy)
    ? x.enemy
    : "crimson";
  d.warType = ["conquest", "defense", "siege"].includes(x.warType)
    ? x.warType
    : "conquest";
  for (const key of [
    "preparation",
    "limit",
    "castleLevel",
    "resources",
    "units",
    "buildingLimit",
    "population",
    "puzzle",
  ] as const) {
    const range: Record<string, [number, number]> = {
      preparation: [0, 300],
      limit: [0, 3600],
      castleLevel: [1, 5],
      resources: [0, 4000],
      units: [0, 100],
      buildingLimit: [0, 30],
      population: [10, 100],
      puzzle: [0, 29],
    };
    d[key] = Math.floor(bounded(x[key], ...range[key], d[key]));
  }
  for (const key of ["magicEnabled", "multiEnabled", "stormEnabled"] as const)
    d[key] = typeof x[key] === "boolean" ? x[key] : d[key];
  d.tableId = cleanText(x.tableId);
  for (const key of Object.keys(PHYSICS_LIMITS) as (keyof typeof d.physics)[])
    d.physics[key] = bounded(
      object(x.physics)[key],
      ...PHYSICS_LIMITS[key],
      d.physics[key],
    );
  d.physics.balls = Math.floor(d.physics.balls);
  const sb = object(x.sandbox);
  for (const key of Object.keys(d.sandbox) as (keyof typeof d.sandbox)[]) {
    if (typeof d.sandbox[key] === "boolean")
      (d.sandbox as any)[key] =
        typeof sb[key] === "boolean" ? sb[key] : d.sandbox[key];
  }
  d.sandbox.production = bounded(sb.production, 0.25, 3, 1);
  d.sandbox.cost = bounded(sb.cost, 0, 2, 0);
  d.sandbox.population = Math.floor(bounded(sb.population, 10, 100, 100));
  d.sandbox.training = bounded(sb.training, 0.25, 4, 1);
  return d;
}
function stats(raw: unknown): ModeStats {
  const d = freshModeStats(),
    x = object(raw);
  for (const key of Object.keys(d))
    if (key !== "spells") (d as any)[key] = bounded(x[key]);
  d.spells = numbers(x.spells, 1e7);
  return d;
}
export function freshMode(kind: ModeId, options: ModeOptions): ModeSession {
  return {
    version: 1,
    id: `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    name: MODE_CATALOG.find((m) => m.id === kind)!.name,
    options,
    seedState: options.seed || 1,
    startedAt: new Date().toISOString(),
    time: 0,
    status: "playing",
    battle: null,
    wave: {
      number: 0,
      phase: "preparation",
      pending: [],
      ids: [],
      nextSpawn: 0,
      readyAt: options.preparation * 1000,
      bossRegion: "",
      bosses: 0,
    },
    rewards: [],
    rewardId: "",
    claimed: [],
    bossOrder: REGIONS.map((r) => r.id),
    bossIndex: 0,
    bossTimes: [],
    legTime: 0,
    upgrades: {},
    relics: [],
    nodes: [],
    node: "",
    stats: freshModeStats(),
    competitive: !["sandbox", "spectator", "customWar", "customTable"].includes(
      kind,
    ),
    reason: "",
    recorded: false,
    challengeId: "",
    goal: 0,
    score: 0,
    flags: {},
  };
}
export function sanitizeMode(raw: unknown): ModeSession | null {
  const x = object(raw);
  if (x.version !== 1 || !modeIds.includes(x.kind) || typeof x.id !== "string")
    return null;
  const d = freshMode(x.kind, sanitizeOptions(x.options));
  d.id = cleanText(x.id);
  d.name = cleanText(x.name) || d.name;
  d.startedAt = cleanText(x.startedAt);
  d.seedState = bounded(x.seedState, 0, 0xffffffff, d.options.seed) >>> 0;
  d.time = bounded(x.time);
  d.status = ["playing", "reward", "route", "complete", "failed"].includes(
    x.status,
  )
    ? x.status
    : "playing";
  const b = sanitizeCampaign({
    ...freshCampaign("MODE", "normal"),
    session: x.battle,
  })?.session;
  d.battle = b ?? null;
  if (
    d.battle?.mission.boss &&
    REGIONS.some(
      (r) => r.id === object(object(object(x.battle).mission).boss).id,
    )
  )
    d.battle.mission.boss.id = object(object(object(x.battle).mission).boss).id;
  const w = object(x.wave);
  d.wave = {
    number: Math.floor(bounded(w.number, 0, 100000)),
    phase: ["preparation", "active", "reward"].includes(w.phase)
      ? w.phase
      : "preparation",
    pending: strings(w.pending, 120).filter((id) =>
      UNITS.some((u) => u.id === id),
    ) as any,
    ids: strings(w.ids, 150),
    nextSpawn: bounded(w.nextSpawn),
    readyAt: bounded(w.readyAt),
    bossRegion: REGIONS.some((r) => r.id === w.bossRegion) ? w.bossRegion : "",
    bosses: bounded(w.bosses),
  };
  // A wave queue may contain repeated unit kinds; do not deduplicate it.
  d.wave.pending = (Array.isArray(w.pending) ? w.pending : [])
    .slice(0, 120)
    .filter((id: any) => UNITS.some((u) => u.id === id));
  d.rewards = strings(x.rewards, 3);
  d.rewardId = cleanText(x.rewardId);
  d.claimed = strings(x.claimed, 200);
  d.bossOrder = strings(x.bossOrder, 8).filter((id) =>
    REGIONS.some((r) => r.id === id),
  );
  if (!d.bossOrder.length) d.bossOrder = REGIONS.map((r) => r.id);
  d.bossIndex = Math.floor(bounded(x.bossIndex, 0, 8));
  d.bossTimes = (Array.isArray(x.bossTimes) ? x.bossTimes : [])
    .slice(0, 8)
    .map((n: any) => bounded(n));
  d.legTime = bounded(x.legTime);
  d.upgrades = numbers(x.upgrades, 6);
  d.relics = strings(x.relics, 12);
  d.node = cleanText(x.node);
  d.nodes = (Array.isArray(x.nodes) ? x.nodes : [])
    .slice(0, 60)
    .filter(
      (n: any) =>
        typeof n?.id === "string" &&
        [
          "battle",
          "elite",
          "resource",
          "market",
          "repair",
          "treasure",
          "shrine",
          "puzzle",
          "boss",
        ].includes(n.kind),
    )
    .map((n: any) => ({
      id: cleanText(n.id),
      act: Math.floor(bounded(n.act, 0, 3)),
      row: Math.floor(bounded(n.row, 0, 20)),
      column: Math.floor(bounded(n.column, 0, 2)),
      kind: n.kind,
      risk: ["safe", "elite", "cursed"].includes(n.risk) ? n.risk : "safe",
      region: REGIONS.some((r) => r.id === n.region) ? n.region : "greenwood",
      next: strings(n.next, 3),
      complete: n.complete === true,
    }));
  d.stats = stats(x.stats);
  d.reason = cleanText(x.reason, 200);
  d.recorded = x.recorded === true;
  d.challengeId = cleanText(x.challengeId);
  d.goal = bounded(x.goal);
  d.score = bounded(x.score);
  d.flags = numbers(x.flags, 1e9);
  if (x.table) {
    try {
      d.table = parseTable(x.table);
      if (validateTable(d.table).errors.length) return null;
    } catch {
      return null;
    }
  }
  return d;
}
export const freshProfile = (): GlobalProfile => ({
  version: 1,
  name: "ROYAL PIONEER",
  crest: "♛",
  title: "PINBALL ROOKIE",
  titles: ["PINBALL ROOKIE"],
  achievements: [],
  cosmetics: ["crest-crown", "sphere-steel", "border-green"],
  equipped: {
    crest: "crest-crown",
    sphere: "sphere-steel",
    border: "border-green",
  },
  runs: 0,
  seconds: 0,
  lastMode: "",
  styles: {},
  seen: [],
});
export class ModeSaveManager {
  lastError = "";
  private expected = new Map<string, string | null>();
  private blocked = new Set<string>();
  constructor(
    readonly storage: StorageLike | undefined = typeof localStorage ===
    "undefined"
      ? undefined
      : localStorage,
  ) {}
  private read(key: string) {
    try {
      const raw = this.storage?.getItem(key) ?? null;
      this.expected.set(key, raw);
      this.blocked.delete(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      this.lastError = "저장 데이터를 복원하지 못했습니다. 원본은 유지됩니다.";
      return null;
    }
  }
  private write(key: string, data: unknown) {
    if (this.blocked.has(key)) return false;
    try {
      const current = this.storage?.getItem(key) ?? null;
      if (this.expected.has(key) && this.expected.get(key) !== current) {
        this.blocked.add(key);
        this.lastError = "다른 창에서 변경했습니다. 모드를 다시 불러오세요.";
        return false;
      }
      const raw = JSON.stringify(data);
      this.storage?.setItem(key, raw);
      this.expected.set(key, this.storage ? raw : null);
      this.lastError = "";
      return true;
    } catch {
      this.lastError = "저장 실패: 브라우저 저장 공간을 확인하세요.";
      return false;
    }
  }
  conflict(key: string) {
    if (
      key.startsWith(MODE_KEY) ||
      key.startsWith(PROJECT_KEY) ||
      key === GLOBAL_KEY
    ) {
      this.blocked.add(key);
      this.lastError =
        "다른 창에서 변경했습니다. 저장을 멈췄습니다. 다시 불러오세요.";
      return true;
    }
    return false;
  }
  load(kind: ModeId): ModeBucket {
    const x = object(this.read(MODE_KEY + kind));
    if (x.version !== 1) return { version: 1, session: null, records: [] };
    return {
      version: 1,
      session: sanitizeMode(x.session),
      records: (Array.isArray(x.records) ? x.records : [])
        .slice(-30)
        .filter((r: any) => r.mode === kind && typeof r.id === "string")
        .map(
          (r: any) =>
            ({
              id: cleanText(r.id),
              mode: kind,
              variant: cleanText(r.variant),
              region: REGIONS.some((x) => x.id === r.region)
                ? r.region
                : "greenwood",
              difficulty: [
                "beginner",
                "normal",
                "hard",
                "expert",
                "legendary",
              ].includes(r.difficulty)
                ? r.difficulty
                : "normal",
              won: r.won === true,
              seconds: bounded(r.seconds),
              score: bounded(r.score),
              wave: bounded(r.wave),
              bosses: bounded(r.bosses),
              grade: cleanText(r.grade),
              stats: stats(r.stats),
              seed: bounded(r.seed),
              challengeId: cleanText(r.challengeId),
              at: cleanText(r.at),
              competitive:
                !["sandbox", "spectator", "customWar", "customTable"].includes(
                  kind,
                ) && r.competitive === true,
            }) as ModeRecord,
        ),
    };
  }
  save(kind: ModeId, bucket: ModeBucket) {
    return this.write(MODE_KEY + kind, bucket);
  }
  loadProfile() {
    const x = object(this.read(GLOBAL_KEY)),
      d = freshProfile();
    if (x.version !== 1) return d;
    d.name = cleanText(x.name, 40) || d.name;
    d.crest = cleanText(x.crest, 4) || d.crest;
    d.titles = strings(x.titles, 30);
    if (!d.titles.includes("PINBALL ROOKIE")) d.titles.push("PINBALL ROOKIE");
    d.title = d.titles.includes(x.title) ? x.title : "PINBALL ROOKIE";
    d.achievements = strings(x.achievements, 80);
    d.cosmetics = strings(x.cosmetics, 80);
    d.equipped = Object.fromEntries(
      Object.entries(object(x.equipped))
        .filter(([, id]) => d.cosmetics.includes(id as string))
        .slice(0, 9),
    );
    d.runs = bounded(x.runs);
    d.seconds = bounded(x.seconds);
    d.lastMode = cleanText(x.lastMode);
    d.styles = numbers(x.styles, 1e7);
    d.seen = strings(x.seen, 1000);
    return d;
  }
  saveProfile(profile: GlobalProfile) {
    return this.write(GLOBAL_KEY, profile);
  }
  project(slot: number) {
    if (slot < 0 || slot >= 10) return null;
    const x = object(this.read(PROJECT_KEY + slot)),
      session = sanitizeMode(x.session);
    return x.version === 1 && session?.kind === "sandbox"
      ? ({
          version: 1,
          id: cleanText(x.id),
          name: cleanText(x.name),
          session,
          updatedAt: cleanText(x.updatedAt),
        } as SandboxProject)
      : null;
  }
  hasProject(slot: number) {
    try {
      return !!this.storage?.getItem(PROJECT_KEY + slot);
    } catch {
      return false;
    }
  }
  saveProject(
    slot: number,
    session: ModeSession,
    name: string,
    overwrite = false,
  ) {
    if (slot < 0 || slot >= 10 || session.kind !== "sandbox")
      return "유효한 샌드박스 슬롯을 선택하세요.";
    if (this.hasProject(slot) && !overwrite)
      return "프로젝트 덮어쓰기 확인이 필요합니다.";
    if (overwrite) this.read(PROJECT_KEY + slot);
    return this.write(PROJECT_KEY + slot, {
      version: 1,
      id: session.id,
      name: cleanText(name, 40) || "SANDBOX",
      session,
      updatedAt: new Date().toISOString(),
    })
      ? null
      : this.lastError;
  }
}
export function battleMission() {
  return freshMission();
}
