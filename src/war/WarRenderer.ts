import Phaser from "phaser";
import type { GameStateManager } from "../core/GameStateManager";
import { buildingConfig } from "../config/buildings";

/** One graphics batch and a bounded label pool for both kingdoms. */
export class WarRenderer {
  private g: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  constructor(
    scene: Phaser.Scene,
    private game: GameStateManager,
  ) {
    this.g = scene.add.graphics().setDepth(12);
    for (let i = 0; i < 65; i++)
      this.labels.push(
        scene.add
          .text(0, 0, "", {
            fontFamily: "Arial",
            fontSize: "9px",
            color: "#f0e8ca",
            stroke: "#142923",
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(13)
          .setVisible(false),
      );
  }
  draw() {
    const g = this.g;
    g.clear();
    this.labels.forEach((l) => l.setVisible(false));
    const w = this.game.war;
    if (!w || this.game.testBall) return;
    g.fillStyle(0x892f30, 0.14);
    g.fillRoundedRect(85, 90, 420, 215, 20);
    g.lineStyle(1, 0xe0bd78, 0.25);
    for (const x of [130, 300, 455])
      for (let y = 310; y < 630; y += 28) g.lineBetween(x, y, x, y + 10);
    let i = 0;
    for (const s of w.data.structures) {
      const c = buildingConfig(s.type)!,
        color = s.side === "ally" ? 0x79c8bc : 0xea8b79;
      if (s.hp <= 0) {
        g.fillStyle(0x4b4940, 0.85);
        for (let k = 0; k < 5; k++)
          g.fillRect(s.x - 20 + k * 9, s.y + (k % 2) * 7, 8, 5);
        continue;
      }
      const ratio = s.hp / s.maxHp;
      if (!s.fixed || s.side === "enemy") {
        g.fillStyle(0x0d2522, 0.9);
        g.lineStyle(2, color, 0.8);
        if (s.castle) {
          g.fillRoundedRect(s.x - 24, s.y - 24, 48, 48, 4);
          g.strokeRoundedRect(s.x - 24, s.y - 24, 48, 48, 4);
          g.fillStyle(color);
          for (let k = 0; k < 4; k++)
            g.fillRect(s.x - 24 + k * 14, s.y - 32, 7, 12);
          g.fillStyle(0x162c29);
          g.fillRoundedRect(s.x - 7, s.y, 14, 24, 6);
          g.lineStyle(2, 0xe9ce86);
          g.lineBetween(s.x, s.y - 25, s.x, s.y - 52);
          g.fillStyle(color);
          g.fillTriangle(s.x, s.y - 52, s.x + 22, s.y - 47, s.x, s.y - 40);
        } else if (c.shape === "circle") {
          g.fillCircle(s.x, s.y, c.width / 2);
          g.strokeCircle(s.x, s.y, c.width / 2);
          g.fillStyle(color, 0.35);
          g.fillTriangle(s.x, s.y - 15, s.x - 13, s.y + 9, s.x + 13, s.y + 9);
        } else {
          g.save();
          g.translateCanvas(s.x, s.y);
          g.rotateCanvas((s.angle * Math.PI) / 180);
          g.fillRoundedRect(-c.width / 2, -c.height / 2, c.width, c.height, 3);
          g.strokeRoundedRect(
            -c.width / 2,
            -c.height / 2,
            c.width,
            c.height,
            3,
          );
          g.lineBetween(-c.width / 3, 0, c.width / 3, 0);
          g.restore();
        }
      }
      if (ratio < 0.75) {
        g.lineStyle(2, 0x292721);
        g.beginPath();
        g.moveTo(s.x - 8, s.y - 14);
        g.lineTo(s.x + 3, s.y - 3);
        g.lineTo(s.x - 3, s.y + 8);
        g.strokePath();
      }
      if (ratio < 0.5) {
        g.fillStyle(0xe59154, 0.65);
        g.fillEllipse(
          s.x + 12,
          s.y - 15,
          5,
          12 + Math.sin(this.game.time * 0.012) * 3,
        );
      }
      if (ratio < 0.25) {
        g.fillStyle(0xa19b87, 0.3);
        g.fillCircle(s.x + 8, s.y - 35 - ((this.game.time * 0.012) % 15), 9);
      }
      g.fillStyle(0x13241f, 0.9);
      g.fillRect(s.x - 22, s.y + 28, 44, 4);
      g.fillStyle(ratio < 0.25 ? 0xef855f : color);
      g.fillRect(s.x - 22, s.y + 28, 44 * ratio, 4);
      if ((!s.fixed || s.side === "enemy") && i < this.labels.length)
        this.labels[i++]
          .setPosition(s.x, s.y + 40)
          .setText(`${s.castle ? "왕궁" : c.name} ${s.level}`)
          .setVisible(true);
      if (s.castle && w.protection(s.side) > 0) {
        g.lineStyle(2, color, 0.25);
        g.strokeCircle(s.x, s.y, 37);
      }
    }
    for (const job of w.data.work) {
      g.lineStyle(2, 0xf6d283, 0.65);
      g.strokeCircle(job.x, job.y, 32);
    }
  }
}
