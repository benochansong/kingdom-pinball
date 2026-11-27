import type { GameStateManager } from "../core/GameStateManager";

/** Original synthesized sounds and modal melody; no external audio assets. */
export class AudioManager {
  private context?: AudioContext;
  private master?: GainNode;
  private music?: GainNode;
  private effects?: GainNode;
  private nextNote = 0;
  private note = 0;
  private militaryAt = 0;
  private disposers: (() => void)[] = [];
  constructor(private game: GameStateManager) {
    const bus = game.events;
    this.disposers = [
      bus.on("militarySound", ({ kind }) => {
        const now = performance.now();
        if (now - this.militaryAt < 80) return;
        this.militaryAt = now;
        const hz: Record<string, number> = {
          fire: 220,
          ice: 1047,
          thunder: 1245,
          cannon: 100,
          explosion: 65,
          healing: 880,
          golden: 1318,
          phantom: 622,
          chaos: 740,
          storm: 55,
          multiball: 784,
          fireStorm: 196,
          frostField: 988,
          chainLightning: 1397,
          royalShield: 698,
          holyLight: 1175,
          earthquake: 73,
          spawn: 523,
          hit: 155,
          heal: 880,
          death: 130,
          archer: 690,
          mage: 1050,
          healer: 950,
          catapult: 85,
          charge: 180,
          tower: 720,
        };
        this.tone(
          hz[kind] ?? 260,
          0.12,
          kind === "mage" ? "sine" : "triangle",
          0.09,
          kind === "spawn" ? 784 : 90,
        );
      }),
      bus.on("battleResult", ({ outcome }) => {
        (outcome === "victory"
          ? [392, 523, 659, 784]
          : [392, 330, 262]
        ).forEach((hz, i) =>
          this.tone(hz, 0.4, "triangle", 0.16, undefined, i * 0.12),
        );
      }),
      bus.on("construction", ({ kind }) => {
        this.tone(
          kind === "invalid" ? 130 : kind === "select" ? 440 : 260,
          0.14,
          "triangle",
          0.12,
          kind === "build" ? 660 : 90,
        );
      }),
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
    const regional: Record<
      string,
      { ratio: number; tempo: number; wave: OscillatorType }
    > = {
      greenwood: { ratio: 1, tempo: 1, wave: "triangle" },
      shadow: { ratio: 0.75, tempo: 1.12, wave: "sine" },
      iron: { ratio: 0.67, tempo: 0.88, wave: "triangle" },
      desert: { ratio: 1.12, tempo: 1.06, wave: "sine" },
      frost: { ratio: 1.5, tempo: 1.22, wave: "sine" },
      volcano: { ratio: 0.5, tempo: 0.82, wave: "triangle" },
      arcane: { ratio: 1.33, tempo: 0.95, wave: "sine" },
      dark: { ratio: 0.56, tempo: 0.78, wave: "triangle" },
    };
    const theme = regional[this.game.sessionExtension?.regionId ?? "greenwood"];
    const bossPhase = this.game.sessionExtension?.bossPhase?.() ?? 0;
    const melody = [
      293.66, 440, 349.23, 392, 293.66, 261.63, 220, 261.63, 293.66, 349.23,
      440, 523.25, 440, 392, 349.23, 261.63,
    ];
    this.tone(
      melody[this.note % melody.length] * theme.ratio,
      1.2,
      theme.wave,
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
    if (this.game.magic?.data.multi?.storm)
      this.tone(
        65 + (this.note % 3) * 33,
        0.22,
        "sawtooth",
        0.035,
        35,
        0,
        true,
      );
    if (bossPhase)
      this.tone(55 + bossPhase * 11, 0.18, "triangle", 0.045, 30, 0, true);
    this.note++;
    const combat = this.game.army?.data.battle;
    if (combat)
      this.tone(this.note % 2 ? 85 : 65, 0.15, "triangle", 0.1, 35, 0, true);
    this.nextNote =
      now +
      theme.tempo *
        (bossPhase ? 0.9 : 1) *
        (combat
          ? combat.enemies.filter((u) => u.hp > 0).length > 10
            ? 0.28
            : 0.36
          : this.game.army?.population
            ? 0.46
            : 0.52);
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
