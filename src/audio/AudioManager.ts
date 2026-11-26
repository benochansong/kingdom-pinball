import type { GameStateManager } from "../core/GameStateManager";

/** Original synthesized sounds and modal melody; no external audio assets. */
export class AudioManager {
  private context?: AudioContext;
  private master?: GainNode;
  private music?: GainNode;
  private effects?: GainNode;
  private nextNote = 0;
  private note = 0;
  private disposers: (() => void)[] = [];
  constructor(private game: GameStateManager) {
    const bus = game.events;
    this.disposers = [
      bus.on('construction',({kind})=>{this.tone(kind==='invalid'?130:kind==='select'?440:260,.14,'triangle',.12,kind==='build'?660:90);}),
      bus.on("flipper", () => this.tone(95, 0.065, "triangle", 0.25, 35)),
      bus.on("launch", ({ power }) => {
        this.tone(120 + power * 100, 0.28, "sawtooth", 0.13, 900);
        this.tone(740, 0.3, "sine", 0.12, 230);
      }),
      bus.on("impact", () =>
        this.tone(190 + Math.random() * 160, 0.05, "triangle", 0.08, 100),
      ),
      bus.on("hit", ({ kind, combo }) => {
        const hz = {
          forest: 330,
          stone: 150,
          gold: 740,
          crystal: 990,
          palace: 440,
          bonus: 880,
          farm: 520,
          core: 1175,
        }[kind];
        this.tone(
          hz,
          0.22,
          kind === "stone" ? "triangle" : "sine",
          0.2,
          hz * 0.65,
        );
        this.tone(hz * 1.5, 0.25, "sine", 0.08);
        if ([3, 5, 10, 20].includes(combo))
          [1, 1.25, 1.5].forEach((m, i) =>
            this.tone(523 * m, 0.23, "triangle", 0.12, undefined, i * 0.09),
          );
      }),
      bus.on("royal", () =>
        [392, 523, 659, 784].forEach((hz, i) =>
          this.tone(hz, 0.4, "triangle", 0.24, undefined, i * 0.14),
        ),
      ),
      bus.on("drain", () => this.tone(280, 0.6, "triangle", 0.18, 70)),
      bus.on("state", ({ state }) => {
        if (state === "over")
          [392, 330, 262, 196].forEach((hz, i) =>
            this.tone(hz, 0.5, "triangle", 0.13, undefined, i * 0.2),
          );
      }),
    ];
  }
  unlock(): void {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.music = this.context.createGain();
        this.effects = this.context.createGain();
        this.music.connect(this.master);
        this.effects.connect(this.master);
        this.master.connect(this.context.destination);
        this.nextNote = this.context.currentTime;
      }
      if (this.context.state === "suspended")
        void this.context.resume().catch(() => {});
      this.sync();
    } catch {
      /* Silent play remains available when Web Audio is unavailable. */
    }
  }
  sync(): void {
    if (!this.context || !this.master || !this.music || !this.effects) return;
    const s = this.game.save.data.settings,
      now = this.context.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : 0.65, now, 0.02);
    this.music.gain.setTargetAtTime(
      s.music * (this.game.state === "paused" ? 0.2 : 1),
      now,
      0.05,
    );
    this.effects.gain.setTargetAtTime(s.effects, now, 0.02);
  }
  update(): void {
    this.sync();
    if (
      !this.context ||
      this.context.state !== "running" ||
      this.game.state === "paused"
    )
      return;
    const now = this.context.currentTime;
    if (now < this.nextNote) return;
    const melody = [
      293.66, 440, 349.23, 392, 293.66, 261.63, 220, 261.63, 293.66, 349.23,
      440, 523.25, 440, 392, 349.23, 261.63,
    ];
    this.tone(
      melody[this.note % melody.length],
      1.2,
      "triangle",
      0.09,
      undefined,
      0,
      true,
    );
    if (this.note % 4 === 0)
      this.tone(
        this.note % 8 === 0 ? 146.83 : 130.81,
        2.6,
        "sine",
        0.1,
        undefined,
        0,
        true,
      );
    this.note++;
    this.nextNote = now + 0.52;
  }
  private tone(
    hz: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    endHz?: number,
    delay = 0,
    music = false,
  ): void {
    const ctx = this.context,
      output = music ? this.music : this.effects;
    if (!ctx || !output || ctx.state !== "running") return;
    const osc = ctx.createOscillator(),
      gain = ctx.createGain(),
      start = ctx.currentTime + delay;
    osc.type = type;
    osc.frequency.setValueAtTime(hz, start);
    if (endHz)
      osc.frequency.exponentialRampToValueAtTime(endHz, start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    gain.connect(output);
    osc.start(start);
    osc.stop(start + duration + 0.03);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  dispose(): void {
    this.disposers.forEach((fn) => fn());
    void this.context?.close();
  }
}
