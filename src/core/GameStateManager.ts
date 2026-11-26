import Matter from "matter-js";
import { EventBus, type GameState } from "./events";
import { PHYSICS } from "../config/physics";
import { PinballPhysics, type Contact } from "../physics/PinballPhysics";
import { ScoreManager } from "../systems/ScoreManager";
import { TiltSystem } from "../systems/TiltSystem";
import { BallRecoverySystem } from "../systems/BallRecoverySystem";
import { SaveManager } from "../systems/SaveManager";
import { ko } from "../data/strings";
import { ECONOMY_TARGETS } from "../config/economy";
import { EconomyManager } from "../economy/EconomyManager";
import { EconomySaveManager } from "../economy/EconomySaveManager";
import { BuildingManager } from "../building/BuildingManager";
import { buildingConfig } from "../config/buildings";
import {
  applyBuildings,
  buildingImpulse,
} from "../building/BuildingPhysicsAdapter";
import { TestBallSimulator } from "../building/TestBallSimulator";

export class GameStateManager {
  readonly events = new EventBus();
  physics = new PinballPhysics();
  score = new ScoreManager();
  tilt = new TiltSystem();
  recovery = new BallRecoverySystem();
  state: GameState = "menu";
  mode: "classic" | "kingdom" = "classic";
  economy?: EconomyManager;
  builder?: BuildingManager;
  testBall?: TestBallSimulator;
  private buildPrevious: GameState = "playing";
  get displayPhysics() {
    return this.testBall?.physics ?? this.physics;
  }
  saveConflict = false;
  remaining: number = PHYSICS.spheres;
  time = 0;
  charge = 0;
  charging = false;
  tutorialStep = -1;
  tutorialFlippers = new Set<string>();
  private accumulator = 0;
  private respawnAt = 0;
  private recorded = true;
  private lastCheckpoint = 0;
  constructor(
    readonly save = new SaveManager(),
    readonly economySave = new EconomySaveManager(),
  ) {
    this.bindPhysics();
    this.physics.spawn();
  }
  private bindPhysics(): void {
    this.physics.onHit = (contact) => this.hit(contact);
    this.physics.onBuildingHit = (id, speed) => this.buildingHit(id, speed);
    this.physics.onImpact = (x, y, speed) => {
      if (speed > 160) this.events.emit("impact", { x, y, speed });
    };
  }
  start(tutorial = !this.save.data.tutorialDone): void {
    this.testBall?.dispose();
    this.testBall = undefined;
    this.builder = undefined;
    this.finishRecord();
    this.mode = "classic";
    this.economy = undefined;
    this.saveConflict = false;
    this.physics.dispose();
    this.physics = new PinballPhysics();
    this.bindPhysics();
    this.physics.spawn();
    this.score = new ScoreManager();
    this.tilt.reset();
    this.recovery.reset();
    this.remaining = PHYSICS.spheres;
    this.time = 0;
    this.accumulator = 0;
    this.respawnAt = 0;
    this.charge = 0;
    this.charging = false;
    this.recorded = false;
    this.tutorialStep = tutorial ? 0 : -1;
    this.tutorialFlippers.clear();
    this.setState("playing");
    this.events.emit("message", { text: ko.ready });
  }
  startKingdom(fresh: boolean): void {
    this.finishRecord();
    if (fresh) {
      const old = this.economySave.load();
      if (old) this.economySave.archive(old);
    }
    this.mode = "kingdom";
    this.recorded = true;
    this.saveConflict = false;
    const saved = fresh ? null : this.economySave.load();
    this.economy = saved
      ? new EconomyManager(saved, this.economySave)
      : EconomyManager.create(this.economySave);
    this.economy.onNotice = (text) =>
      this.events.emit("message", { text, tone: "gold" });
    this.economy.resumeCheckpoint();
    this.builder = new BuildingManager(this.economy);
    if(this.economySave.recoveredBuildings)this.events.emit('message',{text:`안전하지 않은 건물 ${this.economySave.recoveredBuildings}개를 제외하고 저장을 복원했습니다. 자원과 기존 경제 기록은 유지했습니다.`,tone:'warning'});
    this.builder.onChange = () => {
      applyBuildings(this.physics, this.builder!.buildings);
      this.events.emit("construction", { kind: "build" });
    };
    const data = this.economy.data;
    this.physics.dispose();
    this.physics = new PinballPhysics(ECONOMY_TARGETS);
    this.bindPhysics();
    this.score = new ScoreManager();
    applyBuildings(this.physics, this.builder.buildings);
    this.score.score = data.score;
    this.score.palaceHits = data.palaceHits;
    this.score.hits = data.totalHits;
    this.score.combo.max = data.scoreComboMax;
    this.time = data.time;
    this.lastCheckpoint = data.time;
    this.respawnAt = 0;
    this.accumulator = 0;
    this.tilt.reset();
    this.recovery.reset();
    this.tutorialStep = -1;
    if (data.launchState === "ended") this.setState("over");
    else if (data.launchState === "awaiting") {
      if (this.economy.canContinue()) this.setState("relaunch");
      else this.endKingdom();
    } else {
      this.physics.spawn();
      this.setState("playing");
    }
  }
  relaunch(): boolean {
    if (this.state !== "relaunch" || !this.economy?.payRelaunch()) return false;
    this.tilt.reset();
    this.recovery.reset();
    this.physics.spawn();
    this.setState("playing");
    return true;
  }
  endKingdom(): void {
    this.syncEconomy();
    this.economy?.end();
    this.setState("over");
  }
  syncEconomy(): void {
    if (this.mode !== "kingdom" || !this.economy) return;
    const d = this.economy.data;
    d.score = this.score.score;
    d.palaceHits = this.score.palaceHits;
    d.totalHits = this.score.hits;
    d.scoreComboMax = this.score.combo.max;
    d.time = this.time;
  }
  checkpoint(): void {
    if (this.saveConflict) return;
    this.syncEconomy();
    this.economy?.checkpoint();
  }
  invalidateEconomy(): void {
    if (this.mode !== "kingdom") return;
    this.saveConflict = true;
    this.pause();
  }
  setState(state: GameState): void {
    this.state = state;
    this.clearInputs();
    this.accumulator = 0;
    this.events.emit("state", { state });
  }
  pause(): void {
    if (this.state === "playing") this.setState("paused");
  }
  resume(): void {
    if (this.state === "paused" && !this.saveConflict && !this.builder?.active)
      this.setState("playing");
  }
  enterBuild(): boolean {
    if (
      this.mode !== "kingdom" ||
      !this.builder ||
      this.saveConflict ||
      this.state === "over" ||
      this.state === "menu"
    )
      return false;
    if (this.builder.active) return true;
    this.buildPrevious = this.state;
    this.setState("paused");
    this.builder.enter(
      this.physics.ball ? { ...this.physics.ball.position } : undefined,
    );
    return true;
  }
  leaveBuild(): string | null {
    if (!this.builder?.active) return null;
    this.stopTestBall();
    const error = this.builder.leave();
    if (error) return error;
    this.setState(this.buildPrevious);
    return null;
  }
  startTestBall() {
    if (!this.builder?.active || this.testBall) return;
    this.builder.data.stats.tests++;
    this.builder.data.tutorial = 5;
    this.economy?.checkpoint();
    this.testBall = new TestBallSimulator(this.builder.buildings);
  }
  stopTestBall() {
    this.testBall?.dispose();
    this.testBall = undefined;
  }
  private buildingHit(id: string, speed: number) {
    const b = this.builder?.buildings.find((b) => b.id === id);
    if (!b || this.state !== "playing") return;
    const valid =
      !this.tilt.tilted &&
      this.time >= this.recovery.suppressUntil &&
      this.time - b.lastHit >= Math.max(240, 600 - b.level * 30) &&
      speed > 40;
    if (!valid) return;
    b.lastHit = this.time;
    if(b.type==='reflector'){
      const p=b.production;p.recent=p.recent.filter(t=>this.time-t<8000);p.recent.push(this.time);
      if(p.recent.length>=7+b.level&&p.overloadedUntil<=this.time){p.overloadedUntil=this.time+6000;p.recent=[];}
      const body=this.physics.buildingBodies.get(id);if(body)body.restitution=p.overloadedUntil>this.time?.35:1;
      if(p.overloadedUntil>this.time)return;
    }
    buildingImpulse(this.physics, b);
    const c = buildingConfig(b.type)!;
    const production = this.economy?.harvest(id, speed, true);
    if (production)
      this.events.emit("production", {
        resource: production.facility.resource,
        amount: production.amount,
        overflow: production.overflow,
        multiplier: production.multiplier,
        strength: production.strength,
        x: b.x,
        y: b.y,
      });
    const target = {
      id,
      kind: "stone" as const,
      name: c.name,
      x: b.x,
      y: b.y,
      radius: c.width / 2,
      points: 100,
      kick: 0,
      color: 0xd8c17b,
    };
    const result = this.score.hit(target, this.time, true);
    if (result)
      this.events.emit("hit", {
        id,
        kind: target.kind,
        x: b.x,
        y: b.y,
        points: result.points,
        combo: this.score.combo.count,
        multiplier: this.score.combo.multiplier,
      });
    if (c.category === "physics" && this.builder)
      this.builder.data.stats.reflectorCombo = Math.max(
        this.builder.data.stats.reflectorCombo,
        this.score.combo.count,
      );
    if (this.time >= b.readyAt) {
      b.charge++;
      if (b.charge >= 5) {
        b.charge = 0;
        b.readyAt = this.time + (b.type === "altar" ? 30000 : 10000);
        if (b.type === "altar")
          this.economy?.resources.grant("energy", 5 + b.level - 1);
        else if (c.category === "military") this.score.score += 200;
        this.events.emit("message", { text: `${c.name} 활성화`, tone: "gold" });
      }
    }
    this.checkpoint();
  }
  menu(): void {
    this.stopTestBall();
    if (this.builder) this.builder.active = false;
    this.finishRecord();
    this.physics.dispose();
    this.physics = new PinballPhysics();
    this.bindPhysics();
    this.physics.spawn();
    this.mode = "classic";
    this.economy = undefined;
    this.saveConflict = false;
    this.score = new ScoreManager();
    this.time = 0;
    this.remaining = PHYSICS.spheres;
    this.tutorialStep = -1;
    this.tilt.reset();
    this.recovery.reset();
    this.setState("menu");
  }
  clearInputs(): void {
    this.physics.left.held = false;
    this.physics.right.held = false;
    this.charging = false;
    this.charge = 0;
  }
  flipper(side: "left" | "right", down: boolean): void {
    if (this.testBall) {
      this.testBall.physics[side].held = down;
      return;
    }
    if (this.state !== "playing") return;
    const flipper = this.physics[side];
    if (down && !flipper.held && !this.tilt.tilted)
      this.events.emit("flipper", { side });
    flipper.held = down;
    if (down) this.tutorialFlippers.add(side);
    if (this.tutorialStep === 2 && this.tutorialFlippers.size === 2)
      this.tutorialStep = 3;
  }
  chargeStart(): void {
    if (this.testBall) {
      if (!this.testBall.physics.launched) {
        this.testBall.charging = true;
        this.testBall.charge = 0;
      }
      return;
    }
    if (
      this.state !== "playing" ||
      !this.physics.ball ||
      this.physics.launched ||
      this.charging
    )
      return;
    this.charging = true;
    this.charge = 0;
    if (this.tutorialStep === 0) this.tutorialStep = 1;
  }
  chargeRelease(): void {
    if (this.testBall) {
      this.testBall.release();
      return;
    }
    if (this.state !== "playing" || !this.charging) return;
    if (this.mode === "kingdom" && !this.economy?.beginLaunch()) {
      this.charging = false;
      this.charge = 0;
      return;
    }
    this.physics.launch(this.charge);
    this.events.emit("launch", { power: this.charge });
    this.charging = false;
    this.charge = 0;
    if (this.tutorialStep === 1) this.tutorialStep = 2;
  }
  nudge(): void {
    if (
      this.state !== "playing" ||
      !this.physics.launched ||
      !this.physics.ball ||
      !this.tilt.nudge(this.time)
    )
      return;
    if (this.tilt.tilted) {
      this.clearInputs();
      this.score.combo.reset();
      if (this.economy) this.economy.data.combo.count = 0;
      this.events.emit("message", { text: ko.tilt, tone: "warning" });
    } else {
      const ball = this.physics.ball;
      Matter.Body.setVelocity(ball, {
        x: ball.velocity.x + (ball.position.x < 288 ? 1.6 : -1.6),
        y: ball.velocity.y - 2.5,
      });
      this.events.emit("message", {
        text: this.tilt.heat > 65 ? "주의 · TILT 위험" : "테이블 흔들기",
        tone: this.tilt.heat > 65 ? "warning" : undefined,
      });
    }
  }
  update(frameMs: number): void {
    if (this.testBall) {
      this.testBall.update(frameMs);
      return;
    }
    if (this.state !== "playing") return;
    this.accumulator += Math.max(0, Math.min(frameMs, PHYSICS.maxFrameMs));
    while (this.accumulator >= PHYSICS.stepMs && this.state === "playing") {
      this.accumulator -= PHYSICS.stepMs;
      this.time += PHYSICS.stepMs;
      const dt = PHYSICS.stepMs / 1000;
      if (this.charging)
        this.charge = Math.min(
          1,
          this.charge + PHYSICS.stepMs / PHYSICS.launcher.chargeMs,
        );
      this.score.combo.tick(this.time);
      this.tilt.update(dt);
      this.economy?.tick(this.time);
      this.physics.step(dt, !this.tilt.tilted);
      const recovered = this.recovery.update(this.physics, dt, this.time);
      if (recovered) {
        if (recovered === "return") {
          this.physics.spawn();
          if (this.economy) {
            this.economy.data.launchState = "ready";
            this.checkpoint();
          }
        }
        this.score.combo.reset();
        if (this.economy) this.economy.data.combo.count = 0;
        this.events.emit("message", {
          text: recovered === "return" ? ko.return : ko.recovery,
        });
      }
      if (this.physics.ball && this.physics.ball.position.y > PHYSICS.drainY)
        this.drain();
      if (
        !this.physics.ball &&
        this.respawnAt > 0 &&
        this.time >= this.respawnAt
      ) {
        this.respawnAt = 0;
        this.tilt.reset();
        this.recovery.reset();
        this.physics.spawn();
        this.events.emit("message", { text: ko.ready });
      }
      if (this.economy && this.time - this.lastCheckpoint >= 5000) {
        this.lastCheckpoint = this.time;
        this.checkpoint();
      }
    }
  }
  private hit({ target, normalSpeed }: Contact): void {
    this.physics.kick(target);
    const result = this.score.hit(
      target,
      this.time,
      !this.tilt.tilted &&
        this.time >= this.recovery.suppressUntil &&
        this.state === "playing",
    );
    if (!result) return;
    this.syncEconomy();
    const production = this.economy?.harvest(target.id, normalSpeed, true);
    if (production)
      this.events.emit("production", {
        resource: production.facility.resource,
        amount: production.amount,
        overflow: production.overflow,
        multiplier: production.multiplier,
        strength: production.strength,
        x: target.x,
        y: target.y,
      });
    this.events.emit("hit", {
      id: target.id,
      kind: target.kind,
      x: target.x,
      y: target.y,
      points: result.points,
      combo: this.score.combo.count,
      multiplier: this.score.combo.multiplier,
    });
    if (result.royal) {
      this.economy?.royal();
      this.events.emit("royal", { x: target.x, y: target.y, points: 3000 });
    }
    if (this.economy) this.checkpoint();
    if (this.tutorialStep === 3) this.tutorialStep = 4;
    if (this.tutorialStep === 4 && target.kind === "palace")
      this.tutorialStep = 5;
    if (this.tutorialStep === 5 && this.score.combo.count >= 3)
      this.finishTutorial();
  }
  private drain(): void {
    if (!this.physics.ball) return;
    if (this.mode === "kingdom" && this.economy) {
      this.physics.removeBall();
      this.clearInputs();
      this.score.combo.reset();
      this.syncEconomy();
      this.economy.loseBall();
      this.events.emit("drain", {
        remaining: Math.floor(this.economy.data.resources.energy / 20),
      });
      if (this.economy.canContinue()) this.setState("relaunch");
      else this.endKingdom();
      return;
    }
    this.physics.removeBall();
    this.remaining--;
    this.score.combo.reset();
    this.clearInputs();
    this.events.emit("drain", { remaining: this.remaining });
    if (this.remaining <= 0) {
      this.finishRecord();
      this.setState("over");
    } else {
      this.respawnAt = this.time + 1100;
      this.events.emit("message", { text: ko.lost });
    }
  }
  finishTutorial(): void {
    this.tutorialStep = -1;
    this.save.data.tutorialDone = true;
    this.save.persist();
  }
  replayTutorial(): void {
    this.tutorialStep = 0;
    this.tutorialFlippers.clear();
  }
  private finishRecord(): void {
    if (this.mode === "kingdom") {
      this.checkpoint();
      return;
    }
    if (this.recorded) return;
    this.recorded = true;
    this.save.record({
      score: this.score.score,
      combo: this.score.combo.max,
      hits: this.score.hits,
      palaceHits: this.score.palaceHits,
      seconds: Math.floor(this.time / 1000),
      date: new Date().toISOString().slice(0, 10),
    });
  }
  dispose(): void {
    this.stopTestBall();
    this.physics.dispose();
    this.events.clear();
  }
}
