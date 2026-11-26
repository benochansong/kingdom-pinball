import type { Cost } from "../config/economy";
import type { FacilityState } from "../economy/types";
export type BuildingCategory =
  "economy" | "operation" | "physics" | "magic" | "military";
export interface BuildingConfig {
  id: string;
  name: string;
  category: BuildingCategory;
  cost: Cost;
  rank: number;
  width: number;
  height: number;
  shape: "circle" | "rect";
  restitution: number;
  limit: number;
  description: string;
  production?: string;
  sensor?: boolean;
}
export interface BuildingEntity {
  id: string;
  type: string;
  x: number;
  y: number;
  angle: number;
  level: number;
  paid: Cost;
  production: FacilityState;
  charge: number;
  lastHit: number;
  readyAt: number;
}
export interface BlueprintItem {
  type: string;
  x: number;
  y: number;
  angle: number;
  level: number;
}
export interface Blueprint {
  name: string;
  items: BlueprintItem[];
}
export interface BuildingData {
  version: 1;
  nextId: number;
  buildings: BuildingEntity[];
  territories: string[];
  presets: Blueprint[];
  claimed: string[];
  tutorial: number;
  tutorialDone: boolean;
  stats: {
    built: number;
    moved: number;
    rotated: number;
    demolished: number;
    tests: number;
    upgrades: number;
    reflectorCombo: number;
  };
}
export const freshBuildings = (): BuildingData => ({
  version: 1,
  nextId: 1,
  buildings: [],
  territories: ["central"],
  presets: [],
  claimed: [],
  tutorial: 0,
  tutorialDone: false,
  stats: {
    built: 0,
    moved: 0,
    rotated: 0,
    demolished: 0,
    tests: 0,
    upgrades: 0,
    reflectorCombo: 0,
  },
});
export const freshProduction = (): FacilityState => ({
  level: 1,
  hits: 0,
  yielded: 0,
  lastHit: -10000,
  recent: [],
  overloadedUntil: 0,
});
