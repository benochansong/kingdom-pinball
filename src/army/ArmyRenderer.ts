import Phaser from "phaser";
import type { GameStateManager } from "../core/GameStateManager";
import { maxHp } from "./DamageCalculator";
export class ArmyRenderer {
  private g: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  constructor(
    scene: Phaser.Scene,
    private game: GameStateManager,
  ) {
    this.g = scene.add.graphics().setDepth(17);
    for (let i = 0; i < 24; i++)
      this.labels.push(
        scene.add
          .text(0, 0, "", {
            fontFamily: "Arial",
            fontSize: "10px",
            color: "#fff2c9",
            stroke: "#10231e",
            strokeThickness: 2,
          })
          .setOrigin(0.5)
          .setDepth(19)
          .setVisible(false),
      );
  }
  draw() {
    const g = this.g;
    g.clear();
    for (const l of this.labels) l.setVisible(false);
    const army =
      this.game.mode === "kingdom" && !this.game.testBall
        ? this.game.army
        : undefined;
    if (!army) return;
    const now = this.game.time / 1000;
    for (const u of army.combat.units) {
      if (u.hp <= 0) continue;
      const x = u.x,
        y = u.y,
        color = u.side === "ally" ? 0x74bfba : 0xd96f68,
        dx = Math.cos(u.facing),
        dy = Math.sin(u.facing),
        walking = ["moving", "retreating"].includes(u.state),
        step = walking ? Math.sin(now * 14 + u.id.length) * 3 : 0,
        attack = ["windup", "attacking"].includes(u.state)
          ? Math.sin(now * 22) * 5
          : 0;
      g.fillStyle(0x061c19, 0.4);
      g.fillEllipse(x + 2, y + 6, 16, 7);
      g.lineStyle(2, 0x4a493c);
      g.lineBetween(x - 3, y + 3, x - 4 - step, y + 9);
      g.lineBetween(x + 3, y + 3, x + 4 + step, y + 9);
      if (u.kind === "knight") {
        g.fillStyle(0x8c7859);
        g.fillEllipse(x, y + 1, 21, 11);
        g.fillCircle(x + dx * 10, y + dy * 7 - 3, 5);
        g.lineStyle(2, 0x685741);
        g.lineBetween(x - 7, y + 5, x - 8 - step, y + 11);
        g.lineBetween(x + 7, y + 5, x + 8 + step, y + 11);
      }
      if (u.kind === "catapult") {
        g.fillStyle(0x997c50);
        g.fillRect(x - 10, y - 6, 20, 12);
        g.lineStyle(3, 0x503e2d);
        g.strokeCircle(x - 8, y + 7, 4);
        g.strokeCircle(x + 8, y + 7, 4);
        g.lineStyle(3, 0xdec99a);
        g.lineBetween(x - 7, y + 4, x + 5 + attack, y - 12);
        g.fillStyle(color);
        g.fillTriangle(x - 3, y - 6, x + 3, y - 6, x, y - 12);
      } else {
        g.fillStyle(color);
        if (u.kind === "mage" || u.kind === "healer")
          g.fillTriangle(x, y - 5, x - 7, y + 7, x + 7, y + 7);
        else g.fillRoundedRect(x - 5, y - 5, 10, 11, 2);
        g.fillStyle(0xe3cbaa);
        g.fillCircle(x, y - 8, 4);
        g.fillStyle(u.rank >= 4 ? 0xe8cd79 : 0xb8cbc5);
        if (u.kind === "mage")
          g.fillTriangle(x - 6, y - 9, x + 6, y - 9, x, y - 20);
        else if (u.kind === "guard") g.fillRect(x - 5, y - 13, 10, 6);
        else g.fillRect(x - 4, y - 12, 8, 3);
        switch (u.kind) {
          case "swordsman":
            g.lineStyle(2, 0xe7e2cb);
            g.lineBetween(
              x + dx * 4,
              y + dy * 4,
              x + dx * (17 + attack),
              y + dy * (17 + attack),
            );
            break;
          case "spearman":
            g.lineStyle(2, 0xcbb57d);
            g.lineBetween(
              x - dx * 6,
              y - dy * 6,
              x + dx * (25 + attack),
              y + dy * (25 + attack),
            );
            g.fillStyle(0xe7eee7);
            g.fillCircle(x + dx * 26, y + dy * 26, 2);
            break;
          case "archer":
            g.lineStyle(2, 0xe3bc78);
            g.strokeEllipse(x + dx * 9, y + dy * 9, 8, 14);
            g.lineStyle(1, 0xebe3bd);
            g.lineBetween(x, y, x + dx * (17 + attack), y + dy * (17 + attack));
            break;
          case "guard":
            g.fillStyle(0x345d65);
            g.fillRoundedRect(x + dx * 7 - 6, y + dy * 7 - 7, 12, 14, 3);
            g.lineStyle(2, 0xded4a7);
            g.strokeRoundedRect(x + dx * 7 - 6, y + dy * 7 - 7, 12, 14, 3);
            break;
          case "knight":
            g.lineStyle(2, 0xe9d8ab);
            g.lineBetween(x, y - 5, x + dx * 21, y + dy * 21 - 5);
            break;
          case "mage":
            g.lineStyle(2, 0xc5a4f6);
            g.lineBetween(x + 8, y + 6, x + 8, y - 13);
            g.fillStyle(0xc69efa);
            g.fillCircle(x + 8, y - 15, 3);
            break;
          case "healer":
            g.lineStyle(3, 0xa3e5a1);
            g.lineBetween(x + 8, y - 15, x + 8, y - 5);
            g.lineBetween(x + 4, y - 10, x + 12, y - 10);
            break;
        }
      }
      // A crest cross and an enemy chevron distinguish sides without relying on color.
      g.lineStyle(1, 0xf3eac3);
      if (u.side === "ally") {
        g.lineBetween(x - 2, y, x + 2, y);
        g.lineBetween(x, y - 2, x, y + 2);
      } else {
        g.lineBetween(x - 3, y - 2, x, y + 2);
        g.lineBetween(x, y + 2, x + 3, y - 2);
      }
      if (u.hp < maxHp(u) || u.state === "windup") {
        g.fillStyle(0x092923);
        g.fillRect(x - 10, y - 22, 20, 3);
        g.fillStyle(color);
        g.fillRect(
          x - 10,
          y - 22,
          20 * Math.max(0, Math.min(1, u.hp / maxHp(u))),
          3,
        );
      }
      if (u.rank >= 4 || u.squad === "commander") {
        g.lineStyle(1, 0xf1d17e);
        g.strokeCircle(x, y - 8, 7);
      }
      if (u.state === "healing") {
        g.lineStyle(1, 0xa6e9a4, 0.6);
        g.strokeCircle(x, y, 16 + Math.sin(now * 7) * 3);
      }
    }
    for (const p of army.data.battle?.projectiles ?? []) {
      const t = p.age / p.duration,
        y = p.y - (p.kind === "catapult" ? Math.sin(t * Math.PI) * 35 : 0);
      if (p.kind === "archer" || p.kind === "tower") {
        g.lineStyle(2, p.side === "ally" ? 0xf2dc8b : 0xeb8d79);
        const d = Math.hypot(p.tx - p.startX, p.ty - p.startY) || 1;
        g.lineBetween(
          p.x,
          y,
          p.x - ((p.tx - p.startX) / d) * 8,
          y - ((p.ty - p.startY) / d) * 8,
        );
      } else {
        g.fillStyle(
          p.heal ? 0x9ce0a6 : p.kind === "catapult" ? 0xb2afa1 : 0xc294f5,
        );
        g.fillCircle(p.x, y, p.kind === "catapult" ? 5 : 3);
        g.lineStyle(1, p.heal ? 0xbdf0ab : 0xd3b9ff, 0.5);
        g.strokeCircle(p.x, y, 7);
      }
    }
    army.combat.effects.slice(-24).forEach((e, i) => {
      g.lineStyle(
        2,
        e.type === "heal" ? 0xa6edb6 : e.type === "death" ? 0xcebc8c : 0xe9d8a0,
        e.ttl,
      );
      g.strokeCircle(e.x, e.y, 4 + (1 - e.ttl) * 20);
      this.labels[i]
        .setPosition(e.x, e.y - 15 - (0.65 - e.ttl) * 15)
        .setText(e.text)
        .setAlpha(Math.min(1, e.ttl * 2))
        .setVisible(true);
    });
  }
}
