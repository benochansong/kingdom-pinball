import type { Cost } from "../config/economy";
export type UnitKind =
  | "swordsman"
  | "spearman"
  | "archer"
  | "guard"
  | "knight"
  | "mage"
  | "healer"
  | "catapult";
export type Command = "attack" | "defend" | "hold" | "retreat" | "regroup";
export type Formation =
  "standard" | "shield" | "spear" | "assault" | "ranged" | "siege";
export type UnitState =
  | "idle"
  | "moving"
  | "windup"
  | "attacking"
  | "healing"
  | "retreating"
  | "stunned"
  | "dead";
export interface UnitEntity {
  kingdomId?: string;
  id: string;
  kind: UnitKind;
  side: "ally" | "enemy";
  x: number;
  y: number;
  hp: number;
  xp: number;
  rank: number;
  squad: string;
  state: UnitState;
  target?: string;
  cooldown: number;
  windup: number;
  stun: number;
  charge: boolean;
  nextBoost: number;
  damage: number;
  healing: number;
  kills: number;
  facing: number;
  spawnAt: number;
  lastSphere: number;
  path: { x: number; y: number }[];
  pathAt: number;
  holdX: number;
  holdY: number;
}
export interface QueueEntry {
  id: string;
  kind: UnitKind;
  progress: number;
  paid: Cost;
}
export interface ProductionQueue {
  buildingId: string;
  entries: QueueEntry[];
  auto?: UnitKind;
  lastHit: number;
}
export interface ResearchTask {
  id: string;
  level: number;
  progress: number;
}
export interface Projectile {
  id: number;
  from: string;
  target: string;
  side: "ally" | "enemy";
  kind: UnitKind | "tower";
  x: number;
  y: number;
  startX: number;
  startY: number;
  tx: number;
  ty: number;
  age: number;
  duration: number;
  damage: number;
  splash: number;
  heal: boolean;
}
export interface BattleRecord {
  mode: "practice" | "challenge";
  scenario: number;
  outcome: "victory" | "defeat" | "aborted";
  seconds: number;
  initial: number;
  survivors: number;
  losses: number;
  kills: number;
  damage: Record<string, number>;
  healing: Record<string, number>;
  sphereDamage: number;
  combos: number;
  xp: number;
  reward: Cost;
}
export interface BattleState {
  mode: "practice" | "challenge";
  scenario: number;
  time: number;
  wave: number;
  initial: string[];
  enemies: UnitEntity[];
  projectiles: Projectile[];
  nextProjectile: number;
  sphereDamage: number;
  combos: number;
  xp: number;
  rewardEligible: boolean;
  contributions: Record<
    string,
    { damage: number; healing: number; xp: number }
  >;
}
export interface ArmyData {
  ownedSide?: "ally" | "enemy";
  version: 1;
  nextId: number;
  units: UnitEntity[];
  queues: Record<string, ProductionQueue>;
  research: Record<string, number>;
  researchTask: ResearchTask | null;
  morale: number;
  upkeepMs: number;
  starvingMs: number;
  formation: Formation;
  command: Command;
  comboHits: { id: string; time: number }[];
  buffs: Record<string, number>;
  comboReady: Record<string, number>;
  completed: number[];
  attempted: number[];
  claimed: string[];
  battle: BattleState | null;
  lastResult: BattleRecord | null;
  history: BattleRecord[];
  tutorial: number;
  tutorialDone: boolean;
  stats: {
    produced: Record<string, number>;
    hits: number;
    combos: number;
    research: number;
    commands: number;
    defended: boolean;
    advanced: boolean;
    sphereKills: number;
    maxPopulation: number;
    maxPower: number;
    victories: number;
    losses: number;
  };
}
export const freshArmy = (): ArmyData => ({
  version: 1,
  nextId: 1,
  units: [],
  queues: {},
  research: {},
  researchTask: null,
  morale: 70,
  upkeepMs: 0,
  starvingMs: 0,
  formation: "standard",
  command: "regroup",
  comboHits: [],
  buffs: {},
  comboReady: {},
  completed: [],
  attempted: [],
  claimed: [],
  battle: null,
  lastResult: null,
  history: [],
  tutorial: 0,
  tutorialDone: false,
  stats: {
    produced: {},
    hits: 0,
    combos: 0,
    research: 0,
    commands: 0,
    defended: false,
    advanced: false,
    sphereKills: 0,
    maxPopulation: 0,
    maxPower: 0,
    victories: 0,
    losses: 0,
  },
});
