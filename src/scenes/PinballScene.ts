import {CampaignRenderer} from "../campaign/CampaignRenderer";
import type {CampaignManager} from "../campaign/CampaignManager";
import { MagicRenderer } from "../magic/MagicRenderer";
import Phaser from "phaser";
import { WarRenderer } from "../war/WarRenderer";
import { WAR_TARGETS } from "../config/war";
import type { GameStateManager } from "../core/GameStateManager";
import { createTableArt } from "./TableArt";
import { EffectsManager } from "../effects/EffectsManager";
import type { AudioManager } from "../audio/AudioManager";
import { ECONOMY_TARGETS, FACILITIES } from "../config/economy";
import { TARGETS } from "../data/table";
import { ArmyRenderer } from "../army/ArmyRenderer";

export class PinballScene extends Phaser.Scene {
  private moving!: Phaser.GameObjects.Graphics;
  private effects!: EffectsManager;
  private sphere!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Ellipse;
  private visualTime = 0;
  private background!: Phaser.GameObjects.Image;
  private artKey = "";
  private armyRenderer?: ArmyRenderer;
  private warRenderer?: WarRenderer;
  private magicRenderer?: MagicRenderer;
  private campaignRenderer?:CampaignRenderer;
  constructor(
    private model: GameStateManager,
    private audio: AudioManager,
    private renderUI: () => void,
    private campaign?:CampaignManager,
  ) {
    super("greenwood");
  }
  create(): void {
    this.textures.addCanvas("table", createTableArt());
    this.background = this.add
      .image(300, 450, "table")
      .setDisplaySize(600, 900);
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const c = canvas.getContext("2d")!;
    const glow = c.createRadialGradient(32, 32, 10, 32, 32, 30);
    glow.addColorStop(0, "#99eaff80");
    glow.addColorStop(1, "#99eaff00");
    c.fillStyle = glow;
    c.fillRect(0, 0, 64, 64);
    const metal = c.createRadialGradient(24, 22, 1, 33, 34, 20);
    metal.addColorStop(0, "#ffffff");
    metal.addColorStop(0.24, "#e2f5f7");
    metal.addColorStop(0.5, "#7e9eaa");
    metal.addColorStop(0.75, "#294553");
    metal.addColorStop(1, "#b8e8ed");
    c.fillStyle = metal;
    c.beginPath();
    c.arc(32, 32, 19, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#dcf4f9";
    c.lineWidth = 1;
    c.stroke();
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.ellipse(26, 24, 4, 2, -0.7, 0, Math.PI * 2);
    c.fill();
    this.textures.addCanvas("sphere", canvas);
    this.effects = new EffectsManager(this, this.model);
    this.moving = this.add.graphics().setDepth(15);
    this.armyRenderer = new ArmyRenderer(this, this.model);
    this.warRenderer = new WarRenderer(this, this.model);
    this.magicRenderer = new MagicRenderer(this, this.model);
    if(this.campaign)this.campaignRenderer=new CampaignRenderer(this,this.campaign);
    this.shadow = this.add.ellipse(0, 0, 23, 13, 0x051c20, 0.65).setDepth(18);
    this.sphere = this.add
      .image(554, 802, "sphere")
      .setDisplaySize(34, 34)
      .setDepth(20);
    this.events.once("shutdown", () => this.effects.dispose());
  }
  update(_time: number, delta: number): void {
    this.model.update(delta);
    this.audio.update();
    this.renderUI();
    const dt = Math.min(delta, 50) / 1000;
    if (this.model.state !== "paused") this.visualTime += dt;
    this.effects.update(dt);
    this.armyRenderer?.draw();
    this.warRenderer?.draw();
    this.magicRenderer?.draw();
    this.campaignRenderer?.draw();
    const economy =
      this.model.mode === "kingdom" ? this.model.economy : undefined;
    const artKey = `${this.model.war ? "war" : this.model.mode}:${economy ? FACILITIES.map((f) => economy.data.facilities[f.id].level).join("") + economy.data.rank : ""}`;
    if (
      artKey +
        (this.model.war?.data.structures
          .filter((s) => s.hp <= 0)
          .map((s) => s.id)
          .join() ?? "") !==
      this.artKey
    ) {
      this.artKey =
        artKey +
        (this.model.war?.data.structures
          .filter((s) => s.hp <= 0)
          .map((s) => s.id)
          .join() ?? "");
      const levels = economy
        ? Object.fromEntries(
            FACILITIES.map((f) => [
              f.target,
              economy.data.facilities[f.id].level,
            ]),
          )
        : {};
      const canvas = createTableArt(
        economy
          ? this.model.war
            ? WAR_TARGETS.filter((t) =>
                this.model.war!.data.structures.some(
                  (s) => s.side === "ally" && s.fixed === t.id && s.hp > 0,
                ),
              )
            : ECONOMY_TARGETS
          : TARGETS,
        levels,
        economy?.data.rank,
        !!this.model.war,
      );
      const texture = this.textures.get(
        "table",
      ) as Phaser.Textures.CanvasTexture;
      // The source art uses a 2× drawing transform; reset it before copying a new bitmap.
      texture.context.setTransform(1, 0, 0, 1, 0, 0);
      texture.context.clearRect(0, 0, 1200, 1800);
      texture.context.drawImage(canvas, 0, 0);
      texture.refresh();
      this.background.setTexture("table").setDisplaySize(600, 900);
    }
    const ball = this.model.displayPhysics.ball;
    this.sphere.setVisible(
      !!ball && (!this.model.magic || !!this.model.testBall),
    );
    this.shadow.setVisible(
      !!ball && (!this.model.magic || !!this.model.testBall),
    );
    if (ball) {
      this.sphere.setPosition(ball.position.x, ball.position.y);
      this.sphere.setRotation(ball.angle);
      this.shadow.setPosition(ball.position.x + 4, ball.position.y + 7);
    }
    if (
      economy &&
      economy.data.time - economy.data.facilities.sanctuary.lastHit < 350
    )
      this.sphere.setTint(0xa7eeff);
    else this.sphere.clearTint();
    const g = this.moving;
    g.clear();
    for (const f of [
      this.model.displayPhysics.left,
      this.model.displayPhysics.right,
    ]) {
      const tip = f.tip,
        pivot = f.pivot;
      g.lineStyle(25, 0x071b1c, 0.5);
      g.lineBetween(pivot.x + 2, pivot.y + 7, tip.x + 2, tip.y + 7);
      g.lineStyle(23, this.model.tilt.tilted ? 0x705952 : 0xc7b780);
      g.lineBetween(pivot.x, pivot.y, tip.x, tip.y);
      g.fillStyle(0xc7b780);
      g.fillCircle(pivot.x, pivot.y, 13);
      g.fillCircle(tip.x, tip.y, 9);
      g.lineStyle(14, this.model.tilt.tilted ? 0x524747 : 0x315e58);
      g.lineBetween(pivot.x, pivot.y, tip.x, tip.y);
      g.lineStyle(2, 0xefe4b0, 0.8);
      g.lineBetween(pivot.x, pivot.y - 6, tip.x, tip.y - 5);
      g.fillStyle(0x183f3b);
      g.fillCircle(pivot.x, pivot.y, 9);
      g.lineStyle(2, 0xe2cc8d);
      g.strokeCircle(pivot.x, pivot.y, 6);
    }
    const compressed = this.model.charge * 17;
    g.lineStyle(2, 0xb5c3b3, 0.8);
    for (let i = 0; i < 8; i++)
      g.lineBetween(
        544,
        819 + compressed + i * (3.2 - compressed / 8),
        564,
        821 + compressed + i * (3.2 - compressed / 8),
      );
    g.lineStyle(5, 0xb6c3b1);
    g.lineBetween(544, 817 + compressed, 564, 817 + compressed);
    const gate = this.model.displayPhysics.gate;
    g.lineStyle(
      3,
      this.model.displayPhysics.gateClosed ? 0xd7c187 : 0x6e8d83,
      0.9,
    );
    const angle = this.model.displayPhysics.gateClosed
      ? gate.angle
      : gate.angle - 1;
    g.lineBetween(
      480,
      150,
      480 + Math.cos(angle) * 54,
      150 + Math.sin(angle) * 54,
    );
    // Subtle flames, flags, and crystal halo remain independent of gameplay bodies.
    for (const x of [220, 344]) {
      const pulse = Math.sin(this.visualTime * 9 + x) * 2;
      g.fillStyle(0xf1bc66, 0.08);
      g.fillCircle(x, 168, 18 + pulse);
      g.fillStyle(0xeab56b, 0.85);
      g.fillEllipse(x, 166, 5, 10 + pulse);
      g.fillStyle(0xffedb2);
      g.fillEllipse(x, 167, 2, 5);
    }
    const wave = Math.sin(this.visualTime * 3) * 3;
    g.fillStyle(0xd0b575);
    g.fillTriangle(309, 10, 334, 16 + wave, 309, 21);
    g.lineStyle(2, 0xd8c285);
    g.lineBetween(309, 8, 309, 33);
    g.lineStyle(1, 0x9de2ed, 0.2 + Math.sin(this.visualTime * 2) * 0.1);
    g.strokeCircle(402, 492, 39);
    if (this.model.score.bonusActive) {
      g.lineStyle(3, 0xffdc89, 0.55 + Math.sin(this.visualTime * 5) * 0.35);
      g.strokeCircle(103, 512, 27);
    }
    if (economy) {
      // Windmill blades and sanctuary rings are decorative, never physics bodies.
      for (let i = 0; i < 4; i++) {
        const a = this.visualTime * 1.4 + (i * Math.PI) / 2;
        g.lineStyle(4, 0xe3d9af);
        g.lineBetween(160, 540, 160 + Math.cos(a) * 18, 540 + Math.sin(a) * 18);
      }
      g.lineStyle(1, 0x9ee3f5, 0.6);
      g.strokeEllipse(345, 585, 46 + Math.sin(this.visualTime * 2) * 5, 16);
      for (const f of FACILITIES) {
        const target = ECONOMY_TARGETS.find((t) => t.id === f.target)!;
        const state = economy.status(f.id);
        if (state === "OVERLOADED" || state === "RECOVERING") {
          const progress = Math.max(
            0,
            (economy.data.facilities[f.id].overloadedUntil -
              economy.data.time) /
              7000,
          );
          g.lineStyle(3, 0xe49b72, 0.8);
          g.beginPath();
          g.arc(
            target.x,
            target.y,
            target.radius + 8,
            -Math.PI / 2,
            -Math.PI / 2 + progress * Math.PI * 2,
          );
          g.strokePath();
          g.fillStyle(0xb8a592, 0.25);
          g.fillCircle(
            target.x + Math.sin(this.visualTime) * 5,
            target.y - 42 - ((this.visualTime * 9) % 12),
            5,
          );
        } else if (state === "BONUS") {
          g.lineStyle(2, 0xf4d790, 0.5);
          g.strokeCircle(target.x, target.y, target.radius + 6);
        }
        if (economy.resources.space(f.resource) === 0) {
          g.fillStyle(0xe4a474);
          g.fillTriangle(
            target.x + 20,
            target.y - 31,
            target.x + 30,
            target.y - 31,
            target.x + 25,
            target.y - 41,
          );
        }
      }
      if (economy.data.royalUntil > economy.data.time) {
        g.lineStyle(3, 0xffde80, 0.4 + Math.sin(this.visualTime * 4) * 0.2);
        g.strokeCircle(282, 204, 44);
      }
    }
  }
}
