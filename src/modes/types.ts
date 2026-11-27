import type { WarData, Difficulty, EnemyKind, WarType } from "../war/types";
import type { CampaignSession } from "../campaign/types";
import type { UnitKind, Formation } from "../army/types";
export type ModeId =
  | "survival"
  | "sandbox"
  | "bossRush"
  | "puzzle"
  | "roguelike"
  | "customTable"
  | "daily"
  | "weekly"
  | "customWar"
  | "spectator";
export type StartKind =
  "balanced" | "economic" | "fortress" | "military" | "magic";
export interface PhysicsSettings {
  gravity: number;
  mass: number;
  restitution: number;
  friction: number;
  maxSpeed: number;
  flipper: number;
  bumper: number;
  accelerator: number;
  slow: number;
  wind: number;
  balls: number;
}
export interface SandboxSettings {
  unlimited: boolean;
  production: number;
  cost: number;
  storage: boolean;
  population: number;
  training: number;
  ai: boolean;
  movement: boolean;
  allMagic: boolean;
  infiniteMana: boolean;
  infiniteCharge: boolean;
  cooldowns: boolean;
  enemyKingdom: boolean;
  invasion: boolean;
  destruction: boolean;
  castleDamage: boolean;
  allyInvincible: boolean;
  enemyInvincible: boolean;
  endConditions: boolean;
}
export interface ModeOptions {
  allyFaction: EnemyKind;
  allyDifficulty: Difficulty;
  region: string;
  difficulty: Difficulty;
  start: StartKind;
  general: string;
  equipment: string;
  magic: string[];
  variant: string;
  seed: number;
  preparation: number;
  limit: number;
  enemy: EnemyKind;
  warType: WarType;
  castleLevel: number;
  resources: number;
  units: number;
  buildingLimit: number;
  magicEnabled: boolean;
  multiEnabled: boolean;
  stormEnabled: boolean;
  population: number;
  puzzle: number;
  tableId: string;
  physics: PhysicsSettings;
  sandbox: SandboxSettings;
}
export interface ModeReward {
  id: string;
  name: string;
  description: string;
  category: "resource" | "recovery" | "army" | "magic" | "upgrade" | "relic";
}
export interface WaveState {
  number: number;
  phase: "preparation" | "active" | "reward";
  pending: UnitKind[];
  ids: string[];
  nextSpawn: number;
  readyAt: number;
  bossRegion: string;
  bosses: number;
}
export interface RogueNode {
  id: string;
  act: number;
  row: number;
  column: number;
  kind:
    | "battle"
    | "elite"
    | "resource"
    | "market"
    | "repair"
    | "treasure"
    | "shrine"
    | "puzzle"
    | "boss";
  risk: "safe" | "elite" | "cursed";
  region: string;
  next: string[];
  complete: boolean;
}
export interface ModeStats {
  kills: number;
  bosses: number;
  maxPower: number;
  combo: number;
  damage: number;
  produced: number;
  units: number;
  multiballs: number;
  storms: number;
  spells: Record<string, number>;
  balls: number;
  flippers: number;
  placements: number;
  hints: number;
  reflections: number;
}
export interface ModeSession {
  table?: import("./TableCreator").TableDefinition;
  version: 1;
  id: string;
  kind: ModeId;
  name: string;
  options: ModeOptions;
  seedState: number;
  startedAt: string;
  time: number;
  status: "playing" | "reward" | "route" | "complete" | "failed";
  battle: CampaignSession | null;
  wave: WaveState;
  rewards: string[];
  rewardId: string;
  claimed: string[];
  bossOrder: string[];
  bossIndex: number;
  bossTimes: number[];
  legTime: number;
  upgrades: Record<string, number>;
  relics: string[];
  nodes: RogueNode[];
  node: string;
  stats: ModeStats;
  competitive: boolean;
  reason: string;
  recorded: boolean;
  challengeId: string;
  goal: number;
  score: number;
  flags: Record<string, number>;
}
export interface ModeRecord {
  id: string;
  mode: ModeId;
  variant: string;
  region: string;
  difficulty: Difficulty;
  won: boolean;
  seconds: number;
  score: number;
  wave: number;
  bosses: number;
  grade: string;
  stats: ModeStats;
  seed: number;
  challengeId: string;
  at: string;
  competitive: boolean;
}
export interface ModeBucket {
  version: 1;
  session: ModeSession | null;
  records: ModeRecord[];
}
export interface SandboxProject {
  version: 1;
  id: string;
  name: string;
  session: ModeSession;
  updatedAt: string;
}
export interface ArmyFixture {
  side: "ally" | "enemy";
  kind: UnitKind;
  count: number;
  rank: number;
  research: number;
  formation: Formation;
}
export interface GlobalProfile {
  version: 1;
  name: string;
  crest: string;
  title: string;
  titles: string[];
  achievements: string[];
  cosmetics: string[];
  equipped: Record<string, string>;
  runs: number;
  seconds: number;
  lastMode: string;
  styles: Record<string, number>;
  seen: string[];
}
export type BattleData = WarData;
