import type { ResourceId } from "../config/economy";
import type { UnitKind, Formation } from "../army/types";
import type { Element, Spell } from "../magic/types";
import type { WarOrder, Lane } from "../war/types";
export const PROTOCOL = "kingdom-10.1";
export type OnlineMode = "duel" | "survival" | "raid";
export interface RoomRules {
  mode: OnlineMode;
  preparation: number;
  limit: number;
  magic: boolean;
  multiball: boolean;
}
export const DEFAULT_RULES: RoomRules = {
  mode: "duel",
  preparation: 120,
  limit: 1800,
  magic: true,
  multiball: true,
};
export type GameCommand =
  | { type: "input"; left: boolean; right: boolean; launch: boolean }
  | { type: "nudge" | "battleReady" | "surrender" }
  | { type: "build"; kind: string; x: number; y: number; angle: number }
  | { type: "upgrade"; id: string; level: number }
  | { type: "train"; id: string; kind: UnitKind; count: number }
  | { type: "order"; order: WarOrder; lane: Lane }
  | { type: "formation"; formation: Formation }
  | { type: "repair"; id: string }
  | { type: "element"; element: Element }
  | { type: "spell"; spell: Spell }
  | { type: "multi"; storm: boolean }
  | { type: "research"; id: string }
  | { type: "transfer"; resource: ResourceId; amount: number }
  | { type: "ping"; signal: number; x: number; y: number };
export interface OnlineProfile {
  id: string;
  name: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  games: number;
  wave: number;
}
export interface RoomView {
  code: string;
  state: "WAITING" | "READY" | "RUNNING" | "FINISHED";
  rules: RoomRules;
  players: { id: string; name: string; ready: boolean; connected: boolean }[];
}
export type ClientMessage =
  | { type: "auth"; version: string; token?: string; name?: string }
  | { type: "create"; rules: RoomRules }
  | { type: "join"; code: string }
  | {
      type:
        | "ready"
        | "leave"
        | "queue"
        | "cancelQueue"
        | "history"
        | "profile"
        | "leaderboard";
    }
  | { type: "command"; match: string; seq: number; command: GameCommand }
  | { type: "latency"; at: number }
  | { type: "report"; target: string; reason: string };
export interface BallView {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  element: string;
}
export interface BuildingView {
  id: string;
  type: string;
  x: number;
  y: number;
  angle: number;
  level: number;
  disabled?: boolean;
}
export interface UnitView {
  id: string;
  kind: string;
  side: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: string;
}
export interface StructureView {
  id: string;
  type: string;
  side: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  castle: boolean;
}
export interface MatchResult {
  id: string;
  mode: OnlineMode;
  winner: number | null;
  reason: string;
  seconds: number;
  castles: number[];
  wave: number;
  stats: unknown[];
  at: string;
}
export interface Snapshot {
  boss?: {
    id: string;
    hp: number;
    maxHp: number;
    armor: number;
    phase: number;
    warning: { x: number; y: number; at: number; kind: string } | null;
  };
  type: "snapshot";
  match: string;
  tick: number;
  ack: number;
  time: number;
  seat: number;
  preparation: number;
  wave: number;
  self: {
    balls: BallView[];
    flippers: number[];
    charge: number;
    resources: Record<ResourceId, number>;
    buildings: BuildingView[];
    queues: unknown;
    work: { type: string; x: number; y: number; remaining: number }[];
    magic: unknown;
    hits: number;
    score: number;
    energyWait: number;
    launched?: boolean;
    rescue?: import("../systems/RescueCannon").RescueData;
    protection?: import("../systems/BallProtection").ProtectionData;
  };
  opponent: {
    balls: BallView[];
    flippers: number[];
    rescue?: import("../systems/RescueCannon").RescueData;
  };
  battlefield: {
    units: UnitView[];
    structures: StructureView[];
    effects: { x: number; y: number; type: string }[];
  };
  signals: {
    seat: number;
    signal: number;
    x: number;
    y: number;
    until: number;
  }[];
  result: MatchResult | null;
}
export type ServerMessage =
  | { type: "auth"; token: string; profile: OnlineProfile }
  | { type: "room"; room: RoomView }
  | { type: "error"; message: string; seq?: number }
  | { type: "queued" | "left" }
  | { type: "latency"; at: number }
  | { type: "history"; matches: MatchResult[] }
  | { type: "profile"; profile: OnlineProfile }
  | { type: "leaderboard"; players: OnlineProfile[] }
  | Snapshot;
export const isRecord = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
export function roomRules(raw: unknown): RoomRules {
  if (!isRecord(raw)) throw Error("방 설정 형식이 올바르지 않습니다.");
  if (!["duel", "survival", "raid"].includes(String(raw.mode)))
    throw Error("지원하지 않는 모드입니다.");
  const preparation = raw.preparation,
    limit = raw.limit;
  if (
    typeof preparation !== "number" ||
    ![60, 120, 180].includes(preparation) ||
    typeof limit !== "number" ||
    ![900, 1800].includes(limit) ||
    typeof raw.magic !== "boolean" ||
    typeof raw.multiball !== "boolean"
  )
    throw Error("허용되지 않은 방 설정입니다.");
  return {
    mode: raw.mode as OnlineMode,
    preparation,
    limit,
    magic: raw.magic,
    multiball: raw.multiball,
  };
}
