import {
  PINBALL_PROTECTION,
  pinballDifficulty,
  type PinballDifficulty,
} from "../config/pinball";

export interface ProtectionData {
  difficulty: PinballDifficulty;
  first: boolean;
  remaining: number;
  enteredAt: number | null;
  runStartedAt: number | null;
  expiresAt: number | null;
  saves: number;
  kickbacks: number;
  left: number;
  right: number;
  leftHits: number;
  rightHits: number;
  lastHit: number;
  lastTarget: string;
  kickUntil: number;
}
export function freshProtection(
  difficulty: PinballDifficulty = "normal",
  first = true,
): ProtectionData {
  return {
    difficulty,
    first,
    remaining: PINBALL_PROTECTION[difficulty].saves,
    enteredAt: null,
    runStartedAt: null,
    expiresAt: null,
    saves: 0,
    kickbacks: 0,
    left: 0,
    right: 0,
    leftHits: 0,
    rightHits: 0,
    lastHit: -1000,
    lastTarget: "",
    kickUntil: 0,
  };
}
export function sanitizeProtection(
  raw: unknown,
  now: number,
): ProtectionData | undefined {
  if (!raw || typeof raw !== "object") return;
  const r = raw as Record<string, unknown>,
    d = freshProtection(pinballDifficulty(r.difficulty), r.first === true);
  const number = (key: keyof ProtectionData, max: number, fallback = 0) =>
    typeof r[key] === "number" && Number.isFinite(r[key])
      ? Math.max(0, Math.min(max, r[key] as number))
      : fallback;
  d.remaining = Math.floor(
    number("remaining", PINBALL_PROTECTION[d.difficulty].saves),
  );
  d.enteredAt = r.enteredAt === null ? null : number("enteredAt", now);
  d.runStartedAt =
    r.runStartedAt === null
      ? null
      : number("runStartedAt", now, d.enteredAt ?? 0);
  // Preserve an already expired timer. Never grant a fresh window during migration.
  d.expiresAt =
    r.expiresAt === null && d.enteredAt === null
      ? null
      : number("expiresAt", now + 15000);
  for (const k of ["saves", "kickbacks"] as const)
    d[k] = Math.floor(number(k, 1e9));
  for (const k of ["left", "right"] as const) d[k] = Math.floor(number(k, 1));
  for (const k of ["leftHits", "rightHits"] as const)
    d[k] = Math.floor(
      number(k, PINBALL_PROTECTION[d.difficulty].kickbackHits - 1),
    );
  d.lastHit = number("lastHit", now, -1000);
  d.lastTarget =
    typeof r.lastTarget === "string" ? r.lastTarget.slice(0, 100) : "";
  d.kickUntil = number("kickUntil", now + 2000);
  return d;
}
export class BallProtection {
  constructor(public data = freshProtection()) {}
  next(difficulty = this.data.difficulty) {
    const { saves, kickbacks } = this.data;
    this.data = { ...freshProtection(difficulty, false), saves, kickbacks };
  }
  enter(now: number) {
    const d = this.data;
    if (d.enteredAt !== null) return false;
    d.enteredAt = now;
    d.expiresAt =
      now +
      1000 *
        PINBALL_PROTECTION[d.difficulty][d.first ? "firstSeconds" : "seconds"];
    return true;
  }
  seconds(now: number) {
    return Math.max(0, ((this.data.expiresAt ?? now) - now) / 1000);
  }
  save(now: number) {
    if (
      !this.data.remaining ||
      this.data.enteredAt === null ||
      this.seconds(now) <= 0
    )
      return false;
    this.data.remaining--;
    this.data.saves++;
    return true;
  }
  hit(target: string, x: number, now: number) {
    const d = this.data;
    // Alternate real targets, at least one second apart; passive posts never call this.
    if (target === d.lastTarget || now - d.lastHit < 1000) return;
    d.lastTarget = target;
    d.lastHit = now;
    const side = x < 288 ? "left" : "right",
      key = side === "left" ? "leftHits" : "rightHits";
    if (d[side]) return;
    if (++d[key] >= PINBALL_PROTECTION[d.difficulty].kickbackHits) {
      d[key] = 0;
      d[side] = 1;
    }
  }
  kick(side: "left" | "right", now: number) {
    const d = this.data;
    if (!d[side] || now < d.kickUntil) return false;
    d[side]--;
    d.kickbacks++;
    d.kickUntil = now + 2000;
    return true;
  }
}
