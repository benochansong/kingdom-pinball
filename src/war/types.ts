import type { EconomyData } from "../economy/types";
import type { Cost } from "../config/economy";
import type { Projectile, UnitKind } from "../army/types";
export type Side = "ally" | "enemy";
export type Lane = "left" | "center" | "right";
export type EnemyKind = "iron" | "crimson" | "golden" | "arcane" | "shadow";
export type Difficulty =
  "beginner" | "normal" | "hard" | "expert" | "legendary";
export type WarType = "conquest" | "defense" | "siege";
export type WarOrder =
  | "defend"
  | "frontline"
  | "economy"
  | "military"
  | "siege"
  | "castle"
  | "retreat";
export type WarPhase =
  "preparation" | "reconnaissance" | "border" | "war" | "siege" | "conquest";
export type Strategy =
  | "economy"
  | "military"
  | "defense"
  | "recon"
  | "raid"
  | "assault"
  | "siege"
  | "recovery"
  | "emergency";
export interface WarOptions {
  name: string;
  crest: string;
  enemy: EnemyKind;
  difficulty: Difficulty;
  type: WarType;
  resources: "standard" | "scarce";
  preparation: number;
  limit: number;
  tutorial: boolean;
}
export interface Structure {
  id: string;
  side: Side;
  type: string;
  x: number;
  y: number;
  angle: number;
  level: number;
  hp: number;
  maxHp: number;
  armor: number;
  lastDamage: number;
  lastSphere: number;
  repairReady: number;
  fixed?: string;
  castle?: boolean;
  defense?: boolean;
}
export interface WorkOrder {
  id: string;
  side: Side;
  kind: "build" | "repair" | "rebuild";
  target: string;
  type: string;
  x: number;
  y: number;
  angle: number;
  remaining: number;
  paid: Cost;
  heal: number;
  emergency: boolean;
}
export interface Intel {
  at: number;
  count: number;
  power: number;
  kinds: Partial<Record<UnitKind, number>>;
  defenses: number;
  lane: Lane;
  damage: number;
  castleLevel: number;
}
export interface WarStats {
  destroyed: number;
  walls: number;
  lostBuildings: number;
  sphereBuildings: number;
  sphereUnits: number;
  combos: number;
  repairs: Cost;
  built: number;
  upgrades: number;
  kills: number;
  defended: number;
  minCastle: number;
  maxPower: number;
}
export interface WarResult {
  magic?: import("../magic/types").MagicStats;
  id: string;
  outcome: "victory" | "defeat" | "draw";
  reason: string;
  grade: "S" | "A" | "B" | "C" | "D" | "F";
  seconds: number;
  name: string;
  enemy: EnemyKind;
  difficulty: Difficulty;
  type: WarType;
  castle: number;
  enemyCastle: number;
  stats: WarStats;
  produced: Cost;
  spent: Cost;
  units: number;
  survivors: number;
  losses: number;
  research: number;
  hits: number;
  combo: number;
  lossesBall: number;
  survival: number;
  rank: number;
  style: string;
  achievements: string[];
}
export interface WarData {
  version: 1;
  id: string;
  options: WarOptions;
  time: number;
  phase: WarPhase;
  player: EconomyData;
  enemy: EconomyData;
  structures: Structure[];
  work: WorkOrder[];
  nextId: number;
  order: WarOrder;
  lane: Lane;
  ai: {
    strategy: Strategy;
    since: number;
    nextThink: number;
    nextHarvest: number;
    harvestIndex: number;
    nextAttack: number;
    wave: number;
    lane: Lane;
    warningAt: number;
    lastStand: boolean;
    commanderId?: string;
    abilityAt: number;
    abilityWarning: number;
    intel: Intel | null;
  };
  intel: Intel | null;
  projectiles: Projectile[];
  nextProjectile: number;
  comboHits: { id: string; kind: string; time: number }[];
  buffs: Record<string, number>;
  cooldowns: Record<string, number>;
  logs: { time: number; text: string }[];
  tutorial: number;
  tutorialDone: boolean;
  emergencyCharges: number;
  relaunchGrace: number;
  stats: WarStats;
  result: WarResult | null;
}
