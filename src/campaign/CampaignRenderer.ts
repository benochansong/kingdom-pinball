import Phaser from "phaser";
import type { CampaignManager } from "./CampaignManager";
import { region, stage } from "../config/campaign";
import { BOSS_CONFIG } from "./BossManager";
/** One current-region texture; geometry and telegraphs stay below spheres/flippers. */
export class CampaignRenderer {
  private art?: Phaser.GameObjects.Image;
  private key = "";
  private ink: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  constructor(
    private scene: Phaser.Scene,
    private campaign: Pick<
      CampaignManager,
      "game" | "active" | "session" | "terrain" | "boss"
    >,
  ) {
    this.ink = scene.add.graphics().setDepth(8);
    for (let i = 0; i < 12; i++)
      this.labels.push(
        scene.add
          .text(0, 0, "", {
            fontFamily: "sans-serif",
            fontSize: "10px",
            color: "#f3ecce",
            backgroundColor: "#11272caa",
          })
          .setOrigin(0.5)
          .setDepth(14),
      );
  }
  draw() {
    const c = this.campaign,
      g = c.game,
      s = c.active ? c.session : null;
    this.ink.clear();
    for (const t of this.labels) t.setVisible(false);
    if (!s || g.testBall || g.sessionExtension?.flatBoard) {
      this.art?.setVisible(false);
      return;
    }
    const r = region(stage(s.stage).region);
    if (this.key !== r.id) {
      this.art?.destroy();
      if (this.key) this.scene.textures.remove("region-art");
      this.key = r.id;
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 900;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = r.color + "22";
      ctx.fillRect(65, 90, 460, 610);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 32; i++) {
        const x = i % 2 ? 490 + (i % 3) * 5 : 80 + (i % 3) * 7,
          y = 130 + Math.floor(i / 2) * 31;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        if (r.id === "shadow" || r.id === "greenwood") {
          ctx.moveTo(x, y - 15);
          ctx.lineTo(x - 11, y + 9);
          ctx.lineTo(x + 11, y + 9);
          ctx.closePath();
          ctx.moveTo(x, y + 9);
          ctx.lineTo(x, y + 19);
        } else if (r.id === "iron") {
          ctx.rect(x - 10, y - 8, 20, 17);
          ctx.moveTo(x - 8, y - 8);
          ctx.lineTo(x + 8, y + 9);
        } else if (r.id === "desert") {
          ctx.moveTo(x - 14, y + 10);
          ctx.lineTo(x, y - 15);
          ctx.lineTo(x + 14, y + 10);
          ctx.closePath();
          ctx.moveTo(x, y - 15);
          ctx.lineTo(x + 4, y + 10);
        } else if (r.id === "frost") {
          for (let j = 0; j < 6; j++) {
            ctx.moveTo(x, y);
            ctx.lineTo(
              x + Math.cos((j * Math.PI) / 3) * 13,
              y + Math.sin((j * Math.PI) / 3) * 13,
            );
          }
        } else if (r.id === "volcano") {
          ctx.moveTo(x - 8, y - 15);
          ctx.lineTo(x + 5, y - 3);
          ctx.lineTo(x - 2, y + 7);
          ctx.lineTo(x + 12, y + 18);
        } else {
          ctx.moveTo(x, y - 15);
          ctx.lineTo(x - 9, y);
          ctx.lineTo(x, y + 15);
          ctx.lineTo(x + 9, y);
          ctx.closePath();
          ctx.moveTo(x, y - 15);
          ctx.lineTo(x, y + 15);
        }
        ctx.stroke();
      }
      this.scene.textures.addCanvas("region-art", canvas);
      this.art = this.scene.add.image(300, 450, "region-art").setDepth(1);
    }
    this.art!.setVisible(true);
    let label = 0;
    const color = Phaser.Display.Color.HexStringToColor(r.color).color;
    for (const d of c.terrain?.devices ?? []) {
      if (!c.terrain!.active(d)) continue;
      if (d.kind === "breakable" && s.mission.deviceHealth[d.id] === 0)
        continue;
      const activeHeat = d.kind === "heat" && g.time % 8000 >= 6000,
        warning = d.kind === "heat" && g.time % 8000 >= 4000;
      this.ink
        .fillStyle(activeHeat ? 0xff754c : color, activeHeat ? 0.27 : 0.12)
        .fillCircle(d.x, d.y, d.radius)
        .lineStyle(2, warning ? 0xffbb62 : color, 0.8)
        .strokeCircle(d.x, d.y, d.radius);
      if (d.kind === "rotate") {
        const a = Math.sin(g.time / 2200) * 0.65;
        this.ink
          .lineStyle(7, color, 0.8)
          .lineBetween(
            d.x - Math.cos(a) * d.radius * 0.8,
            d.y - Math.sin(a) * d.radius * 0.8,
            d.x + Math.cos(a) * d.radius * 0.8,
            d.y + Math.sin(a) * d.radius * 0.8,
          );
      }
      if (d.kind === "portal" && d.to) {
        this.ink
          .lineStyle(1, color, 0.25)
          .lineBetween(d.x, d.y, d.to.x, d.to.y);
        this.ink
          .fillStyle(color, 0.65)
          .fillTriangle(
            d.to.x - 5,
            d.to.y + 24,
            d.to.x + 5,
            d.to.y + 24,
            d.to.x,
            d.to.y + 35,
          );
      }
      if (label < this.labels.length - 2)
        this.labels[label++]
          .setVisible(true)
          .setPosition(d.x, d.y + d.radius + 10)
          .setText(
            d.kind === "heat"
              ? activeHeat
                ? "▲ 분출"
                : warning
                  ? "! 분출 예고"
                  : "열기 분출"
              : d.kind === "portal"
                ? "◇ PORTAL ↓"
                : d.kind === "gravity"
                  ? "↑ 중력장"
                  : d.kind === "wind"
                    ? "→ 바람"
                    : d.kind === "breakable"
                      ? `파괴 ${s.mission.deviceHealth[d.id] ?? 3}`
                      : d.kind === "scout"
                        ? "✧ 정찰 / 특산물"
                        : d.kind.toUpperCase(),
          );
    }
    const boss = c.boss?.state,
      u = c.boss?.unit;
    if (boss && u && u.hp > 0) {
      this.ink
        .lineStyle(3, color)
        .strokeCircle(u.x, u.y, 22)
        .lineStyle(1, 0xffffff, 0.5)
        .strokeCircle(u.x, u.y, 26);
      if (boss.id === "volcano")
        this.ink
          .fillStyle(color, 0.35)
          .fillTriangle(u.x - 45, u.y - 20, u.x - 8, u.y + 10, u.x, u.y - 14)
          .fillTriangle(u.x + 45, u.y - 20, u.x + 8, u.y + 10, u.x, u.y - 14);
      this.labels[10]
        .setPosition(u.x, u.y - 35)
        .setVisible(true)
        .setText(
          `${r.crest} ${r.boss}${g.time < boss.weakUntil ? " · WEAK" : ""}`,
        );
      if (boss.warning) {
        const w = boss.warning;
        this.ink
          .lineStyle(3, 0xff806f, 0.9)
          .strokeCircle(w.x, w.y, 90)
          .fillStyle(0xff806f, 0.1)
          .fillCircle(w.x, w.y, 90);
        this.labels[11]
          .setVisible(true)
          .setPosition(w.x, Math.min(730, w.y + 105))
          .setText(
            `! ${w.kind.toUpperCase()} · ${Math.max(0, Math.ceil((w.at - g.time) / 1000))}초`,
          );
      }
    }
  }
  static bossHint(c: CampaignManager) {
    const b = c.session?.mission.boss;
    if (!b) return "";
    return `${BOSS_CONFIG[b.id].weakness} · 장갑 ${Math.ceil(b.armor)}${b.id === "arcane" || b.phase === 3 ? " · 보호막 " + b.shield : ""}`;
  }
}
