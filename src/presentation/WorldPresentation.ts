import Phaser from "phaser";
import type { GameStateManager } from "../core/GameStateManager";
import type { AudioManager } from "../audio/AudioManager";
import { BuildingVisuals } from "./BuildingVisuals";
import { PerformanceMonitor } from "./PerformanceMonitor";
import { QUALITY_BUDGET } from "./settings";
import type { EffectsManager } from "../effects/EffectsManager";
const COLORS: Record<string, number> = {
  greenwood: 0x80ae84,
  shadow: 0x658e96,
  iron: 0xb4a18b,
  desert: 0xe9c58b,
  frost: 0xc1e7f4,
  volcano: 0xe68b62,
  arcane: 0xb8a4e5,
  dark: 0xaf7382,
};
/** Bounded visual state; never calls a gameplay mutation or changes the fixed step. */
export class WorldPresentation {
  readonly performance = new PerformanceMonitor();
  private environment: Phaser.GameObjects.Graphics;
  private light: Phaser.GameObjects.Graphics;
  private ink: Phaser.GameObjects.Graphics;
  private buildings: BuildingVisuals;
  private banner: Phaser.GameObjects.Text;
  private bannerUntil = 0;
  private lastDecor = 0;
  private time = 0;
  private hp = new Map<string, number>();
  private unitHp = new Map<string, number>();
  private session: unknown;
  private storm = false;
  private boss = "";
  private ready = false;
  private charge = false;
  private decorKey = "";
  private lastCombo = 0;
  private debug: HTMLElement;
  private disposed: (() => void)[] = [];
  constructor(
    private scene: Phaser.Scene,
    private game: GameStateManager,
    private audio: AudioManager,
    private effects: EffectsManager,
  ) {
    this.environment = scene.add.graphics().setDepth(3);
    this.light = scene.add.graphics().setDepth(14);
    this.ink = scene.add.graphics().setDepth(19);
    this.buildings = new BuildingVisuals(scene, game);
    this.banner = scene.add
      .text(300, 70, "", {
        fontFamily: "Georgia",
        fontSize: "20px",
        color: "#ffe8b1",
        stroke: "#122535",
        strokeThickness: 5,
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(26)
      .setVisible(false);
    this.debug = document.createElement("output");
    this.debug.className = "performance-overlay";
    this.debug.hidden = true;
    document.querySelector(".table-frame")?.append(this.debug);
    this.disposed.push(
      game.events.on("presentationSkip", () => this.skip()),
      game.events.on("message", ({ text }) => {
        if (
          /BALL SAV|구출|보호.*공|침공|출격|돌파|승리|패배|STORM|멀티볼/.test(
            text,
          )
        )
          this.announce(text.slice(0, 70));
      }),
      game.events.on("hit", ({ combo }) => {
        if (
          combo !== this.lastCombo &&
          [3, 5, 10, 20, 30, 40, 50].includes(combo)
        ) {
          this.announce(
            [
              "NICE!",
              "GREAT!",
              "AMAZING!",
              "ROYAL COMBO!",
              "LEGENDARY STRIKE!",
              "KINGDOM FRENZY!",
              "UNSTOPPABLE!",
            ][[3, 5, 10, 20, 30, 40, 50].indexOf(combo)],
          );
          this.lastCombo = combo;
        }
      }),
      game.events.on("drain", () =>
        this.announce("CORE LOST · 재발사를 준비하세요."),
      ),
    );
  }
  private announce(text: string) {
    this.banner.setText(text).setVisible(true);
    this.bannerUntil = this.time + 2.4;
  }
  skip() {
    this.bannerUntil = 0;
    this.scene.cameras.main.resetFX();
  }
  draw(delta: number) {
    const g = this.game,
      p = g.save.data.settings.presentation;
    const active = g.state !== "paused" && !document.hidden;
    if (active) this.time += Math.min(delta, 50) / 1000;
    this.performance.update(
      delta,
      p.quality,
      p.autoQuality,
      active && g.state === "playing",
    );
    const quality = this.performance.quality,
      budget = QUALITY_BUDGET[quality];
    this.effects.particleBudget = Math.floor(
      budget.particles * p.particleAmount,
    );
    const session = g.war ?? g.economy ?? g.physics;
    if (session !== this.session) {
      this.session = session;
      this.hp.clear();
      this.unitHp.clear();
      this.boss = "";
      this.storm = false;
      this.ready = false;
      this.effects.clear();
      this.skip();
      this.scene.cameras.main.setScroll(0, 0).setZoom(1);
    }
    this.buildings.draw(quality);
    const decorKey = `${quality}:${p.lighting}:${p.weather}:${g.sessionExtension?.regionId}:${g.sessionExtension?.flatBoard}:${!!g.testBall}`;
    if (
      decorKey !== this.decorKey ||
      this.time * 1000 - this.lastDecor >= budget.interval
    ) {
      this.decorKey = decorKey;
      this.lastDecor = this.time * 1000;
      this.drawEnvironment();
    }
    this.ink.clear();
    const ink = this.ink;
    for (const b of g.displayPhysics.balls) {
      if (p.outline)
        ink
          .lineStyle(2, 0xf5ffff, 0.95)
          .strokeCircle(b.position.x, b.position.y, 12);
    }
    // State transitions generate one cosmetic burst, not repeated damage or bodies.
    const ids = new Set<string>();
    for (const s of g.war?.data.structures ?? []) {
      ids.add(s.id);
      const old = this.hp.get(s.id);
      this.hp.set(s.id, s.hp);
      if (old !== undefined && old > 0 && s.hp <= 0) {
        this.effects.burst(s.x, s.y, 0xc0b49b, s.castle ? 50 : 28, "stone");
        this.effects.popup(
          s.x,
          s.y - 30,
          s.castle ? "KINGDOM FALLEN" : s.defense ? "BREACH!" : "DESTROYED",
          "#f2c68f",
        );
        if (g.save.data.settings.shake && p.shakeAmount > 0)
          this.scene.cameras.main.shake(
            s.castle ? 180 : 90,
            0.003 * p.shakeAmount,
          );
      } else if (old !== undefined && s.hp < old) {
        this.effects.burst(s.x, s.y, 0xd6c69c, 4, "stone");
      }
    }
    for (const id of this.hp.keys()) if (!ids.has(id)) this.hp.delete(id);
    const units = g.army?.combat.units ?? [];
    const alive = new Set<string>();
    for (const u of units) {
      alive.add(u.id);
      const old = this.unitHp.get(u.id);
      this.unitHp.set(u.id, u.hp);
      if (old !== undefined && u.hp < old) {
        ink.lineStyle(2, 0xffd5ad, 0.7).strokeCircle(u.x, u.y, 11);
        if (u.hp <= 0) this.effects.burst(u.x, u.y, 0xc6c1ab, 6);
      }
    }
    for (const id of this.unitHp.keys())
      if (!alive.has(id)) this.unitHp.delete(id);
    const boss = units.find((u) => u.bossName && u.hp > 0);
    if (boss) {
      const x = boss.x,
        y = boss.y,
        r = g.sessionExtension?.regionId ?? "greenwood",
        c = COLORS[r];
      ink.lineStyle(2, c, 0.7).strokeEllipse(x, y + 8, 44, 14);
      if (r === "volcano") {
        ink
          .fillStyle(0xc77955, 0.65)
          .fillTriangle(x, y - 3, x - 34, y - 26, x - 27, y + 8)
          .fillTriangle(x, y - 3, x + 34, y - 26, x + 27, y + 8);
      } else if (r === "iron") {
        ink
          .lineStyle(4, 0xb2babe, 0.8)
          .strokeRoundedRect(x - 15, y - 18, 30, 30, 4);
      } else if (r === "desert") {
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          ink
            .lineStyle(2, 0xf0cb7f, 0.8)
            .lineBetween(
              x + Math.cos(a) * 16,
              y - 8 + Math.sin(a) * 16,
              x + Math.cos(a) * 23,
              y - 8 + Math.sin(a) * 23,
            );
        }
      } else if (r === "frost" || r === "arcane") {
        for (let i = 0; i < 4; i++) {
          const a = this.time * 0.4 + (i * Math.PI) / 2,
            px = x + Math.cos(a) * 24,
            py = y + Math.sin(a) * 12;
          ink
            .fillStyle(c, 0.75)
            .fillTriangle(px, py - 8, px - 4, py, px + 4, py);
        }
      } else if (r === "shadow")
        ink.lineStyle(3, c, 0.35).strokeCircle(x, y - 5, 22);
      else {
        ink
          .fillStyle(c, 0.7)
          .fillTriangle(x - 8, y - 20, x + 8, y - 20, x, y - 32);
      }
    }
    if (boss && this.boss !== boss.id) {
      this.boss = boss.id;
      if (p.cinematics) this.announce(`⚑ ${boss.bossName}`);
    }
    const storm = !!g.magic?.data.multi?.storm;
    if (storm !== this.storm) {
      this.storm = storm;
      if (storm) this.announce("CORE STORM · TEN SPHERES");
      else this.announce("STORM COMPLETE");
    }
    if (storm) {
      const multi = g.magic!.data.multi!;
      ink
        .lineStyle(
          2,
          COLORS[g.sessionExtension?.regionId ?? "arcane"],
          p.reduceFlash ? 0.25 : 0.55,
        )
        .strokeRoundedRect(72, 95, 448, 610, 22);
      if (quality !== "low")
        for (let i = 0; i < 8; i++) {
          const a = this.time * 0.4 + (i * Math.PI) / 4;
          ink
            .lineStyle(1, 0xd8c3fa, 0.25)
            .lineBetween(
              300 + Math.cos(a) * 55,
              420 + Math.sin(a) * 55,
              300 + Math.cos(a) * 80,
              420 + Math.sin(a) * 80,
            );
        }
      void multi;
    }
    const ready = (g.magic?.data.stormCharge ?? 0) >= 100;
    if (ready && !this.ready) this.announce("CORE STORM READY");
    this.ready = ready;
    if (g.charge > 0.98 && !this.charge) {
      this.effects.burst(554, 803, 0xc7ecff, 10);
      this.charge = true;
    }
    if (g.charge < 0.9) this.charge = false;
    this.banner
      .setVisible(this.time < this.bannerUntil && g.state !== "menu")
      .setAlpha(Math.min(1, Math.max(0, (this.bannerUntil - this.time) * 2)));
    this.debug.hidden = !p.debug;
    if (p.debug) {
      const r = this.performance.report;
      this.debug.textContent = `${quality.toUpperCase()} · ${r.fps.toFixed(1)} FPS\np50 ${r.p50.toFixed(1)} / p95 ${r.p95.toFixed(1)} / p99 ${r.p99.toFixed(1)} ms\n${r.samples} frames · bodies ${g.physics.engine.world.bodies.length}\nunits ${units.filter((u) => u.hp > 0).length} · particles ${this.effects.activeParticles}\naudio ${this.audio.activeVoices}`;
    }
  }
  private drawEnvironment() {
    const g = this.game,
      p = g.save.data.settings.presentation,
      e = this.environment,
      l = this.light,
      t = this.time;
    e.clear();
    l.clear();
    if (g.sessionExtension?.flatBoard || g.testBall) return;
    const region = g.sessionExtension?.regionId ?? "greenwood",
      color = COLORS[region] ?? COLORS.greenwood,
      budget = QUALITY_BUDGET[this.performance.quality];
    for (let i = 0; i < budget.decorations; i++) {
      const x = i % 2 ? 494 + (i % 3) * 5 : 75 + (i % 3) * 8,
        y = 140 + Math.floor(i / 2) * 23;
      e.fillStyle(0x000e1c, budget.shadow).fillEllipse(x + 4, y + 10, 24, 8);
      if (region === "greenwood" || region === "shadow") {
        const sway = Math.sin(t + i) * 2;
        e.fillStyle(region === "shadow" ? 0x2e5651 : 0x4f7e62).fillTriangle(
          x + sway,
          y - 22,
          x - 11,
          y + 8,
          x + 12,
          y + 8,
        );
        e.lineStyle(2, 0xa3a17b, 0.5).lineBetween(x, y - 12, x, y + 15);
        if (region === "shadow")
          e.fillStyle(0xa8e3c6, 0.2).fillCircle(x + 8, y, 2);
      } else if (region === "desert") {
        e.fillStyle(0xb79968).fillTriangle(
          x,
          y - 17,
          x - 14,
          y + 12,
          x + 13,
          y + 12,
        );
        e.fillStyle(0xe4c38b).fillTriangle(x, y - 17, x - 14, y + 12, x, y + 8);
      } else if (region === "iron") {
        e.fillStyle(0x6f7c83).fillRoundedRect(x - 10, y - 10, 20, 20, 3);
        e.lineStyle(2, 0xc1a783, 0.7).lineBetween(x - 6, y - 8, x + 7, y + 5);
      } else if (region === "volcano") {
        e.fillStyle(0x332f3a).fillTriangle(
          x,
          y - 17,
          x - 13,
          y + 12,
          x + 13,
          y + 12,
        );
        e.lineStyle(2, 0xec935b, 0.6).lineBetween(x, y - 10, x + 5, y + 12);
      } else {
        const bob = region === "arcane" ? Math.sin(t + i) * 4 : 0;
        e.fillStyle(color, 0.75).fillTriangle(
          x,
          y - 19 + bob,
          x - 7,
          y + bob,
          x + 7,
          y + bob,
        );
        e.fillStyle(color, 0.35).fillTriangle(
          x,
          y + 12 + bob,
          x - 7,
          y + bob,
          x + 7,
          y + bob,
        );
      }
    }
    const phase =
      p.lighting === "day"
        ? 1
        : p.lighting === "night"
          ? 3
          : p.lighting === "sunset"
            ? 2
            : Math.floor(t / 90) % 4;
    if (phase === 3) {
      l.fillStyle(0x10234b, 0.2).fillRoundedRect(60, 60, 475, 650, 25);
      for (const x of [130, 300, 470])
        l.fillStyle(0xffc571, 0.09).fillCircle(x, 230, 35);
    } else if (phase === 2)
      l.fillStyle(0xffb25b, 0.08).fillRoundedRect(60, 60, 475, 650, 25);
    else if (phase === 0)
      l.fillStyle(0xffe5b7, 0.035).fillRoundedRect(60, 60, 475, 650, 25);
    if (p.weather) {
      for (let i = 0; i < Math.floor(budget.decorations * 0.7); i++) {
        const x = 80 + ((i * 73 + t * (region === "desert" ? 19 : 3)) % 430),
          y =
            110 +
            ((i * 57 +
              t * (region === "frost" ? 12 : region === "volcano" ? 6 : 25)) %
              570);
        if (region === "frost")
          e.fillStyle(0xe9f5fc, 0.45).fillCircle(x, y, 1.5);
        else if (region === "volcano" || region === "desert")
          e.fillStyle(color, 0.3).fillCircle(x, y, 1.2);
        else if (region === "shadow")
          e.fillStyle(0xc1d4dc, 0.025).fillEllipse(x, y, 110, 14);
        else if (region === "arcane")
          e.lineStyle(1, color, 0.3).strokeCircle(x, y, 2);
        else if (region === "dark" || Math.floor(t / 40) % 3 === 2)
          e.lineStyle(1, 0xb0cedc, 0.2).lineBetween(x, y, x - 2, y + 7);
      }
    }
  }
  dispose() {
    this.disposed.forEach((f) => f());
    this.buildings.dispose();
    this.debug.remove();
  }
}
