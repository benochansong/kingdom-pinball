import type { MagicData, StatusKind, Status } from "./types";
export class StatusEffectManager {
  constructor(
    private data: MagicData,
    private now: () => number,
  ) {}
  get(target: string, kind: StatusKind) {
    return this.data.statuses.find(
      (s) => s.target === target && s.kind === kind && s.until > this.now(),
    );
  }
  add(target: string, kind: StatusKind, duration: number, power = 1): Status {
    let s = this.get(target, kind);
    if (s) {
      s.stacks = Math.min(3, s.stacks + 1);
      s.until = this.now() + duration;
      s.power = Math.max(s.power, power);
    } else {
      s = {
        target,
        kind,
        until: this.now() + duration,
        stacks: 1,
        next: this.now() + 500,
        power,
      };
      if (this.data.statuses.length >= 600) this.data.statuses.shift();
      this.data.statuses.push(s);
    }
    this.data.stats.statuses++;
    return s;
  }
  consume(target: string, kind: StatusKind) {
    this.data.statuses = this.data.statuses.filter(
      (s) => s.target !== target || s.kind !== kind,
    );
  }
  clean(target: string) {
    this.data.statuses = this.data.statuses.filter(
      (s) => s.target !== target || ["shield", "blessing"].includes(s.kind),
    );
  }
  prune(alive: (id: string) => boolean) {
    this.data.statuses = this.data.statuses.filter(
      (s) => s.until > this.now() && alive(s.target),
    );
  }
  movement(target: string) {
    return this.get(target, "freeze") || this.get(target, "shock")
      ? 0
      : this.get(target, "chill")
        ? 0.65
        : 1;
  }
  interval(target: string) {
    return this.get(target, "chill") ? 1.4 : 1;
  }
}
