export const PINBALL_DIFFICULTIES = ["beginner", "normal", "expert"] as const;
export type PinballDifficulty = (typeof PINBALL_DIFFICULTIES)[number];
export const PINBALL_PROTECTION = {
  beginner: { seconds: 12, firstSeconds: 15, saves: 2, kickbackHits: 5 },
  normal: { seconds: 8, firstSeconds: 10, saves: 1, kickbackHits: 8 },
  expert: { seconds: 3, firstSeconds: 3, saves: 1, kickbackHits: 12 },
} as const;
// Shared safe geometry; difficulty changes protection, not existing saved footprints.
export const OUTLANE_GUARDS = [
  { x: 110, y: 781, radius: 18 },
  { x: 466, y: 781, radius: 18 },
];
export const SLING = { inward: 3, upward: 4.5, cooldownMs: 180 };
export const GUARD_REBOUND = { speed: 500, cooldownMs: 500 };
export function pinballDifficulty(value: unknown): PinballDifficulty {
  return PINBALL_DIFFICULTIES.includes(value as PinballDifficulty)
    ? (value as PinballDifficulty)
    : "normal";
}
