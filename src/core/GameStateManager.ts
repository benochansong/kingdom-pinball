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
import { ArmyManager } from "../army/ArmyManager";
import type { BattleRecord } from "../army/types";
import { WarManager, freshWar } from "../war/WarManager";
import { WarSaveManager } from "../war/WarSaveManager";
import type { WarOptions } from "../war/types";
import { WAR_TARGETS } from "../config/war";
import { MagicManager } from "../magic/MagicManager";
import type { SessionExtension } from "../campaign/types";
import { BallProtection, freshProtection } from "../systems/BallProtection";

import {
  RescueCannon,
  freshRescue,
  type RescueData,
} from "../systems/RescueCannon";
import { RESCUE } from "../config/rescue";

export class GameStateManager {
  private rescueController = new RescueCannon();
  private classicRescue = freshRescue("classic-idle");
  get rescue(): RescueData {
    if (!this.economy) return this.classicRescue;
    return (this.economy.data.rescue ??= freshRescue(this.economy.data.id));
  }
  updateRescue() {
    const enabled =
      RESCUE.rescueEnabled &&
      !this.practice &&
      !this.sandboxKind &&
      !this.tilt.tilted &&
      this.sessionExtension?.rescueEnabled !== false;
    this.rescueController.update(
      this.physics,
      this.rescue,
      this.time,
      enabled,
      this.magic?.balls?.state()?.type ?? "steel",
      () => this.checkpoint(),
      (phase, side, ball) => {
        this.events.emit("rescue", {
          phase,
          side,
          x: ball.position.x,
          y: ball.position.y,
          remaining: this.rescue.total - this.rescue.used,
        });
        if (phase === "RESCUE_CHARGING")
          this.events.emit("message", {
            text: `CAPTURED · 포착 완료 · ${this.rescue.total - this.rescue.used}회 남음`,
            tone: "gold",
          });
        if (phase === "RESCUE_LAUNCHING") {
          this.recovery.reset();
          this.events.emit("message", {
            text: `RESCUE SHOT! · 왕실 구조 · ${this.rescue.total - this.rescue.used}회 남음${this.rescue.used === this.rescue.total ? " · NO RESCUE SHOTS LEFT" : ""}`,
            tone: "gold",
          });
        }
      },
    );
  }
  private restoreCapturedRescue() {
    if (!this.rescue.pending || !this.physics.ball) return;
    this.physics.launch(0.8);
    if (this.economy) this.economy.data.launchState = "inflight";
    this.updateRescue();
  }
  private classicProtection = new BallProtection();
  protectedRuns: number[] = [];
  get protection(): BallProtection {
    if (!this.economy) return this.classicProtection;
    const d = this.economy.data;
    d.pinball ??= freshProtection(
      this.save.data.settings.presentation.pinballDifficulty,
      d.time === 0 && d.losses === 0,
    );
    return new BallProtection(d.pinball);
  }
  nextBallProtection() {
    const p = this.protection;
    p.next();
    if (this.economy) this.economy.data.pinball = p.data;
    this.checkpoint();
  }
  /** Called by local and authoritative online simulation; never restarts a free-save timer. */
  updateProtection() {
    if (
      this.sessionExtension?.ballProtection === false ||
      this.practice ||
      this.tilt.tilted
    )
      return;
    const p = this.protection;
    if (this.physics.launched && this.physics.gateClosed && p.enter(this.time))
      this.checkpoint();
  }

  tryBallSave() {
    if (
      this.physics.balls.length !== 1 ||
      !this.physics.launched ||
      this.physics.ball!.position.y <= PHYSICS.drainY
    )
      return false;
    if (
      this.practice ||
      this.tilt.tilted ||
      this.sessionExtension?.ballProtection === false ||
      !this.protection.save(this.time)
    )
      return false;
    this.magic?.endMulti();
    this.physics.removeBall();
    this.clearInputs();
    this.score.combo.reset();
    if (this.economy) {
      this.economy.data.launchState = "ready";
      this.economy.data.combo.count = 0;
    }
    this.tilt.reset();
    this.recovery.reset();
    this.respawnAt = 0;
    // Persist the spent budget before materializing its replacement.
    this.checkpoint();
    this.physics.spawn();
    this.traceBall("ball-saved");
    this.events.emit("ballProtection", {
      kind: "save",
      x: PHYSICS.launcher.x,
      y: PHYSICS.launcher.y,
    });
    this.events.emit("message", {
      text: "BALL SAVED! · 무료 공 준비 · Space로 발사",
      tone: "gold",
    });
    return true;
  }
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
  army?: ArmyManager;
  war?: WarManager;
  magic?: MagicManager;
  enemyMagic?: MagicManager;
  sessionExtension?: SessionExtension;
  lastBattleResult?: BattleRecord;
  private practice?: {
    magic?: MagicManager;
    economy: EconomyManager;
    builder: BuildingManager;
    army: ArmyManager;
    physics: PinballPhysics;
    score: ScoreManager;
    tilt: TiltSystem;
    recovery: BallRecoverySystem;
    time: number;
  };
  get practicing() {
    return !!this.practice;
  }
  private buildPrevious: GameState = "playing";
  get displayPhysics() {
    return this.testBall?.physics ?? this.physics;
  }
  saveConflict = false;
  remaining: number = PHYSICS.spheres;
  time = 0;
  lastFrameMs = 0;
  updateCount = 0;
  charge = 0;
  charging = false;
  tutorialStep = -1;
  tutorialFlippers = new Set<string>();
  private accumulator = 0;
  private respawnAt = 0;
  private missingSince = 0;
  readonly ballLog: {
    time: number;
    event: string;
    balls: number;
    energy?: number;
  }[] = [];
  private traceBall(event: string) {
    this.ballLog.push({
      time: Math.round(this.time),
      event,
      balls: this.physics.balls.length,
      energy: this.economy?.data.resources.energy,
    });
    if (this.ballLog.length > 80) this.ballLog.shift();
  }
  get ballStatus() {
    if (this.state === "over") return "game-over";
    if (this.physics.ball)
      return this.charging
        ? "charging"
        : this.physics.launched
          ? "in-play"
          : "ready";
    if (
      this.state === "relaunch" &&
      (this.economy?.data.resources.energy ?? 0) < 20
    )
      return "recovery-required";
    return this.respawnAt > 0 ? "respawn-pending" : "missing";
  }
  private recorded = true;
  private lastCheckpoint = 0;
  constructor(
    readonly save = new SaveManager(),
    readonly economySave = new EconomySaveManager(),
    readonly warSave = new WarSaveManager(),
  ) {
    this.bindPhysics();
    this.physics.spawn();
  }
  private bindPhysics(): void {
    this.physics.onHit = (contact) => this.hit(contact);
    this.physics.onBuildingHit = (id, speed, ball) =>
      this.buildingHit(id, speed, ball);
    this.physics.onImpact = (x, y, speed) => {
      if (speed > 160) this.events.emit("impact", { x, y, speed });
    };
  }
  sandboxExit?: () => void;
  sandboxKind = "";
  /** Retain a paused session while an isolated exercise owns the active engine. */
  suspendSession() {
    this.checkpoint();
    this.clearInputs();
    const snapshot = {
      sessionExtension: this.sessionExtension,
      physics: this.physics,
      score: this.score,
      tilt: this.tilt,
      recovery: this.recovery,
      state: this.state,
      mode: this.mode,
      economy: this.economy,
      builder: this.builder,
      army: this.army,
      war: this.war,
      magic: this.magic,
      enemyMagic: this.enemyMagic,
      time: this.time,
      remaining: this.remaining,
      saveConflict: this.saveConflict,
      recorded: this.recorded,
      lastCheckpoint: this.lastCheckpoint,
      respawnAt: this.respawnAt,
      classicProtection: this.classicProtection,
      classicRescue: this.classicRescue,
      rescueController: this.rescueController,
      protectedRuns: this.protectedRuns,
    };
    this.physics = new PinballPhysics();
    this.rescueController = new RescueCannon();
    this.classicRescue = freshRescue("exercise", 0);
    this.sessionExtension = undefined;
    this.economy = undefined;
    this.army = undefined;
    this.war = undefined;
    this.magic = undefined;
    this.enemyMagic = undefined;
    this.builder = undefined;
    this.tilt = new TiltSystem();
    this.recovery = new BallRecoverySystem();
    this.state = "menu";
    return () => {
      this.physics.dispose();
      Object.assign(this, snapshot);
      this.sandboxExit = undefined;
      this.sandboxKind = "";
      this.bindPhysics();
      this.setState(snapshot.state === "playing" ? "paused" : snapshot.state);
    };
  }
  startWar(options?: Partial<WarOptions>, storage = this.warSave): boolean {
    const data = options ? freshWar(options) : storage.load();
    if (!data) return false;
    this.menu();
    this.mode = "kingdom";
    this.recorded = true;
    this.respawnAt = 0;
    this.missingSince = 0;
    this.war = new WarManager(data, storage);
    this.economy = this.war.player;
    void this.protection;
    void this.rescue;
    this.protectedRuns = [];
    this.army = this.war.army;
    this.builder = this.war.builder;
    this.physics.dispose();
    this.physics = new PinballPhysics(WAR_TARGETS);
    this.bindPhysics();
    this.score = new ScoreManager();
    this.score.score = data.player.score;
    this.score.hits = data.player.totalHits;
    this.score.combo.max = data.player.scoreComboMax;
    this.time = data.time;
    this.tilt.reset();
    this.recovery.reset();
    this.saveConflict = false;
    this.war.canMaterialize = (x, y, type) => {
      const c = buildingConfig(type)!;
      return this.physics.balls.every(
        (b) =>
          Math.hypot(b.position.x - x, b.position.y - y) >
          Math.hypot(c.width, c.height) / 2 + 16,
      );
    };
    this.war.onNotice = (text) =>
      this.events.emit("message", { text, tone: "warning" });
    this.war.onSound = (kind) => this.events.emit("militarySound", { kind });
    this.war.onLayout = () => this.applyWarLayout();
    this.war.onEnd = () => {
      this.magic?.endMulti();
      if (this.magic) {
        this.magic.data.statuses = [];
        this.magic.data.fields = [];
        this.magic.effects = [];
      }
      if (this.enemyMagic) {
        this.enemyMagic.data.statuses = [];
        this.enemyMagic.data.fields = [];
        this.enemyMagic.effects = [];
      }
      this.syncEconomy();
      this.setState("over");
      this.events.emit("presentationResult", {
        won: this.war!.data.result?.outcome === "victory",
      });
    };
    this.applyWarLayout();
    this.bindMagic();
    this.economy.resumeCheckpoint();
    if (data.result) this.setState("over");
    else if (data.player.launchState === "awaiting") {
      data.relaunchGrace = this.time + 3000;
      this.respawnAt = this.time + 800;
      this.setState("relaunch");
    } else {
      this.physics.spawn();
      this.setState("playing");
    }
    this.restoreCapturedRescue();
    this.checkpoint();
    return true;
  }
  private applyWarLayout() {
    if (!this.war) return;
    applyBuildings(this.physics, this.war.physicsBuildings);
    for (const s of this.war.data.structures.filter(
      (s) => s.side === "ally" && s.fixed,
    ))
      this.physics.setTargetEnabled(s.fixed!, s.hp > 0);
  }
  start(tutorial = !this.save.data.tutorialDone): void {
    this.sandboxExit?.();
    if (this.sessionExtension) this.menu();
    this.restorePractice();
    this.army = undefined;
    this.testBall?.dispose();
    this.testBall = undefined;
    this.builder = undefined;
    this.finishRecord();
    this.war = undefined;
    this.magic = undefined;
    this.enemyMagic = undefined;
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
    this.classicRescue = freshRescue(
      `classic-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    this.classicProtection = new BallProtection(
      freshProtection(this.save.data.settings.presentation.pinballDifficulty),
    );
    this.protectedRuns = [];
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
    this.checkpoint();
  }
  resumeClassic(): boolean {
    const r = structuredClone(this.save.data.classicRun);
    if (!r || r.remaining <= 0) return false;
    this.start(false);
    this.classicRescue = r.rescue;
    this.time = r.time;
    this.remaining = r.remaining;
    this.score.score = r.score;
    this.score.hits = r.hits;
    this.score.combo.max = r.maxCombo;
    if (r.protection) this.classicProtection = new BallProtection(r.protection);
    if (r.inflight && !r.rescue.pending) this.remaining--;
    this.restoreCapturedRescue();
    if (this.remaining <= 0) this.setState("over");
    this.checkpoint();
    return true;
  }
  restartClassic() {
    const rescue = structuredClone(this.rescue);
    this.start(false);
    rescue.pending = undefined;
    rescue.phase = "IN_PLAY";
    rescue.ballId = null;
    rescue.lastFire = 0;
    this.classicRescue = rescue;
    this.checkpoint();
  }
  startKingdom(fresh: boolean): void {
    this.sandboxExit?.();
    if (this.sessionExtension) this.menu();
    this.restorePractice();
    this.stopTestBall();
    this.finishRecord();
    this.war = undefined;
    this.magic = undefined;
    this.enemyMagic = undefined;
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
    void this.protection;
    void this.rescue;
    this.protectedRuns = [];
    this.economy.onNotice = (text) =>
      this.events.emit("message", { text, tone: "gold" });
    this.economy.resumeCheckpoint();
    this.builder = new BuildingManager(this.economy);
    this.army = new ArmyManager(this.economy);
    this.bindArmy();
    if (this.economySave.recoveredBuildings)
      this.events.emit("message", {
        text: `안전하지 않은 건물 ${this.economySave.recoveredBuildings}개를 제외하고 저장을 복원했습니다. 자원과 기존 경제 기록은 유지했습니다.`,
        tone: "warning",
      });
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
    this.bindMagic();
    if (data.launchState === "ended") this.setState("over");
    else if (data.launchState === "awaiting") {
      if (this.economy.canContinue()) {
        this.respawnAt = this.time + 800;
        this.setState("relaunch");
      } else this.endKingdom();
    } else {
      this.physics.spawn();
      this.setState("playing");
    }
    this.restoreCapturedRescue();
    this.checkpoint();
  }
  relaunch(): boolean {
    if (this.state !== "relaunch" || !this.economy?.payRelaunch()) return false;
    this.respawnAt = 0;
    this.missingSince = 0;
    this.tilt.reset();
    this.recovery.reset();
    this.physics.spawn();
    this.setState("playing");
    this.traceBall("respawn-paid");
    this.nextBallProtection();
    this.events.emit("message", {
      text: "새로운 공이 준비되었습니다. Space로 발사하세요.",
    });
    return true;
  }
  endKingdom(): void {
    if (this.war) {
      this.war.finish("defeat", "플레이어 항복");
      return;
    }
    if (this.army?.data.battle) this.army.finish("defeat");
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
    if (
      this.mode === "classic" &&
      this.state !== "menu" &&
      !this.practice &&
      !this.sandboxKind
    ) {
      this.save.data.classicRun = {
        rescue: structuredClone(this.classicRescue),
        protection: structuredClone(this.protection.data),
        remaining: this.remaining,
        score: this.score.score,
        hits: this.score.hits,
        maxCombo: this.score.combo.max,
        time: this.time,
        inflight: this.physics.launched,
      };
      this.save.persist();
    }
    this.syncEconomy();
    if (this.war) {
      this.war.data.time = this.time;
      this.war.checkpoint();
      return;
    }
    this.economy?.checkpoint();
  }
  private bindMagic() {
    if (!this.economy || !this.army) return;
    this.magic = new MagicManager(this);
    this.enemyMagic = this.war ? new MagicManager(this, "enemy") : undefined;
    const combat = this.army.combat;
    combat.movementFactor = (u) =>
      Math.min(
        this.magic!.status.movement(u.id),
        this.enemyMagic?.status.movement(u.id) ?? 1,
      );
    combat.intervalFactor = (u) =>
      Math.max(
        this.magic!.status.interval(u.id),
        this.enemyMagic?.status.interval(u.id) ?? 1,
      );
    combat.damageFilter = (u, n) =>
      this.enemyMagic?.damageFilter(u, this.magic!.damageFilter(u, n)) ??
      this.magic!.damageFilter(u, n);
    combat.sphereFactor = (u) => this.magic!.sphereFactor(u);
    combat.onSphereContact = (u, n) => this.magic!.direct(u, n);
    if (this.war)
      this.war.onHarvest = (id, side = "enemy") =>
        (side === "ally" ? this.magic : this.enemyMagic)?.validHit(id, id);
    if (this.war)
      this.war.damageFilter = (s, n) =>
        this.enemyMagic?.damageFilter(s, this.magic!.damageFilter(s, n)) ??
        this.magic!.damageFilter(s, n);
  }
  private bindArmy() {
    if (!this.army) return;
    this.army.onNotice = (text) =>
      this.events.emit("message", { text, tone: "gold" });
    this.army.combat.onSound = (kind) =>
      this.events.emit("militarySound", { kind });
    this.army.onResult = (record) => {
      this.lastBattleResult = structuredClone(record);
      if (this.practice) this.restorePractice();
      this.setState("paused");
      this.events.emit("battleResult", record);
    };
  }
  startTraining(scenario: number, practice: boolean): string | null {
    if (this.war) return "군사 훈련은 독립된 왕국 발전 모드에서 이용하세요.";
    if (
      !this.economy ||
      !this.army ||
      !this.builder ||
      this.builder.active ||
      this.saveConflict ||
      this.army.data.battle ||
      !["playing", "paused"].includes(this.state)
    )
      return "현재 상태에서 훈련을 시작할 수 없습니다.";
    if (practice) {
      this.checkpoint();
      this.practice = {
        magic: this.magic,
        economy: this.economy,
        builder: this.builder,
        army: this.army,
        physics: this.physics,
        score: this.score,
        tilt: this.tilt,
        recovery: this.recovery,
        time: this.time,
      };
      this.economy = new EconomyManager(
        structuredClone(this.economy.data),
        new EconomySaveManager({ getItem: () => null, setItem: () => {} }),
      );
      this.builder = new BuildingManager(this.economy);
      this.army = new ArmyManager(this.economy);
      this.bindArmy();
      this.physics = new PinballPhysics(ECONOMY_TARGETS);
      applyBuildings(this.physics, this.builder.buildings);
      this.bindPhysics();
      this.physics.spawn();
      this.score = new ScoreManager();
      this.tilt = new TiltSystem();
      this.recovery = new BallRecoverySystem();
      this.economy.data.launchState = "ready";
      this.bindMagic();
    }
    const error = this.army.startBattle(
      scenario,
      practice ? "practice" : "challenge",
    );
    if (error) {
      this.restorePractice();
      return error;
    }
    this.setState("playing");
    return null;
  }
  restorePractice() {
    const p = this.practice;
    if (!p) return;
    this.physics.dispose();
    this.economy = p.economy;
    this.builder = p.builder;
    this.army = p.army;
    this.physics = p.physics;
    this.score = p.score;
    this.tilt = p.tilt;
    this.recovery = p.recovery;
    this.time = p.time;
    this.magic = p.magic;
    this.practice = undefined;
    this.accumulator = 0;
    this.bindPhysics();
    this.bindArmy();
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
    if (this.state === "playing" || this.state === "relaunch")
      this.setState("paused");
  }
  resume(): void {
    if (this.state === "paused" && !this.saveConflict && !this.builder?.active)
      this.setState(
        this.economy?.data.launchState === "awaiting" ? "relaunch" : "playing",
      );
  }
  enterBuild(): boolean {
    if (this.war && !this.war.preparing) {
      this.events.emit("message", {
        text: "전투 중에는 전쟁 패널의 빠른 건설을 사용하세요.",
      });
      return false;
    }
    if (this.practicing) return false;
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
  private buildingHit(id: string, speed: number, ball = this.physics.ball) {
    if (!(this.magic?.balls?.valid(ball, this.time) ?? true)) return;
    if (this.war) {
      const valid =
        this.state === "playing" &&
        this.physics.launched &&
        !this.tilt.tilted &&
        this.time >= this.recovery.suppressUntil;
      const s = this.war.structure(id);
      if (s?.side === "enemy") {
        const before = s.hp;
        this.war.sphereBuilding(
          id,
          speed,
          valid,
          this.magic?.sphereFactor(s, ball) ?? 1,
        );
        if (s.hp < before) {
          this.magic?.direct(s, before - s.hp, ball);
          this.score.hits++;
          this.score.combo.hit(this.time);
          this.score.score += Math.round(100 * this.score.combo.multiplier);
          this.syncEconomy();
        }
        return;
      }
      if (s?.hp === 0) return;
      if (valid) this.war.friendlyHit(id);
    }
    const b = this.builder?.buildings.find((b) => b.id === id);
    if (!b || this.state !== "playing") return;
    const valid =
      !this.tilt.tilted &&
      this.time >= this.recovery.suppressUntil &&
      this.time - b.lastHit >= Math.max(240, 600 - b.level * 30) &&
      speed > 40;
    if (!valid) return;
    this.army?.hit(id, this.time, speed, true);
    b.lastHit = this.time;
    if (b.type === "reflector") {
      const p = b.production;
      p.recent = p.recent.filter((t) => this.time - t < 8000);
      p.recent.push(this.time);
      if (p.recent.length >= 7 + b.level && p.overloadedUntil <= this.time) {
        p.overloadedUntil = this.time + 6000;
        p.recent = [];
      }
      const body = this.physics.buildingBodies.get(id);
      if (body) body.restitution = p.overloadedUntil > this.time ? 0.35 : 1;
      if (p.overloadedUntil > this.time) return;
    }
    this.magic?.validHit(id, b.type, ball);
    buildingImpulse(this.physics, b, ball);
    const c = buildingConfig(b.type)!;
    const production = this.economy?.harvest(
      id,
      speed,
      true,
      this.magic?.rewardFactor(ball, buildingConfig(b.type)?.production) ?? 1,
    );
    if (production)
      this.physics.telemetry.production(
        ball,
        production.facility.resource,
        production.amount - production.overflow,
      );
    if (production && this.magic?.data.multi?.storm)
      this.magic.data.stats.stormResources +=
        production.amount - production.overflow;
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
    this.checkpoint();
    this.sandboxExit?.();
    if (this.sessionExtension) {
      this.checkpoint();
      this.sessionExtension.dispose();
      this.sessionExtension = undefined;
    }
    this.restorePractice();
    this.stopTestBall();
    if (this.builder) this.builder.active = false;
    this.finishRecord();
    this.war = undefined;
    this.magic = undefined;
    this.enemyMagic = undefined;
    this.physics.dispose();
    this.physics = new PinballPhysics();
    this.bindPhysics();
    this.physics.spawn();
    this.mode = "classic";
    this.economy = undefined;
    this.army = undefined;
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
    this.protection.data.runStartedAt ??= this.time;
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
      this.physics.heldBalls.has(this.physics.ball.id) ||
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
  configureModeTable(
    targets: import("../data/table").TargetDefinition[],
    preset: "standard" | "authored" = "standard",
  ) {
    if (!this.sessionExtension) return false;
    this.magic?.endMulti();
    this.physics.dispose();
    this.physics = new PinballPhysics(targets, preset);
    this.bindPhysics();
    this.bindMagic();
    this.physics.spawn();
    return true;
  }
  update(frameMs: number): void {
    this.lastFrameMs = frameMs;
    this.updateCount++;
    if (this.sessionExtension?.canAdvance?.() === false) return;
    if (this.testBall) {
      this.testBall.update(frameMs);
      return;
    }
    if (this.state === "relaunch") {
      const ms = Math.max(0, Math.min(frameMs, PHYSICS.maxFrameMs));
      this.time += ms;
      if (this.war && this.time >= this.war.data.relaunchGrace) {
        this.magic?.tick(ms / 1000);
        this.enemyMagic?.tick(ms / 1000);
        this.war.tick(ms / 1000, this.time);
        this.sessionExtension?.afterStep(ms / 1000);
      }
      if (this.state === "relaunch" && this.time >= this.respawnAt)
        this.relaunch();
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
      const beforeBalls = this.physics.balls.map((ball) => ({
        ball,
        position: { ...ball.position },
      }));
      this.updateRescue();
      this.sessionExtension?.beforeStep(dt);
      this.physics.step(dt, !this.tilt.tilted);
      this.physics.telemetry.enabled =
        this.save.data.settings.presentation.debug;
      this.updateRescue();
      this.updateProtection();
      this.magic?.balls?.recover(dt, this.time);
      const recovered = this.recovery.update(this.physics, dt, this.time);
      if (recovered) {
        if (recovered === "return") {
          if (this.physics.balls.length > 1)
            this.physics.removeSphere(this.physics.ball!);
          else this.physics.spawn();
          if (this.economy) {
            this.economy.data.launchState = this.physics.launched
              ? "inflight"
              : "ready";
            this.checkpoint();
          }
        }
        this.score.combo.reset();
        if (this.economy) this.economy.data.combo.count = 0;
        this.events.emit("message", {
          text: recovered === "return" ? ko.return : ko.recovery,
        });
      }
      for (const item of beforeBalls) {
        if (
          !this.physics.balls.includes(item.ball) ||
          this.physics.heldBalls.has(item.ball.id) ||
          this.rescue.ballId === item.ball.id
        )
          continue;
        if (this.magic) this.magic.contactBall = item.ball;
        this.army?.combat.sphere(
          item.position,
          item.ball.position,
          item.ball.speed * 60,
          this.time,
          this.physics.launched &&
            !this.tilt.tilted &&
            this.time >= this.recovery.suppressUntil &&
            (this.magic?.balls?.valid(item.ball, this.time) ?? true),
        );
      }
      this.magic?.tick(dt);
      this.enemyMagic?.tick(dt);
      if (this.magic?.balls?.drain(this.time)) this.recovery.reset();
      if (this.war) this.war.tick(dt, this.time);
      else this.army?.tick(dt, this.time);
      this.sessionExtension?.afterStep(dt);
      if (this.state !== "playing") break;
      if (
        this.physics.ball &&
        !this.physics.heldBalls.has(this.physics.ball.id) &&
        this.physics.ball.position.y > PHYSICS.drainY
      )
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
        this.traceBall("respawn-classic");
        this.nextBallProtection();
        this.events.emit("message", { text: ko.ready });
      }
      // Repair an absent body only when no legitimate respawn is pending.
      // An in-flight loss still passes through the mode's normal life/cost rules.
      if (!this.physics.ball && !this.respawnAt) {
        this.missingSince ||= this.time;
        if (this.time - this.missingSince >= 500) {
          this.traceBall("missing-body-recovery");
          this.missingSince = 0;
          if (this.economy?.data.launchState === "ready") {
            this.physics.spawn();
            this.clearInputs();
            this.recovery.reset();
          } else this.drain("missing");
        }
      } else this.missingSince = 0;
      if (this.time - this.lastCheckpoint >= 5000) {
        this.lastCheckpoint = this.time;
        this.checkpoint();
      }
    }
  }
  private hit({
    target,
    normalSpeed,
    ball = this.physics.ball,
  }: Contact): void {
    this.physics.kick(target, ball);
    if (!(this.magic?.balls?.valid(ball, this.time) ?? true)) return;
    const result = this.score.hit(
      target,
      this.time,
      !this.tilt.tilted &&
        this.time >= this.recovery.suppressUntil &&
        this.state === "playing",
    );
    if (!result) return;
    this.protection.hit(target.id, target.x, this.time);
    this.war?.friendlyHit(target.id);
    this.magic?.validHit(target.id, target.kind, ball);
    this.army?.hit(target.id, this.time, normalSpeed, true);
    this.syncEconomy();
    const production = this.economy?.harvest(
      target.id,
      normalSpeed,
      true,
      this.magic?.rewardFactor(ball, target.kind) ?? 1,
    );
    if (production)
      this.physics.telemetry.production(
        ball,
        production.facility.resource,
        production.amount - production.overflow,
      );
    if (production && this.magic?.data.multi?.storm)
      this.magic.data.stats.stormResources +=
        production.amount - production.overflow;
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
      if (this.army)
        this.army.data.morale = Math.min(100, this.army.data.morale + 4);
      this.economy?.royal();
      this.magic?.royal();
      this.events.emit("royal", { x: target.x, y: target.y, points: 3000 });
    }
    if (this.economy) this.checkpoint();
    if (this.tutorialStep === 3) this.tutorialStep = 4;
    if (this.tutorialStep === 4 && target.kind === "palace")
      this.tutorialStep = 5;
    if (this.tutorialStep === 5 && this.score.combo.count >= 3)
      this.finishTutorial();
  }
  private drain(reason = "drain"): void {
    if (!this.physics.ball && reason !== "missing") return;
    this.traceBall(reason);
    this.clearInputs();
    if (reason === "drain" && this.tryBallSave()) return;
    if (this.sessionExtension?.onLoss?.()) {
      if (
        this.state === "playing" &&
        this.physics.ball &&
        !this.physics.launched
      ) {
        if (this.economy) this.economy.data.launchState = "ready";
        this.tilt.reset();
        this.recovery.reset();
        this.traceBall("mode-ball-save");
        this.checkpoint();
      }
      return;
    }
    if (this.practice) {
      this.physics.spawn();
      this.tilt.reset();
      this.recovery.reset();
      if (this.economy) this.economy.data.launchState = "ready";
      return;
    }
    if (this.protection.data.runStartedAt !== null) {
      this.protectedRuns.push(
        (this.time - this.protection.data.runStartedAt) / 1000,
      );
      if (this.protectedRuns.length > 1000) this.protectedRuns.shift();
    }
    if (this.mode === "kingdom" && this.economy) {
      this.magic?.endMulti();
      this.physics.removeBall();
      this.clearInputs();
      this.score.combo.reset();
      this.syncEconomy();
      this.economy.loseBall();
      this.respawnAt = this.time + 800;
      this.events.emit("drain", {
        remaining: Math.floor(this.economy.data.resources.energy / 20),
      });
      if (this.war) {
        this.war.data.relaunchGrace = this.time + 3000;
        this.setState("relaunch");
        this.checkpoint();
        return;
      }
      if (this.economy.canContinue()) this.setState("relaunch");
      else this.endKingdom();
      return;
    }
    this.physics.removeBall();
    this.remaining--;
    this.score.combo.reset();
    this.clearInputs();
    this.events.emit("drain", { remaining: this.remaining });
    this.checkpoint();
    if (this.remaining <= 0) {
      this.finishRecord();
      this.war = undefined;
      this.magic = undefined;
      this.enemyMagic = undefined;
      this.setState("over");
    } else {
      this.respawnAt = this.time + 800;
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
    this.sandboxExit?.();
    this.sessionExtension?.dispose();
    this.restorePractice();
    this.stopTestBall();
    this.physics.dispose();
    this.events.clear();
  }
}
