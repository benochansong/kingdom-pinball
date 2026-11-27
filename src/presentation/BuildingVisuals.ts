import Phaser from "phaser";
import type { GameStateManager } from "../core/GameStateManager";
import { buildingConfig } from "../config/buildings";
import { QUALITY_BUDGET, type Quality } from "./settings";
/** Texture geometry is cosmetic. The thin footing follows the configured collision footprint. */
export function buildingTexture(
  type: string,
  level: number,
  enemy: boolean,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const c = canvas.getContext("2d")!;
  c.translate(64, 68);
  const config = buildingConfig(type)!,
    w = config.width,
    h = config.height;
  const trim = level >= 4 ? "#f6d18a" : enemy ? "#c27368" : "#8fbdc3",
    stone = level >= 3 ? "#a5b0aa" : "#9f805c";
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };
  const poly = (points: number[][], color: string) => {
    c.fillStyle = color;
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fill();
  };
  c.fillStyle = "#00000055";
  c.beginPath();
  c.ellipse(6, 9, w * 0.65, h * 0.45, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = trim;
  c.lineWidth = 1;
  c.beginPath();
  config.shape === "circle"
    ? c.arc(0, 0, w / 2, 0, Math.PI * 2)
    : c.rect(-w / 2, -h / 2, w, h);
  c.stroke();
  if (config.category === "physics") {
    rect(-w / 2, -h / 2, w, h, "#606b65");
    rect(-w / 2 + 2, -h / 2 + 2, w - 4, 3, "#eed19b");
    rect(-w / 2 + 2, h / 2 - 4, w - 4, 3, "#192d35");
    c.strokeStyle = trim;
    c.beginPath();
    c.moveTo(-10, 0);
    c.lineTo(10, 0);
    c.lineTo(4, -5);
    c.moveTo(10, 0);
    c.lineTo(4, 5);
    c.stroke();
  } else {
    const bw = Math.min(w * 0.8, 42),
      bh = Math.min(h * 0.65, 32);
    rect(-bw / 2, -bh / 2, bw, bh, stone);
    rect(bw / 4, -bh / 2, bw / 4, bh, "#566666");
    poly(
      [
        [-bw / 2 - 3, -bh / 2],
        [0, -bh / 2 - 13],
        [bw / 2 + 3, -bh / 2],
      ],
      level >= 3 ? "#335269" : "#755446",
    );
    poly(
      [
        [0, -bh / 2 - 13],
        [bw / 2 + 3, -bh / 2],
        [0, -bh / 2],
      ],
      enemy ? "#7e4544" : "#486c77",
    );
    rect(-3, 0, 7, bh / 2, "#172b34");
    rect(-bw / 2 + 4, -bh / 2 + 6, 4, 5, "#e1bc77");
    if (
      type === "palace" ||
      type === "castle" ||
      type === "tower" ||
      type === "archerTower" ||
      type === "wall"
    ) {
      for (const x of [-bw / 2, bw / 2 - 8]) {
        rect(x, -28, 10, 40, "#91a19b");
        rect(x + 7, -28, 3, 40, "#526877");
        for (let k = 0; k < 3; k++) rect(x - 1 + k * 4, -33, 3, 7, trim);
        rect(x + 3, -20, 3, 8, "#253848");
      }
    } else if (type === "lumber") {
      for (let i = 0; i < 3; i++) {
        rect(-22 + i * 6, 8, 5, 16, "#684832");
        c.strokeStyle = "#c19a68";
        c.strokeRect(-22 + i * 6, 8, 5, 16);
      }
      rect(17, -10, 3, 25, "#a08c6f");
      poly(
        [
          [18, -10],
          [29, -12],
          [27, -3],
          [18, -2],
        ],
        "#c1c9c6",
      );
    } else if (type === "quarry" || type === "mine") {
      rect(-10, -8, 22, 20, "#17252e");
      rect(-13, -10, 4, 25, "#c6a57a");
      rect(11, -10, 4, 25, "#c6a57a");
      rect(-13, -12, 28, 4, "#d2b080");
      for (let i = 0; i < 4; i++)
        poly(
          [
            [i * 7 - 15, 16],
            [i * 7 - 12, 8],
            [i * 7 - 5, 16],
          ],
          type === "mine" ? "#efc25b" : "#a0b2b7",
        );
    } else if (type === "farm") {
      for (let i = 0; i < 6; i++) {
        rect(-21 + i * 7, 13, 2, 13, "#e6c56c");
        poly(
          [
            [-22 + i * 7, 14],
            [-25 + i * 7, 9],
            [-19 + i * 7, 12],
          ],
          "#d3b15e",
        );
      }
      rect(14, -23, 5, 29, "#c5bca0");
    } else if (type === "market") {
      for (let i = 0; i < 6; i++)
        rect(-22 + i * 7, -5, 7, 7, i % 2 ? trim : "#e7d3a1");
      rect(-22, -6, 42, 2, "#dab37c");
      for (let i = 0; i < 3; i++)
        rect(-18 + i * 13, 14, 10, 7, ["#b5bd72", "#efce76", "#b58bc7"][i]);
    } else if (type === "warehouse" || type === "storage") {
      for (let i = 0; i < 3; i++) {
        rect(-20 + i * 14, 9, 12, 13, "#bd9868");
        c.strokeStyle = "#6a5843";
        c.strokeRect(-20 + i * 14, 9, 12, 13);
      }
    } else if (type === "smith") {
      rect(12, -30, 9, 30, "#626c73");
      rect(-14, 8, 23, 6, "#41525d");
      rect(-8, 14, 12, 9, "#718185");
      poly(
        [
          [-7, 3],
          [0, -12],
          [7, 3],
        ],
        "#ef994d",
      );
    } else if (config.category === "magic") {
      poly(
        [
          [0, -35],
          [-9, -20],
          [0, -6],
          [9, -20],
        ],
        "#97daeb",
      );
      poly(
        [
          [0, -35],
          [0, -6],
          [9, -20],
        ],
        "#8978d5",
      );
      c.strokeStyle = "#c9bdff";
      c.beginPath();
      c.ellipse(0, 8, 22, 7, 0, 0, Math.PI * 2);
      c.stroke();
    } else if (config.category === "military") {
      rect(-20, 8, 40, 3, "#ab8b62");
      for (let i = 0; i < 4; i++) {
        rect(-17 + i * 10, -4, 2, 24, "#d1dddc");
        rect(-20 + i * 10, 7, 8, 2, "#d6b46c");
      }
    }
    if (level >= 2) {
      rect(18, -38, 2, 29, "#c6b88e");
      poly(
        [
          [20, -38],
          [34, -34],
          [20, -28],
        ],
        trim,
      );
    }
    if (level >= 3) {
      for (let i = 0; i < 3; i++) rect(-12 + i * 10, -5, 3, 3, "#dce0bf");
    }
    if (level === 5) {
      c.strokeStyle = "#fae4a2";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, -8, 5, 0, Math.PI * 2);
      c.stroke();
    }
  }
  return canvas;
}
export class BuildingVisuals {
  private images: Phaser.GameObjects.Image[] = [];
  private anim: Phaser.GameObjects.Graphics;
  private keys = new Set<string>();
  constructor(
    private scene: Phaser.Scene,
    private game: GameStateManager,
  ) {
    this.anim = scene.add.graphics().setDepth(13);
  }
  draw(quality: Quality) {
    this.images.forEach((i) => i.setVisible(false));
    this.anim.clear();
    const g = this.game;
    if (g.testBall || g.builder?.active) return;
    const structures = g.war
      ? g.war.data.structures.filter(
          (s) => s.hp > 0 && (!s.fixed || s.side === "enemy"),
        )
      : (g.builder?.buildings
          .filter((b) => !b.disabled)
          .map((b) => ({ ...b, side: "ally", hp: 1, maxHp: 1 })) ?? []);
    let i = 0;
    for (const s of structures) {
      const cfg = buildingConfig(s.type);
      if (!cfg) continue;
      const key = `building-${s.type}-${s.level}-${s.side}`;
      if (!this.keys.has(key)) {
        this.scene.textures.addCanvas(
          key,
          buildingTexture(s.type, s.level, s.side === "enemy"),
        );
        this.keys.add(key);
      }
      let image = this.images[i];
      if (!image) {
        image = this.scene.add.image(0, 0, key).setDepth(12);
        this.images.push(image);
      }
      i++;
      image
        .setTexture(key)
        .setOrigin(0.5, 68 / 128)
        .setPosition(s.x, s.y)
        .setAngle(s.angle)
        .setVisible(true);
      // All spheres render above roofs. Keep the silhouette readable where a ball overlaps.
      image.setAlpha(
        g.physics.balls.some(
          (b) => Math.hypot(b.position.x - s.x, b.position.y - s.y) < 24,
        )
          ? 0.65
          : 1,
      );
      if (quality === "low") continue;
      const t = g.time / 1000;
      const ink = this.anim;
      if (cfg.category === "magic") {
        ink
          .lineStyle(1, 0xb9c1ff, 0.45)
          .strokeEllipse(s.x, s.y - 20 + Math.sin(t * 2) * 3, 24, 8);
      }
      if (s.type === "farm") {
        for (let j = 0; j < 4; j++) {
          const a = t + (j * Math.PI) / 2;
          ink
            .lineStyle(3, 0xe4cda1)
            .lineBetween(
              s.x + 17,
              s.y - 22,
              s.x + 17 + Math.cos(a) * 13,
              s.y - 22 + Math.sin(a) * 13,
            );
        }
      }
      if (s.type === "smith") {
        ink
          .fillStyle(0xaaaec0, 0.2)
          .fillCircle(s.x + 16, s.y - 35 - ((t * 9) % 16), 4 + (t % 1) * 3);
      }
      if (s.level >= 2) {
        const wave = Math.sin(t * 3 + s.x) * 3;
        ink
          .fillStyle(s.side === "ally" ? 0x92c1c5 : 0xcf8276)
          .fillTriangle(
            s.x + 20,
            s.y - 38,
            s.x + 34,
            s.y - 34 + wave,
            s.x + 20,
            s.y - 28,
          );
      }
      if (
        QUALITY_BUDGET[quality].decorations > 20 &&
        ["lumber", "quarry", "mine", "market"].includes(s.type)
      ) {
        const x = s.x + Math.sin(t * 0.8 + s.x) * 19,
          y = s.y + 24;
        ink.fillStyle(0xd9c7a4).fillCircle(x, y - 3, 2);
        ink.fillStyle(0x829a93).fillRect(x - 2, y, 4, 5);
      }
    }
  }
  dispose() {
    for (const key of this.keys) this.scene.textures.remove(key);
    this.keys.clear();
  }
}
