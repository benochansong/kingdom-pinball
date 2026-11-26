import Matter from 'matter-js';
import { EventBus, type GameState } from './events';
import { PHYSICS } from '../config/physics';
import { PinballPhysics, type Contact } from '../physics/PinballPhysics';
import { ScoreManager } from '../systems/ScoreManager';
import { TiltSystem } from '../systems/TiltSystem';
import { BallRecoverySystem } from '../systems/BallRecoverySystem';
import { SaveManager } from '../systems/SaveManager';
import { ko } from '../data/strings';

export class GameStateManager {
  readonly events = new EventBus();
  physics = new PinballPhysics();
  score = new ScoreManager();
  tilt = new TiltSystem();
  recovery = new BallRecoverySystem();
  state: GameState = 'menu';
  remaining: number = PHYSICS.spheres;
  time = 0;
  charge = 0;
  charging = false;
  tutorialStep = -1;
  tutorialFlippers = new Set<string>();
  private accumulator = 0;
  private respawnAt = 0;
  private recorded = true;
  constructor(readonly save = new SaveManager()) { this.bindPhysics(); this.physics.spawn(); }
  private bindPhysics(): void {
    this.physics.onHit = contact => this.hit(contact);
    this.physics.onImpact = (x, y, speed) => { if (speed > 160) this.events.emit('impact', { x, y, speed }); };
  }
  start(tutorial = !this.save.data.tutorialDone): void {
    this.finishRecord();
    this.physics.dispose(); this.physics = new PinballPhysics(); this.bindPhysics(); this.physics.spawn();
    this.score = new ScoreManager(); this.tilt.reset(); this.recovery.reset();
    this.remaining = PHYSICS.spheres; this.time = 0; this.accumulator = 0; this.respawnAt = 0;
    this.charge = 0; this.charging = false; this.recorded = false;
    this.tutorialStep = tutorial ? 0 : -1; this.tutorialFlippers.clear();
    this.setState('playing'); this.events.emit('message', { text: ko.ready });
  }
  setState(state: GameState): void { this.state = state; this.clearInputs(); this.accumulator = 0; this.events.emit('state', { state }); }
  pause(): void { if (this.state === 'playing') this.setState('paused'); }
  resume(): void { if (this.state === 'paused') this.setState('playing'); }
  menu(): void { this.finishRecord(); this.setState('menu'); this.physics.spawn(); }
  clearInputs(): void { this.physics.left.held = false; this.physics.right.held = false; this.charging = false; this.charge = 0; }
  flipper(side: 'left' | 'right', down: boolean): void {
    if (this.state !== 'playing') return;
    const flipper = this.physics[side];
    if (down && !flipper.held && !this.tilt.tilted) this.events.emit('flipper', { side });
    flipper.held = down;
    if (down) this.tutorialFlippers.add(side);
    if (this.tutorialStep === 2 && this.tutorialFlippers.size === 2) this.tutorialStep = 3;
  }
  chargeStart(): void {
    if (this.state !== 'playing' || !this.physics.ball || this.physics.launched || this.charging) return;
    this.charging = true; this.charge = 0;
    if (this.tutorialStep === 0) this.tutorialStep = 1;
  }
  chargeRelease(): void {
    if (this.state !== 'playing' || !this.charging) return;
    this.physics.launch(this.charge); this.events.emit('launch', { power: this.charge });
    this.charging = false; this.charge = 0;
    if (this.tutorialStep === 1) this.tutorialStep = 2;
  }
  nudge(): void {
    if (this.state !== 'playing' || !this.physics.launched || !this.physics.ball || !this.tilt.nudge(this.time)) return;
    if (this.tilt.tilted) { this.clearInputs(); this.score.combo.reset(); this.events.emit('message', { text: ko.tilt, tone: 'warning' }); }
    else {
      const ball = this.physics.ball;
      Matter.Body.setVelocity(ball, { x: ball.velocity.x + (ball.position.x < 288 ? 1.6 : -1.6), y: ball.velocity.y - 2.5 });
      this.events.emit('message', { text: this.tilt.heat > 65 ? '주의 · TILT 위험' : '테이블 흔들기', tone: this.tilt.heat > 65 ? 'warning' : undefined });
    }
  }
  update(frameMs: number): void {
    if (this.state !== 'playing') return;
    this.accumulator += Math.max(0, Math.min(frameMs, PHYSICS.maxFrameMs));
    while (this.accumulator >= PHYSICS.stepMs && this.state === 'playing') {
      this.accumulator -= PHYSICS.stepMs; this.time += PHYSICS.stepMs;
      const dt = PHYSICS.stepMs / 1000;
      if (this.charging) this.charge = Math.min(1, this.charge + PHYSICS.stepMs / PHYSICS.launcher.chargeMs);
      this.score.combo.tick(this.time); this.tilt.update(dt);
      this.physics.step(dt, !this.tilt.tilted);
      const recovered = this.recovery.update(this.physics, dt, this.time);
      if (recovered) {
        if (recovered === 'return') this.physics.spawn();
        this.score.combo.reset();
        this.events.emit('message', { text: recovered === 'return' ? ko.return : ko.recovery });
      }
      if (this.physics.ball && this.physics.ball.position.y > PHYSICS.drainY) this.drain();
      if (!this.physics.ball && this.respawnAt > 0 && this.time >= this.respawnAt) {
        this.respawnAt = 0; this.tilt.reset(); this.recovery.reset(); this.physics.spawn();
        this.events.emit('message', { text: ko.ready });
      }
    }
  }
  private hit({ target }: Contact): void {
    this.physics.kick(target);
    const result = this.score.hit(target, this.time, !this.tilt.tilted && this.time >= this.recovery.suppressUntil && this.state === 'playing');
    if (!result) return;
    this.events.emit('hit', { id: target.id, kind: target.kind, x: target.x, y: target.y, points: result.points, combo: this.score.combo.count, multiplier: this.score.combo.multiplier });
    if (result.royal) this.events.emit('royal', { x: target.x, y: target.y, points: 3000 });
    if (this.tutorialStep === 3) this.tutorialStep = 4;
    if (this.tutorialStep === 4 && target.kind === 'palace') this.tutorialStep = 5;
    if (this.tutorialStep === 5 && this.score.combo.count >= 3) this.finishTutorial();
  }
  private drain(): void {
    if (!this.physics.ball) return;
    this.physics.removeBall(); this.remaining--; this.score.combo.reset(); this.clearInputs();
    this.events.emit('drain', { remaining: this.remaining });
    if (this.remaining <= 0) { this.finishRecord(); this.setState('over'); }
    else { this.respawnAt = this.time + 1100; this.events.emit('message', { text: ko.lost }); }
  }
  finishTutorial(): void { this.tutorialStep = -1; this.save.data.tutorialDone = true; this.save.persist(); }
  replayTutorial(): void { this.tutorialStep = 0; this.tutorialFlippers.clear(); }
  private finishRecord(): void {
    if (this.recorded) return;
    this.recorded = true;
    this.save.record({ score: this.score.score, combo: this.score.combo.max, hits: this.score.hits, palaceHits: this.score.palaceHits, seconds: Math.floor(this.time / 1000), date: new Date().toISOString().slice(0, 10) });
  }
  dispose(): void { this.physics.dispose(); this.events.clear(); }
}
