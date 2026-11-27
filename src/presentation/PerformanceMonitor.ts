import { QUALITIES, type Quality } from "./settings";
/** Presentation-only budget. Never changes simulation delta or update frequency. */
export class PerformanceMonitor {
  quality: Quality = "high";
  private samples: number[] = [];
  private elapsed = 0;
  private slow = 0;
  private requested: Quality = "high";
  private lastChange = 0;
  private clock = 0;
  report = { fps: 0, p50: 0, p95: 0, p99: 0, samples: 0 };
  update(ms: number, requested: Quality, automatic: boolean, active: boolean) {
    if (requested !== this.requested || !automatic) {
      this.quality = requested;
      this.requested = requested;
      this.slow = 0;
    }
    if (!active || !Number.isFinite(ms) || ms <= 0 || ms > 250) return;
    this.clock += ms;
    this.elapsed += ms;
    this.samples.push(ms);
    if (this.samples.length > 600) this.samples.shift();
    if (this.elapsed < 5000) return;
    this.elapsed = 0;
    const ordered = [...this.samples].sort((a, b) => a - b);
    const p = (q: number) =>
      ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * q))] ??
      0;
    this.report = {
      fps:
        1000 / (this.samples.reduce((a, b) => a + b, 0) / this.samples.length),
      p50: p(0.5),
      p95: p(0.95),
      p99: p(0.99),
      samples: this.samples.length,
    };
    this.slow = this.report.p95 > 30 ? this.slow + 1 : 0;
    if (automatic && this.slow >= 3 && this.clock - this.lastChange >= 20000) {
      this.quality =
        QUALITIES[Math.max(0, QUALITIES.indexOf(this.quality) - 1)];
      this.lastChange = this.clock;
      this.slow = 0;
    }
  }
}
