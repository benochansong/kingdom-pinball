import { sanitizeBuildings } from "../building/BuildingSave";
import { sanitizeMagic } from "../magic/MagicSave";
import {
  REGION_MAGIC,
  EQUIPMENT,
  GENERALS,
  CAMPAIGN_RESEARCH,
} from "../config/campaignGrowth";
import type { StorageLike } from "../systems/SaveManager";
import { sanitizeWar } from "../war/WarSaveManager";
import { REGIONS, STAGES, CAMPAIGN_DIFFICULTIES } from "../config/campaign";
import type {
  CampaignProfile,
  CampaignDifficulty,
  CampaignSession,
  MissionState,
} from "./types";
export const CAMPAIGN_KEY = "kingdom-pinball:campaign:v1:";
const o = (v: unknown): Record<string, any> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, any>)
    : {};
const n = (v: unknown, max = 1e9) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.max(0, Math.min(max, v))
    : 0;
const str = (v: unknown, backup = "") =>
  typeof v === "string" ? v.replace(/[<>]/g, "").slice(0, 100) : backup;
const nums = (v: unknown, max = 1e6) =>
  Object.fromEntries(
    Object.entries(o(v))
      .filter(([k]) => /^[\w-]{1,60}$/.test(k))
      .slice(0, 200)
      .map(([k, v]) => [k, n(v, max)]),
  );
const strings = (v: unknown) =>
  Array.isArray(v)
    ? [
        ...new Set(v.filter((x) => typeof x === "string").map((x) => str(x))),
      ].slice(0, 100)
    : [];
export const freshMission = (): MissionState => ({
  hits: {},
  devices: 0,
  specialty: 0,
  escortId: "",
  released: false,
  waypoint: 0,
  boss: null,
  deviceHealth: {},
  deviceCooldowns: {},
});
export function freshCampaign(
  name: string,
  difficulty: CampaignDifficulty,
): CampaignProfile {
  return {
    version: 1,
    id: `campaign-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: str(name, "GREENWOOD"),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    difficulty,
    prestige: 0,
    points: 0,
    specialties: {},
    research: {},
    territories: {},
    cores: [],
    records: {},
    generals: ["guardian"],
    general: "guardian",
    equipment: [],
    loadout: {},
    trade: [],
    turn: 0,
    events: [],
    story: [],
    achievements: [],
    stats: {
      seconds: 0,
      units: 0,
      wins: 0,
      combo: 0,
      multiballs: 0,
      storms: 0,
      specialties: 0,
      spells: {},
    },
    session: null,
    completed: false,
    ngPlus: 0,
    stock: {},
  };
}
export function sanitizeCampaign(raw: unknown): CampaignProfile | null {
  const x = o(raw);
  if (x.version !== 1 || !x.id) return null;
  const d = freshCampaign(
    str(x.name),
    Object.hasOwn(CAMPAIGN_DIFFICULTIES, x.difficulty)
      ? x.difficulty
      : "normal",
  );
  d.id = str(x.id);
  d.createdAt = str(x.createdAt);
  d.updatedAt = str(x.updatedAt);
  d.prestige = n(x.prestige);
  d.points = n(x.points);
  d.specialties = nums(x.specialties);
  d.research = Object.fromEntries(
    Object.entries(nums(x.research, 3))
      .filter(([id]) => CAMPAIGN_RESEARCH.some((r) => r.id === id))
      .map(([id, v]) => [id, Math.floor(v)]),
  );
  d.cores = strings(x.cores).filter((id) => REGIONS.some((r) => r.id === id));
  d.generals = strings(x.generals).filter((id) =>
    GENERALS.some((g) => g.id === id),
  );
  if (!d.generals.includes("guardian")) d.generals.push("guardian");
  d.general = d.generals.includes(x.general) ? x.general : "guardian";
  d.equipment = strings(x.equipment).filter((id) =>
    EQUIPMENT.some((e) => e.id === id),
  );
  d.loadout = Object.fromEntries(
    Object.entries(o(x.loadout))
      .slice(0, 4)
      .filter(
        ([slot, v]) =>
          d.equipment.includes(v as string) &&
          EQUIPMENT.some((e) => e.id === v && e.slot === slot),
      ),
  );
  d.completed = d.cores.length === 8 && x.completed === true;
  d.ngPlus = n(x.ngPlus, 10);
  d.turn = n(x.turn);
  d.achievements = strings(x.achievements);
  d.story = strings(x.story);
  d.stock = nums(x.stock, 1000);
  for (const r of REGIONS) {
    const t = o(o(x.territories)[r.id]);
    if (d.cores.includes(r.id))
      d.territories[r.id] = {
        level: Math.max(1, Math.floor(n(t.level, 5))),
        facilities: nums(t.facilities, 5),
      };
  }
  for (const s of STAGES) {
    const a = o(o(x.records)[s.id]);
    if (!a.attempts && !a.wins) continue;
    const difficulty: CampaignProfile["records"][string]["difficulty"] = {};
    for (const id of Object.keys(
      CAMPAIGN_DIFFICULTIES,
    ) as CampaignDifficulty[]) {
      const v = o(o(a.difficulty)[id]);
      if (v.stars)
        difficulty[id] = {
          stars: Math.floor(n(v.stars, 3)),
          seconds: n(v.seconds),
        };
    }
    d.records[s.id] = {
      wins: Math.floor(n(a.wins)),
      attempts: Math.floor(n(a.attempts)),
      stars: Math.floor(n(a.stars, 3)),
      bestSeconds: n(a.bestSeconds),
      difficulty,
      lastReason: str(a.lastReason),
    };
  }
  d.trade = (Array.isArray(x.trade) ? x.trade : [])
    .slice(0, 8)
    .filter(
      (t: any) =>
        REGIONS.some((r) => r.id === t.from) &&
        REGIONS.some((r) => r.id === t.to) &&
        t.from !== t.to,
    )
    .map((t: any) => ({
      from: t.from,
      to: t.to,
      used: n(t.used, 3),
      turn: n(t.turn),
      automatic: t.automatic === true,
    }));
  d.events = (Array.isArray(x.events) ? x.events : [])
    .slice(-8)
    .filter((e: any) => REGIONS.some((r) => r.id === e.region))
    .map((e: any) => ({
      id: str(e.id),
      region: e.region,
      expires: n(e.expires),
      done: e.done === true,
    }));
  d.stats = { ...d.stats, ...nums(x.stats), spells: nums(o(x.stats).spells) };
  const a = o(x.session),
    w = sanitizeWar(a.war);
  if (w && STAGES.some((s) => s.id === a.stage)) {
    const m = o(a.mission),
      b = o(m.boss),
      mission = {
        ...freshMission(),
        hits: nums(m.hits),
        devices: n(m.devices),
        specialty: n(m.specialty, 10),
        escortId: str(m.escortId),
        released: m.released === true,
        waypoint: n(m.waypoint, 10),
        deviceHealth: nums(m.deviceHealth, 10),
        deviceCooldowns: nums(m.deviceCooldowns),
      };
    if (b.unitId) {
      const warning = o(b.warning);
      mission.boss = {
        id: STAGES.find((s) => s.id === a.stage)!.region,
        unitId: str(b.unitId),
        hp: n(b.hp, 30000),
        maxHp: Math.max(1, n(b.maxHp, 30000)),
        armor: n(b.armor, 3000),
        phase: Math.max(1, n(b.phase, 5)),
        next: n(b.next),
        warning: b.warning
          ? {
              x: n(warning.x, 520),
              y: n(warning.y, 740),
              at: n(warning.at),
              kind: str(warning.kind),
            }
          : null,
        weakUntil: n(b.weakUntil),
        summons: n(b.summons, 12),
        repairs: n(b.repairs, 2),
        revealedUntil: n(b.revealedUntil),
        shield: str(b.shield),
      };
    }
    d.session = {
      id: w.id,
      stage: a.stage,
      difficulty: Object.hasOwn(CAMPAIGN_DIFFICULTIES, a.difficulty)
        ? a.difficulty
        : d.difficulty,
      war: w,
      mission,
      settled: a.settled === true,
      elite: a.elite === true,
      event: a.event === true,
      stars: [0, 1, 2].map((i) => a.stars?.[i] === true),
      reasons: strings(a.reasons),
      reward: str(a.reward),
    } as CampaignSession;
    d.records[a.stage] ??= {
      wins: 0,
      attempts: 1,
      stars: 0,
      bestSeconds: 0,
      difficulty: {},
      lastReason: "",
    };
  }
  d.blueprints = sanitizeBuildings({ presets: x.blueprints }).presets;
  if (x.magicLoadout) {
    const research = Object.fromEntries(
      d.cores.flatMap((id) => REGION_MAGIC[id] ?? []).map((id) => [id, 3]),
    );
    d.magicLoadout = sanitizeMagic({
      research,
      loadout: x.magicLoadout,
    }).loadout;
  }
  return d;
}
export class CampaignSaveManager {
  lastError = "";
  private expected = new Map<number, string | null>();
  private blocked = new Set<number>();
  acceptCurrent(slot: number) {
    this.blocked.delete(slot);
    try {
      this.expected.set(
        slot,
        this.storage?.getItem(CAMPAIGN_KEY + slot) ?? null,
      );
    } catch {}
  }
  block(slot: number) {
    this.blocked.add(slot);
    this.lastError = "다른 창에서 변경한 캠페인입니다. 슬롯을 다시 불러오세요.";
  }
  constructor(
    readonly storage: StorageLike | undefined = typeof localStorage ===
    "undefined"
      ? undefined
      : localStorage,
  ) {}
  load(slot: number, accept = true) {
    if (slot < 0 || slot > 2) return null;
    if (accept) this.acceptCurrent(slot);
    try {
      const raw = this.storage?.getItem(CAMPAIGN_KEY + slot);
      return raw ? sanitizeCampaign(JSON.parse(raw)) : null;
    } catch {
      this.lastError =
        "캠페인 저장을 복원하지 못했습니다. 기존 데이터는 보존됩니다.";
      return null;
    }
  }
  occupied(slot: number) {
    try {
      return !!this.storage?.getItem(CAMPAIGN_KEY + slot);
    } catch {
      return false;
    }
  }
  save(slot: number, data: CampaignProfile) {
    if (slot < 0 || slot > 2 || this.blocked.has(slot)) return false;
    try {
      const current = this.storage?.getItem(CAMPAIGN_KEY + slot) ?? null;
      if (this.expected.has(slot) && this.expected.get(slot) !== current) {
        this.block(slot);
        return false;
      }
      data.updatedAt = new Date().toISOString();
      const raw = JSON.stringify(data);
      this.storage?.setItem(CAMPAIGN_KEY + slot, raw);
      this.expected.set(slot, this.storage ? raw : null);
      this.lastError = "";
      return true;
    } catch {
      this.lastError = "캠페인 저장 실패 · 저장 공간을 확인하세요.";
      return false;
    }
  }
}
