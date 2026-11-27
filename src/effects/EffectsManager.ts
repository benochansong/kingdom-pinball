import Phaser from "phaser";
import type { GameStateManager } from "../core/GameStateManager";
import { ECONOMY_TARGETS, RESOURCES, type ResourceId } from "../config/economy";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  color: number;
  size: number;
  shape?: ResourceId;
}
export class EffectsManager {
  particleBudget = 120;
  get activeParticles() {
    return this.particles.length;
  }
  private free: Particle[] = [];
  private particles: Particle[] = [];
  private graphics: Phaser.GameObjects.Graphics;
  private trail: { x: number; y: number }[] = [];
  private flashes = new Map<
    string,
    { alpha: number; x: number; y: number; radius: number; color: number }
  >();
  private disposers: (() => void)[];
  private popups = new Set<Phaser.GameObjects.Text>();
  private freeText:Phaser.GameObjects.Text[]=[];
  constructor(
    private scene: Phaser.Scene,
    private game: GameStateManager,
  ) {
    this.graphics = scene.add.graphics().setDepth(10);
    this.disposers = [
      game.events.on("hit", (hit) => {
        const color =
          ECONOMY_TARGETS.find((t) => t.id === hit.id)?.color ?? 0xf1cc7d;
        this.flashes.set(hit.id, {
          alpha: 1,
          x: hit.x,
          y: hit.y,
          radius: 22,
          color,
        });
        this.burst(hit.x, hit.y, color, 15);
        if (
          game.mode === "classic" ||
          hit.kind === "palace" ||
          hit.kind === "bonus"
        )
          this.popup(hit.x, hit.y - 28, `+${hit.points}`, "#ffdf91");
        if (game.save.data.settings.shake && hit.kind === "palace")
          scene.cameras.main.shake(
            80,
            0.0016 * game.save.data.settings.presentation.shakeAmount,
          );
      }),
      game.events.on("royal", ({ x, y }) => {
        this.burst(x, y, 0xffdc81, 40);
        this.popup(x, y - 60, "ROYAL BONUS +3,000", "#ffe5a4");
      }),
      game.events.on("impact", ({ x, y, speed }) => {
        this.burst(
          x,
          y,
          speed > 950 ? 0xffd58a : 0xaed2db,
          speed > 950 ? 20 : speed > 650 ? 12 : speed > 350 ? 6 : 2,
        );
      }),
      game.events.on("launch", () => this.burst(554, 800, 0x91e2ef, 16)),
      game.events.on("production", (p) => {
        if (p.amount <= 0) return;
        const resource = RESOURCES[p.resource];
        this.burst(
          p.x,
          p.y,
          Number.parseInt(resource.color.slice(1), 16),
          Math.min(24, 10 + p.strength * 5),
          p.resource,
        );
        this.popup(
          p.x,
          p.y - 27,
          `+${p.amount} ${resource.english}${p.multiplier >= 1.5 ? ` ×${p.multiplier.toFixed(1)}` : ""}`,
          resource.color,
        );
      }),
      game.events.on("state", ({ state }) => {
        if (state === "menu" || (state === "playing" && game.time === 0))
          this.clear();
      }),
    ];
  }
  burst(
    x: number,
    y: number,
    color: number,
    count: number,
    shape?: ResourceId,
  ): void {
    if (!this.game.save.data.settings.particles) return;
    for (
      let i = 0;
      i < count && this.particles.length < this.particleBudget;
      i++
    ) {
      const angle = Math.random() * Math.PI * 2,
        speed = 30 + Math.random() * 140;
      const particle = this.free.pop() ?? ({} as Particle);
      this.particles.push(
        Object.assign(particle, {
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          age: 0,
          life: 0.3 + Math.random() * 0.4,
          color,
          size: 1 + Math.random() * 2,
          shape,
        }),
      );
    }
  }
  popup(x: number, y: number, label: string, color: string): void {
    if (this.popups.size >= 16) return;
    const text = this.freeText.pop()??this.scene.add
      .text(x, y, label, {
        fontFamily: "Georgia, serif",
        fontSize: "21px",
        color,
        stroke: "#102321",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(30);
    text.setPosition(x,y).setText(label).setColor(color).setAlpha(1).setVisible(true);
    this.popups.add(text);
    this.scene.tweens.add({
      targets: text,
      y: y - 42,
      alpha: 0,
      duration: 950,
      ease: "Cubic.easeOut",
      onComplete: () => {
        this.popups.delete(text);
        text.setVisible(false);this.freeText.push(text);
      },
    });
  }
  update(dt: number): void {
    if (this.game.state === "paused") {
      this.scene.tweens.pauseAll();
      return;
    }
    this.scene.tweens.resumeAll();
    const g = this.graphics;
    g.clear();
    const ball = this.game.physics.ball;
    if (
      ball &&
      this.game.physics.launched &&
      this.game.save.data.settings.particles
    ) {
      this.trail.unshift({ ...ball.position });
      if (this.trail.length > 9) this.trail.pop();
      if (ball.speed > 3)
        this.trail.forEach((p, i) => {
          g.fillStyle(0x9ceaff, (1 - i / 9) * 0.22);
          g.fillCircle(p.x, p.y, 7 * (1 - i / 10));
        });
    } else this.trail.length = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 90 * dt;
      if (p.age >= p.life) {
        if (this.free.length < 160) this.free.push(p);
        this.particles.splice(i, 1);
        continue;
      }
      const alpha = 1 - p.age / p.life,
        size = p.size;
      g.fillStyle(p.color, alpha);
      if (p.shape === "wood") g.fillEllipse(p.x, p.y, size * 3, size * 1.4);
      else if (p.shape === "stone")
        g.fillTriangle(
          p.x - size,
          p.y + size,
          p.x,
          p.y - size * 2,
          p.x + size * 2,
          p.y + size,
        );
      else if (p.shape === "mana") {
        g.fillTriangle(p.x - size, p.y, p.x, p.y - size * 2, p.x + size, p.y);
        g.fillTriangle(p.x - size, p.y, p.x, p.y + size * 2, p.x + size, p.y);
      } else if (p.shape === "energy") {
        g.lineStyle(1, p.color, alpha);
        g.strokeCircle(p.x, p.y, size * (1 + p.age));
      } else if (p.shape === "food") {
        g.lineStyle(1, p.color, alpha);
        g.lineBetween(p.x, p.y - 4, p.x, p.y + 4);
        g.fillEllipse(p.x - 2, p.y - 1, 4, 2);
        g.fillEllipse(p.x + 2, p.y + 1, 4, 2);
      } else {
        g.fillCircle(p.x, p.y, size);
        if (p.shape === "gold") {
          g.lineStyle(1, 0xffedb4, alpha);
          g.strokeCircle(p.x, p.y, size);
        }
      }
    }
    for (const [id, t] of this.flashes) {
      g.lineStyle(
        3,
        t.color,
        t.alpha *
          (this.game.save.data.settings.presentation.reduceFlash ? 0.6 : 1),
      );
      g.strokeCircle(t.x, t.y, t.radius + 6 + (1 - t.alpha) * 14);
      if (t.alpha < 0) this.flashes.delete(id);
      else t.alpha -= dt * 2.7;
    }
  }
  clear(): void {
    this.trail = [];
    this.free.push(
      ...this.particles.slice(0, Math.max(0, 160 - this.free.length)),
    );
    this.particles = [];
    this.flashes.clear();
    this.popups.forEach((p) => {
      this.scene.tweens.killTweensOf(p);
      p.setVisible(false);this.freeText.push(p);
    });
    this.popups.clear();
  }
  dispose(): void {
    this.disposers.forEach((fn) => fn());
    this.clear();
    this.freeText.forEach(t=>t.destroy());this.freeText=[];
    this.graphics.destroy();
  }
}
