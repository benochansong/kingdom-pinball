import { cosmeticColor } from "../config/profile";
import Phaser from "phaser";
import type { GameModeManager } from "./GameModeManager";
export class ModeRenderer {
  private backdrop: Phaser.GameObjects.Graphics;
  private decor: Phaser.GameObjects.Graphics;
  private ink: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  constructor(
    scene: Phaser.Scene,
    readonly modes: GameModeManager,
  ) {
    this.backdrop = scene.add.graphics().setDepth(2);
    this.decor = scene.add.graphics().setDepth(16);
    this.ink = scene.add.graphics().setDepth(8);
    this.label = scene.add
      .text(300, 110, "", {
        fontSize: "16px",
        fontFamily: "sans-serif",
        color: "#f6dda1",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(18);
  }
  draw() {
    this.ink.clear();
    this.backdrop.clear();
    this.decor.clear();
    this.label.setVisible(false);
    const m = this.modes;
    this.cosmetics();
    if (!m.active) return;
    if (m.customTable) {
      this.custom();
      return;
    }
    if (!m.puzzle) return;
    const b = m.puzzle.board,
      d = b.definition,
      g = this.ink;
    this.backdrop
      .fillStyle(0x10272c, 0.98)
      .fillRoundedRect(68, 145, 455, 570, 20);
    g.lineStyle(1, 0x32534f, 0.5);
    for (let x = 80; x < 520; x += 30) g.lineBetween(x, 150, x, 705);
    for (let y = 160; y < 710; y += 30) g.lineBetween(75, y, 515, y);
    this.label.setText(`${d.tier} · ${d.id + 1}\n${d.name}`).setVisible(true);
    if (b.hits < d.hits) {
      const p = b.targetPosition;
      g.lineStyle(3, 0xf5d27d, 1).strokeCircle(p.x, p.y, d.radius);
      g.fillStyle(0xefc865, 0.2).fillCircle(p.x, p.y, d.radius - 3);
      g.lineBetween(p.x - 7, p.y, p.x + 7, p.y);
      g.lineBetween(p.x, p.y - 7, p.x, p.y + 7);
    }
    if (d.kind === "portal") {
      g.lineStyle(4, 0xb48be3).strokeCircle(450, 180, 38);
      g.lineStyle(4, 0x86d3b3).strokeCircle(130, 330, 25);
    }
    if (b.placed) {
      const a = (b.angle * Math.PI) / 180;
      g.lineStyle(12, 0xa7cad0).lineBetween(
        300 - Math.cos(a) * 47,
        580 - Math.sin(a) * 47,
        300 + Math.cos(a) * 47,
        580 + Math.sin(a) * 47,
      );
    }
    if (d.kind === "rescue") {
      g.lineStyle(2, 0x91d3a6).strokeRect(80, 635, 70, 25);
      g.fillStyle(0x91d3a6).fillCircle(d.x, b.rescued ? b.rescueY : d.y, 9);
    }
  }
  private custom() {
    const m = this.modes,
      t = m.customTable!.table,
      g = this.ink;
    if (m.game.sessionExtension?.flatBoard)
      this.backdrop
        .fillStyle(
          t.preset === "magic"
            ? 0x251c3e
            : t.preset === "kingdom"
              ? 0x20352d
              : 0x10272c,
          1,
        )
        .fillRoundedRect(68, 100, 455, 625, 20);
    this.label.setText(t.name).setVisible(true);
    for (const o of t.objects) {
      if (["unit", "boss"].includes(o.kind)) continue;
      g.save();
      g.translateCanvas(o.x, o.y);
      g.rotateCanvas((o.angle * Math.PI) / 180);
      const color =
        o.kind === "portal"
          ? 0xbb9de5
          : o.kind === "decoration"
            ? 0x73ba96
            : cosmeticColor(m.profile.equipped, "bumper");
      g.fillStyle(color, 0.22);
      g.lineStyle(2, color, 0.9);
      if (["bumper", "target", "portal"].includes(o.kind)) {
        g.fillCircle(0, 0, Math.min(o.width, o.height) / 2);
        g.strokeCircle(0, 0, Math.min(o.width, o.height) / 2);
      } else {
        g.fillRect(-o.width / 2, -o.height / 2, o.width, o.height);
        g.strokeRect(-o.width / 2, -o.height / 2, o.width, o.height);
      }
      g.restore();
    }
  }
  private cosmetics() {
    const g = this.decor,
      m = this.modes,
      p = m.profile,
      game = m.game;
    g.lineStyle(2, cosmeticColor(p.equipped, "border"), 0.7).strokeRoundedRect(
      31,
      32,
      538,
      836,
      35,
    );
    for (const f of [game.physics.left, game.physics.right])
      g.lineStyle(3, cosmeticColor(p.equipped, "flipper"), 0.9).lineBetween(
        f.pivot.x,
        f.pivot.y - 5,
        f.tip.x,
        f.tip.y - 5,
      );
    if (game.war && !game.sessionExtension?.flatBoard) {
      const c = game.war.castle("ally");
      g.lineStyle(2, cosmeticColor(p.equipped, "palace")).strokeRoundedRect(
        c.x - 25,
        c.y - 25,
        50,
        50,
        5,
      );
      g.lineStyle(2, 0xb4baa0).lineBetween(
        c.x + 22,
        c.y - 20,
        c.x + 22,
        c.y - 60,
      );
      g.fillStyle(cosmeticColor(p.equipped, "flag")).fillTriangle(
        c.x + 23,
        c.y - 60,
        c.x + 48,
        c.y - 51,
        c.x + 23,
        c.y - 43,
      );
      g.lineStyle(2, cosmeticColor(p.equipped, "crest")).strokeCircle(
        c.x,
        c.y,
        13,
      );
    }
    if (!game.sessionExtension?.flatBoard)
      for (const at of [
        { x: 180, y: 344 },
        { x: 384, y: 326 },
      ])
        g.lineStyle(1, cosmeticColor(p.equipped, "bumper"), 0.55).strokeCircle(
          at.x,
          at.y,
          35,
        );
  }
}
