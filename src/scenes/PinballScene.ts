import Phaser from 'phaser';
import type { GameStateManager } from '../core/GameStateManager';
import { createTableArt } from './TableArt';
import { EffectsManager } from '../effects/EffectsManager';
import type { AudioManager } from '../audio/AudioManager';

export class PinballScene extends Phaser.Scene {
  private moving!: Phaser.GameObjects.Graphics;
  private effects!: EffectsManager;
  private sphere!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Ellipse;
  private visualTime = 0;
  constructor(private model: GameStateManager, private audio: AudioManager, private renderUI: () => void) { super('greenwood'); }
  create(): void {
    this.textures.addCanvas('table', createTableArt());
    this.add.image(300, 450, 'table').setDisplaySize(600, 900);
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const c = canvas.getContext('2d')!;
    const glow = c.createRadialGradient(32, 32, 10, 32, 32, 30); glow.addColorStop(0, '#99eaff80'); glow.addColorStop(1, '#99eaff00'); c.fillStyle = glow; c.fillRect(0, 0, 64, 64);
    const metal = c.createRadialGradient(24, 22, 1, 33, 34, 20); metal.addColorStop(0, '#ffffff'); metal.addColorStop(0.24, '#e2f5f7'); metal.addColorStop(0.5, '#7e9eaa'); metal.addColorStop(0.75, '#294553'); metal.addColorStop(1, '#b8e8ed');
    c.fillStyle = metal; c.beginPath(); c.arc(32, 32, 19, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#dcf4f9'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(26, 24, 4, 2, -0.7, 0, Math.PI * 2); c.fill();
    this.textures.addCanvas('sphere', canvas);
    this.effects = new EffectsManager(this, this.model);
    this.moving = this.add.graphics().setDepth(15);
    this.shadow = this.add.ellipse(0, 0, 23, 13, 0x051c20, 0.65).setDepth(18);
    this.sphere = this.add.image(554, 802, 'sphere').setDisplaySize(34, 34).setDepth(20);
    this.events.once('shutdown', () => this.effects.dispose());
  }
  update(_time: number, delta: number): void {
    this.model.update(delta); this.audio.update(); this.renderUI();
    const dt = Math.min(delta, 50) / 1000;
    if (this.model.state !== 'paused') this.visualTime += dt;
    this.effects.update(dt);
    const ball = this.model.physics.ball;
    this.sphere.setVisible(!!ball); this.shadow.setVisible(!!ball);
    if (ball) { this.sphere.setPosition(ball.position.x, ball.position.y); this.sphere.setRotation(ball.angle); this.shadow.setPosition(ball.position.x + 4, ball.position.y + 7); }
    const g = this.moving; g.clear();
    for (const f of [this.model.physics.left, this.model.physics.right]) {
      const tip = f.tip, pivot = f.pivot;
      g.lineStyle(25, 0x071b1c, 0.5); g.lineBetween(pivot.x + 2, pivot.y + 7, tip.x + 2, tip.y + 7);
      g.lineStyle(23, this.model.tilt.tilted ? 0x705952 : 0xc7b780); g.lineBetween(pivot.x, pivot.y, tip.x, tip.y);
      g.fillStyle(0xc7b780); g.fillCircle(pivot.x, pivot.y, 13); g.fillCircle(tip.x, tip.y, 9);
      g.lineStyle(14, this.model.tilt.tilted ? 0x524747 : 0x315e58); g.lineBetween(pivot.x, pivot.y, tip.x, tip.y);
      g.lineStyle(2, 0xefe4b0, 0.8); g.lineBetween(pivot.x, pivot.y - 6, tip.x, tip.y - 5);
      g.fillStyle(0x183f3b); g.fillCircle(pivot.x, pivot.y, 9); g.lineStyle(2, 0xe2cc8d); g.strokeCircle(pivot.x, pivot.y, 6);
    }
    const compressed = this.model.charge * 17;
    g.lineStyle(2, 0xb5c3b3, 0.8);
    for (let i = 0; i < 8; i++) g.lineBetween(544, 819 + compressed + i * (3.2 - compressed / 8), 564, 821 + compressed + i * (3.2 - compressed / 8));
    g.lineStyle(5, 0xb6c3b1); g.lineBetween(544, 817 + compressed, 564, 817 + compressed);
    const gate = this.model.physics.gate;
    g.lineStyle(3, this.model.physics.gateClosed ? 0xd7c187 : 0x6e8d83, 0.9);
    const angle = this.model.physics.gateClosed ? gate.angle : gate.angle - 1;
    g.lineBetween(480, 150, 480 + Math.cos(angle) * 54, 150 + Math.sin(angle) * 54);
    // Subtle flames, flags, and crystal halo remain independent of gameplay bodies.
    for (const x of [220, 344]) {
      const pulse = Math.sin(this.visualTime * 9 + x) * 2;
      g.fillStyle(0xf1bc66, 0.08); g.fillCircle(x, 168, 18 + pulse);
      g.fillStyle(0xeab56b, 0.85); g.fillEllipse(x, 166, 5, 10 + pulse); g.fillStyle(0xffedb2); g.fillEllipse(x, 167, 2, 5);
    }
    const wave = Math.sin(this.visualTime * 3) * 3;
    g.fillStyle(0xd0b575); g.fillTriangle(309, 10, 334, 16 + wave, 309, 21);
    g.lineStyle(2, 0xd8c285); g.lineBetween(309, 8, 309, 33);
    g.lineStyle(1, 0x9de2ed, 0.2 + Math.sin(this.visualTime * 2) * 0.1); g.strokeCircle(402, 492, 39);
    if (this.model.score.bonusActive) { g.lineStyle(3, 0xffdc89, 0.55 + Math.sin(this.visualTime * 5) * 0.35); g.strokeCircle(103, 512, 27); }
  }
}
