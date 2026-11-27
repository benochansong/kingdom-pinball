import type { TargetKind } from "../data/table";
import type { ResourceId } from "../config/economy";
import type { BattleRecord } from "../army/types";

/** The single extension seam for later resource, building, and battle systems. */
export interface GameEvents {
  presentationSkip: Record<string, never>;
  presentationResult: { won: boolean };
  battleResult: BattleRecord;
  militarySound: { kind: string };
  construction: { kind: "build" | "invalid" | "select" | "demolish" };
  hit: {
    id: string;
    kind: TargetKind;
    x: number;
    y: number;
    points: number;
    combo: number;
    multiplier: number;
  };
  royal: { x: number; y: number; points: number };
  drain: { remaining: number };
  launch: { power: number };
  rescue: {
    phase: import("../systems/RescueCannon").RescuePhase;
    side: import("../config/rescue").CannonSide;
    x: number;
    y: number;
    remaining: number;
  };
  ballProtection: { kind: "save" | "kickback"; x: number; y: number };
  flipper: { side: "left" | "right" };
  impact: { x: number; y: number; speed: number };
  message: { text: string; tone?: "gold" | "warning" };
  state: { state: GameState };
  production: {
    resource: ResourceId;
    amount: number;
    overflow: number;
    multiplier: number;
    strength: number;
    x: number;
    y: number;
  };
}
export type GameState = "menu" | "playing" | "paused" | "over" | "relaunch";
export class EventBus {
  private listeners = new Map<
    keyof GameEvents,
    Set<(payload: never) => void>
  >();
  on<K extends keyof GameEvents>(
    type: K,
    listener: (payload: GameEvents[K]) => void,
  ): () => void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener as (payload: never) => void);
    this.listeners.set(type, set);
    return () => {
      set.delete(listener as (payload: never) => void);
    };
  }
  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    this.listeners.get(type)?.forEach((listener) => listener(payload as never));
  }
  clear(): void {
    this.listeners.clear();
  }
}
