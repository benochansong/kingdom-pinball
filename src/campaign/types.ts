import type { WarData } from "../war/types";
import type { Cost } from "../config/economy";
export type CampaignDifficulty = "story" | "normal" | "hard" | "legendary";
export type MissionKind =
  | "development"
  | "defense"
  | "resource"
  | "siege"
  | "escort"
  | "rescue"
  | "survival"
  | "conquest"
  | "magic"
  | "boss";
export interface BossState {
  id: string;
  unitId: string;
  hp: number;
  maxHp: number;
  armor: number;
  phase: number;
  next: number;
  warning: { x: number; y: number; at: number; kind: string } | null;
  weakUntil: number;
  summons: number;
  repairs: number;
  revealedUntil: number;
  shield: string;
}
export interface MissionState {
  hits: Record<string, number>;
  devices: number;
  specialty: number;
  escortId: string;
  released: boolean;
  waypoint: number;
  boss: BossState | null;
  deviceHealth: Record<string, number>;
  deviceCooldowns: Record<string, number>;
}
export interface StageRecord {
  wins: number;
  attempts: number;
  stars: number;
  bestSeconds: number;
  difficulty: Partial<
    Record<CampaignDifficulty, { stars: number; seconds: number }>
  >;
  lastReason: string;
}
export interface CampaignSession {
  id: string;
  stage: string;
  difficulty: CampaignDifficulty;
  war: WarData;
  mission: MissionState;
  settled: boolean;
  elite: boolean;
  event: boolean;
  stars: boolean[];
  reasons: string[];
  reward: string;
}
export interface CampaignProfile {
  blueprints?: import("../building/types").Blueprint[];
  magicLoadout?: import("../magic/types").MagicData["loadout"];
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  difficulty: CampaignDifficulty;
  prestige: number;
  points: number;
  specialties: Record<string, number>;
  research: Record<string, number>;
  territories: Record<
    string,
    { level: number; facilities: Record<string, number> }
  >;
  cores: string[];
  records: Record<string, StageRecord>;
  generals: string[];
  general: string;
  equipment: string[];
  loadout: Record<string, string>;
  trade: {
    automatic?: boolean;
    from: string;
    to: string;
    used: number;
    turn: number;
  }[];
  turn: number;
  events: { id: string; region: string; expires: number; done: boolean }[];
  story: string[];
  achievements: string[];
  stats: {
    seconds: number;
    units: number;
    wins: number;
    combo: number;
    multiballs: number;
    storms: number;
    specialties: number;
    spells: Record<string, number>;
  };
  session: CampaignSession | null;
  completed: boolean;
  ngPlus: number;
  stock: Cost;
}
export interface SessionExtension {
  flatBoard?: boolean;
  canAdvance?(): boolean;
  regionId?: string;
  bossPhase?: () => number;
  beforeStep(dt: number): void;
  afterStep(dt: number): void;
  onLoss?(): boolean;
  dispose(): void;
}
