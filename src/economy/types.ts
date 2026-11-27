import type { ResourceAmounts } from "../config/economy";
import type { BuildingData } from "../building/types";
import type { ArmyData } from "../army/types";
export interface FacilityState {
  level: number;
  hits: number;
  yielded: number;
  lastHit: number;
  recent: number[];
  overloadedUntil: number;
}
export interface SpecialState {
  count: number;
  last: string;
  timestamps: number[];
  seen: Record<string, number>;
  readyAt: number;
  achievements: number;
}
import type { MagicData } from "../magic/types";
export interface EconomyData {
  rescue?: import("../systems/RescueCannon").RescueData;
  pinball?: import("../systems/BallProtection").ProtectionData;
  magic?: MagicData;
  version: 4;
  army?: ArmyData;
  building?: BuildingData;
  id: string;
  resources: ResourceAmounts;
  storageLevel: number;
  rank: number;
  produced: ResourceAmounts;
  spent: ResourceAmounts;
  bought: ResourceAmounts;
  sold: ResourceAmounts;
  overflow: ResourceAmounts;
  facilities: Record<string, FacilityState>;
  claimed: string[];
  specials: Record<string, SpecialState>;
  score: number;
  palaceHits: number;
  totalHits: number;
  scoreComboMax: number;
  combo: { count: number; max: number; last: number };
  time: number;
  launchState: "ready" | "inflight" | "awaiting" | "ended";
  losses: number;
  launchedAt: number;
  survivalMs: number;
  royalCount: number;
  royalUntil: number;
  event: { index: number; until: number } | null;
  nextEvent: number;
  validHits: number;
  lastEventHit: number;
  trades: { id: string; batches: number; time: number }[];
  tradeCount: number;
  tutorialStep: number;
  tutorialDone: boolean;
  createdAt: string;
}
export type FacilityStatus =
  "READY" | "ACTIVE" | "BONUS" | "OVERLOADED" | "RECOVERING";
