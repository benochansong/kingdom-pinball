import { PHYSICS } from "../config/physics";
import type { TargetDefinition } from "../data/table";

export class ComboManager {
  count = 0;
  max = 0;
  lastHit = -Infinity;
  get multiplier(): number {
    return this.count >= 20
      ? 5
      : this.count >= 10
        ? 3
        : this.count >= 5
          ? 2
          : this.count >= 3
            ? 1.5
            : 1;
  }
  tick(now: number): void {
    if (now - this.lastHit >= PHYSICS.comboWindowMs) this.reset();
  }
  hit(now: number): void {
    this.tick(now);
    this.count++;
    this.max = Math.max(this.max, this.count);
    this.lastHit = now;
  }
  reset(): void {
    this.count = 0;
  }
}
export class ScoreManager {
  score = 0;
  palaceHits = 0;
  hits = 0;
  bonusActive = false;
  readonly combo = new ComboManager();
  private cooldown = new Map<string, number>();
  private visited = new Set<string>();
  hit(
    target: TargetDefinition,
    now: number,
    enabled = true,
  ): { points: number; royal: boolean } | undefined {
    if (
      !enabled ||
      now - (this.cooldown.get(target.id) ?? -Infinity) <
        PHYSICS.bumperCooldownMs
    )
      return;
    if (target.kind === "bonus" && !this.bonusActive) return;
    this.cooldown.set(target.id, now);
    this.combo.hit(now);
    const points = Math.round(target.points * this.combo.multiplier);
    this.score += points;
    this.hits++;
    if (["forest", "stone", "gold", "crystal"].includes(target.kind))
      this.visited.add(target.kind);
    if (this.visited.size === 4) {
      this.bonusActive = true;
      this.visited.clear();
    }
    if (target.kind === "bonus") this.bonusActive = false;
    let royal = false;
    if (target.kind === "palace") {
      this.palaceHits++;
      if (this.palaceHits % 5 === 0) {
        this.score += 3000;
        royal = true;
      }
    }
    return { points, royal };
  }
}
