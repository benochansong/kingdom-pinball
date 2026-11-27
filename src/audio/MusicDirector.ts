import type { GameStateManager } from "../core/GameStateManager";
export type MusicMood =
  | "peace"
  | "preparation"
  | "battle"
  | "siege"
  | "critical"
  | "storm"
  | "victory"
  | "defeat";
export const MUSIC_TRACKS: Record<
  MusicMood,
  {
    id: string;
    name: string;
    path: string | null;
    loop: boolean;
    volume: number;
    fade: number;
    license: string;
  }
> = Object.fromEntries(
  [
    "peace",
    "preparation",
    "battle",
    "siege",
    "critical",
    "storm",
    "victory",
    "defeat",
  ].map((id) => [
    id,
    {
      id,
      name: `Royal ${id}`,
      path: null,
      loop: !["victory", "defeat"].includes(id),
      volume: 0.1,
      fade: 1.2,
      license: "Original procedural score; no external samples",
    },
  ]),
) as any;
export function musicMood(g: GameStateManager): MusicMood {
  const w = g.war;
  if (w?.data.result)
    return w.data.result.outcome === "victory" ? "victory" : "defeat";
  if (g.state === "over") return "defeat";
  if (g.state === "menu") return "peace";
  if (g.magic?.data.multi?.storm) return "storm";
  if (w && w.castle("ally").hp / w.castle("ally").maxHp < 0.25)
    return "critical";
  if (w?.data.phase === "siege") return "siege";
  if (
    (g.sessionExtension?.bossPhase?.() ?? 0) > 0 ||
    w?.army.combat.units.some(
      (u) => u.hp > 0 && u.side === "enemy" && u.y > 400,
    )
  )
    return "battle";
  if (w?.preparing) return "preparation";
  if (g.army?.data.battle || (w && w.data.time > 60000)) return "battle";
  return "peace";
}
export class MusicDirector {
  mood: MusicMood = "peace";
  private changed = -Infinity;
  select(next: MusicMood, now: number, force = false) {
    if (
      next !== this.mood &&
      (force ||
        now - this.changed >= 5000 ||
        ["critical", "storm", "victory", "defeat"].includes(next))
    ) {
      this.mood = next;
      this.changed = now;
      return true;
    }
    return false;
  }
}
