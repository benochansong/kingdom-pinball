import type { Cost } from "../config/economy";
export type Element =
  | "steel"
  | "fire"
  | "ice"
  | "thunder"
  | "cannon"
  | "explosion"
  | "healing"
  | "golden"
  | "phantom"
  | "chaos";
export type Spell =
  | "fireStorm"
  | "frostField"
  | "chainLightning"
  | "royalShield"
  | "holyLight"
  | "earthquake";
export type StatusKind =
  "burn" | "chill" | "freeze" | "shock" | "break" | "blessing" | "shield";
export interface Status {
  target: string;
  kind: StatusKind;
  until: number;
  stacks: number;
  next: number;
  power: number;
}
export interface BallState {
  id: string;
  bodyId: number;
  type: Element;
  until: number;
  hits: number;
  phaseLeft: number;
  temporary: boolean;
  source: "normal" | "multiball" | "storm";
  baseMass: number;
}
export interface MagicStats {
  uses: Partial<Record<Element, number>>;
  hits: Partial<Record<Element, number>>;
  damage: Partial<Record<Element, number>>;
  spells: Partial<Record<Spell, number>>;
  dot: number;
  statuses: number;
  healing: number;
  shield: number;
  combos: Record<string, number>;
  multiballs: number;
  maxBalls: number;
  multiHits: number;
  storms: number;
  stormDamage: number;
  stormResources: number;
  mana: number;
  charge: number;
  fireKills: number;
  frozenCharges: number;
  walls: number;
}
export interface MagicData {
  version: 1;
  charge: number;
  multiCharge: number;
  stormCharge: number;
  research: Record<string, number>;
  task: { id: string; level: number; progress: number; paid: Cost } | null;
  loadout: {
    balls: Element[];
    spells: Spell[];
    multi: string;
    storm: string;
    autoAim: boolean;
  };
  cooldowns: Record<string, number>;
  statuses: Status[];
  fields: { spell: Spell; x: number; y: number; until: number; next: number }[];
  multi: {
    count: number;
    until: number;
    started: number;
    storm: boolean;
    variant: string;
    saves: number;
    pending: Element[];
  } | null;
  nextBall: number;
  stats: MagicStats;
  achievements: string[];
  tutorial: number;
  tutorialDone: boolean;
  training: number[];
  history: { element: Element; target: string; at: number }[];
  enemyCast: { spell: Spell; x: number; y: number; at: number } | null;
  nextAI: number;
}
