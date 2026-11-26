export class TiltSystem {
  heat = 0;
  tilted = false;
  private lastNudge = -Infinity;
  nudge(now: number): boolean {
    if (this.tilted || now - this.lastNudge < 650) return false;
    this.lastNudge = now;
    this.heat = Math.min(100, this.heat + 38);
    this.tilted = this.heat >= 100;
    return true;
  }
  update(seconds: number): void { if (!this.tilted) this.heat = Math.max(0, this.heat - seconds * 7); }
  reset(): void { this.heat = 0; this.tilted = false; this.lastNudge = -Infinity; }
}
