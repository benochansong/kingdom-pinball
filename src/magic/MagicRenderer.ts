import Phaser from "phaser";
import type { GameStateManager } from "../core/GameStateManager";
import { element } from "../config/magic";
export class MagicRenderer {
  private ink: Phaser.GameObjects.Graphics;
  private balls: {
    image: Phaser.GameObjects.Image;
    label: Phaser.GameObjects.Text;
    trail: { x: number; y: number }[];
  }[] = [];
  constructor(
    scene: Phaser.Scene,
    private game: GameStateManager,
  ) {
    this.ink = scene.add.graphics().setDepth(19);
    for (let i = 0; i < 10; i++)
      this.balls.push({
        image: scene.add
          .image(0, 0, "sphere")
          .setDisplaySize(34, 34)
          .setDepth(20),
        label: scene.add
          .text(0, 0, "", {
            fontSize: "12px",
            color: "#10242d",
            fontStyle: "bold",
          })
          .setOrigin(0.5)
          .setDepth(21),
        trail: [],
      });
  }
  draw() {
    this.ink.clear();
    const m = this.game.magic,
      live = m && !this.game.testBall ? this.game.physics.balls : [];
    for (const [i, v] of this.balls.entries()) {
      const b = live[i];
      v.image.setVisible(!!b);
      v.label.setVisible(!!b);
      if (!b) {
        v.trail = [];
        continue;
      }
      const state = m!.balls!.state(b)!,
        c = element(state.type),
        p = b.position;
      v.image
        .setPosition(p.x, p.y)
        .setTint(c.color)
        .setAlpha(i ? 0.82 : 1);
      v.label.setPosition(p.x, p.y).setText(c.glyph);
      if (this.game.state === "playing") v.trail.push({ ...p });
      if (v.trail.length > 6) v.trail.shift();
      if (this.game.save.data.settings.particles)
        for (const [j, t] of v.trail.entries())
          this.ink
            .fillStyle(c.color, 0.035 * (j + 1))
            .fillCircle(t.x, t.y, 4 + j * 0.7);
      this.ink
        .lineStyle(i ? 1 : 2, i ? c.color : 0xffffff, 0.85)
        .strokeCircle(p.x, p.y, i ? 11 : 14);
      if (state.type === "explosion")
        this.ink.lineStyle(2, 0xff6655).strokeCircle(p.x, p.y, 15 + state.hits);
    }
    if (!m || this.game.testBall) return;
    for (const magic of [m, this.game.enemyMagic].filter(Boolean)) {
      for (const f of magic!.data.fields)
        this.ink
          .fillStyle(0x96dfff, 0.12)
          .fillCircle(f.x, f.y, 100)
          .lineStyle(1, 0x96dfff, 0.65)
          .strokeCircle(f.x, f.y, 100);
      for (const s of magic!.data.statuses) {
        const t = magic!.find(s.target);
        if (!t) continue;
        const color =
          s.kind === "burn"
            ? 0xff9050
            : s.kind === "shield"
              ? 0xf6db79
              : 0x9cdbff;
        this.ink
          .lineStyle(2, color, 0.8)
          .strokeCircle(t.x, t.y, s.kind === "shield" ? 30 : 12);
      }
      for (const e of magic!.effects) {
        const color = e.type === "warning" ? 0xff6655 : 0xd8c8ff;
        this.ink.lineStyle(
          2,
          color,
          Math.max(0.1, (e.until - this.game.time) / 650),
        );
        if (e.tx !== undefined) this.ink.lineBetween(e.x, e.y, e.tx, e.ty!);
        else this.ink.strokeCircle(e.x, e.y, e.radius);
      }
      const warning = magic!.data.enemyCast;
      if (warning)
        this.ink
          .lineStyle(3, 0xff6655, 0.85)
          .strokeCircle(warning.x, warning.y, 90);
    }
  }
}
