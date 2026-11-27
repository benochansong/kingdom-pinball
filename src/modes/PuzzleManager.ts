import Matter from "matter-js";
import type { GameModeManager } from "./GameModeManager";
import type { PinballPhysics } from "../physics/PinballPhysics";
import type { PuzzleDefinition } from "../config/puzzles";
import { PUZZLES } from "../config/puzzles";
import { COLLISION } from "../config/physics";
export class PuzzleBoard {
  hits = 0;
  reflections = 0;
  reflectorHits = 0;
  portalUses = 0;
  rescued = false;
  rescueY = 510;
  placed = false;
  angle = 0;
  private lastPortal = -10000;
  private reflector?: Matter.Body;
  constructor(
    readonly physics: PinballPhysics,
    readonly definition: PuzzleDefinition,
  ) {
    this.target();
    const impact = physics.onImpact;
    physics.onImpact = (x, y, speed) => {
      this.reflections++;
      impact(x, y, speed);
    };
    Matter.Events.on(physics.engine, "collisionStart", (event) => {
      for (const pair of event.pairs) {
        if (
          [pair.bodyA.label, pair.bodyB.label].includes("puzzle-reflector") &&
          [pair.bodyA, pair.bodyB].some((b) => physics.balls.includes(b))
        )
          this.reflectorHits++;
      }
    });
  }
  get targetId() {
    return `puzzle-${this.definition.id}-${this.hits}`;
  }
  get targetPosition() {
    const d = this.definition;
    return {
      x: d.x + (d.kind === "sequence" && this.hits % 2 ? 35 : 0),
      y: d.y + (d.kind === "sequence" ? Math.floor(this.hits / 2) * 30 : 0),
    };
  }
  get complete() {
    return (
      this.hits >= this.definition.hits &&
      (this.definition.kind !== "rescue" || this.rescueY >= 650)
    );
  }
  target() {
    const d = this.definition;
    this.physics.addTarget({
      id: this.targetId,
      kind: "bonus",
      name: d.kind === "rescue" ? "RESCUE" : String(this.hits + 1),
      ...this.targetPosition,
      radius: d.radius,
      points: 100,
      kick: 430,
      color: 0xf4d78e,
    });
  }
  place(angle: number) {
    if (
      this.physics.launched ||
      this.definition.kind !== "builder" ||
      !Number.isFinite(angle)
    )
      return false;
    const value = Math.max(-60, Math.min(60, angle));
    if (this.reflector)
      Matter.Composite.remove(this.physics.engine.world, this.reflector);
    this.angle = value;
    this.reflector = Matter.Bodies.rectangle(300, 580, 95, 12, {
      isStatic: true,
      angle: (value * Math.PI) / 180,
      restitution: 0.85,
      label: "puzzle-reflector",
      collisionFilter: { category: COLLISION.wall },
    });
    Matter.Composite.add(this.physics.engine.world, this.reflector);
    this.placed = true;
    return true;
  }
  hit(id: string, element: string) {
    const d = this.definition;
    if (
      id !== this.targetId ||
      (d.kind === "ricochet" && this.reflections < 1) ||
      (d.kind === "builder" && (!this.placed || !this.reflectorHits)) ||
      (d.kind === "portal" && this.portalUses < 1) ||
      (d.kind === "element" && element !== "fire")
    )
      return false;
    this.physics.removeTarget(id);
    this.hits++;
    if (d.kind === "rescue") this.rescued = true;
    if (this.hits < d.hits) this.target();
    return true;
  }
  tick(dt: number, now: number) {
    if (this.rescued) this.rescueY = Math.min(650, this.rescueY + dt * 42);
    if (
      this.definition.kind === "portal" &&
      this.physics.launched &&
      now - this.lastPortal > 2000
    ) {
      const b = this.physics.ball;
      if (b && Math.hypot(b.position.x - 450, b.position.y - 180) < 38) {
        const dest = { x: 130, y: 330 },
          probe = Matter.Bodies.circle(dest.x, dest.y, 12);
        if (
          !Matter.Query.collides(
            probe,
            Matter.Composite.allBodies(this.physics.engine.world).filter(
              (x) => x.isStatic && !x.isSensor,
            ),
          ).length
        ) {
          Matter.Body.setPosition(b, dest);
          this.lastPortal = now;
          this.portalUses++;
        }
      }
    }
  }
}
export class PuzzleManager {
  readonly board: PuzzleBoard;
  constructor(readonly host: GameModeManager) {
    const g = host.game,
      w = g.war!,
      s = host.session,
      d = PUZZLES[s.options.puzzle];
    g.sessionExtension!.flatBoard = true;
    host.battle.terrain?.dispose();
    host.battle.terrain = undefined;
    w.environmentRule = undefined;
    w.ai.update = () => {};
    g.enemyMagic = undefined;
    w.enemyArmy.data.units = [];
    w.enemyArmy.data.queues = {};
    w.army.data.units = [];
    w.army.data.queues = {};
    w.objectiveControlled = true;
    w.damageStructure = () => 0;
    g.configureModeTable([], "authored");
    g.enemyMagic = undefined;
    this.board = new PuzzleBoard(g.physics, d);
    host.battle.beforePhysics = () => {
      g.physics.engine.gravity.y = 1;
    };
    s.name = `PUZZLE ${d.id + 1} · ${d.name}`;
    s.goal = d.hits;
    s.options.preparation = 0;
    w.data.options.preparation = 0;
    g.magic!.data.research.fire = 1;
    g.magic!.data.loadout.balls = ["fire"];
    g.magic!.locked = (id) =>
      d.kind === "element" && id === "fire"
        ? null
        : "이 퍼즐에서 사용할 수 없습니다.";
    w.player.data.resources.mana = 100;
    g.magic!.data.charge = 100;
    w.builder.placementRule = () =>
      "퍼즐 반사판 버튼으로 제한된 배치를 사용하세요.";
    // A puzzle resumes from its clean board; consumed attempts and elapsed time are retained.
    this.board.hits = s.flags.puzzleHits ?? 0;
    g.physics.removeTarget(`puzzle-${d.id}-0`);
    if (this.board.hits < d.hits) this.board.target();
    this.board.rescued = !!s.flags.rescued;
    this.board.rescueY = s.flags.rescueY ?? 510;
    if (s.flags.placed) this.board.place((s.flags.reflectorAngle ?? 60) - 60);
  }
  hit(id: string) {
    const g = this.host.game;
    if (
      this.board.hit(
        id,
        g.magic!.balls!.state(g.magic!.contactBall)?.type ?? "steel",
      )
    ) {
      this.host.session.flags.puzzleHits = this.board.hits;
      this.host.persist();
    }
  }
  tick(dt: number) {
    const s = this.host.session,
      b = this.board;
    b.tick(dt, this.host.game.time);
    s.stats.reflections = b.reflections;
    s.flags.rescued = b.rescued ? 1 : 0;
    s.flags.rescueY = b.rescueY;
    s.flags.progress = b.hits;
    if (b.complete) {
      s.flags.stars =
        1 +
        (s.time <= b.definition.seconds * 500 ? 1 : 0) +
        (s.stats.hints === 0 && s.stats.balls <= 1 ? 1 : 0);
      this.host.finish(true, `${s.flags.stars} STARS · 퍼즐 목표 달성`);
    } else if (s.time >= b.definition.seconds * 1000)
      this.host.finish(false, "퍼즐 제한 시간이 끝났습니다.");
  }
  loss() {
    const s = this.host.session;
    if (s.stats.balls >= this.board.definition.balls)
      this.host.finish(false, "사용할 수 있는 공을 모두 잃었습니다.");
    else this.host.game.physics.spawn();
    return true;
  }
  hint() {
    const s = this.host.session,
      index = Math.min(2, s.stats.hints++);
    this.host.persist();
    return this.board.definition.hints[index];
  }
  place(angle: number) {
    if (!this.board.place(angle)) return false;
    const s = this.host.session;
    s.stats.placements++;
    s.flags.placed = 1;
    s.flags.reflectorAngle = this.board.angle + 60;
    this.host.persist();
    return true;
  }
}
