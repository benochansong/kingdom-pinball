import { freshProduction } from "../building/types";
import { buildingConfig } from "../config/buildings";
import { EnemyAI } from "../war/EnemyAI";
import Matter from "matter-js";
import type { GameModeManager } from "./GameModeManager";
import type { TableDefinition, TableObject } from "./TableCreator";
import { validateTable } from "./TableCreator";
import { COLLISION } from "../config/physics";
import { RESOURCE_IDS, type ResourceId } from "../config/economy";
export class CustomTableManager {
  private bodies: Matter.Body[] = [];
  private scaled = new Set<number>();
  private nextPortal = 0;
  constructor(
    readonly host: GameModeManager,
    readonly table: TableDefinition,
    fresh = true,
  ) {
    const validation = validateTable(table);
    if (validation.errors.length) throw Error(validation.errors.join("\n"));
    const g = host.game,
      w = g.war!,
      s = host.session;
    const warBoard = ["war", "survival", "boss"].includes(table.rule);
    g.sessionExtension!.flatBoard = !warBoard;
    host.battle.terrain?.dispose();
    host.battle.terrain = undefined;
    w.environmentRule = undefined;
    w.ai.update = () => {};
    g.enemyMagic = undefined;
    if (fresh) {
      w.enemyArmy.data.units = [];
      w.enemyArmy.data.queues = {};
      w.army.data.units = [];
      w.army.data.queues = {};
    }
    w.objectiveControlled = true;
    w.data.options.preparation = 0;
    if (!warBoard) g.configureModeTable([], "authored");
    g.enemyMagic = undefined;
    s.name = table.name;
    s.goal = table.amount;
    if (fresh && !warBoard) {
      w.player.data.building!.buildings = [];
      w.enemy.data.building!.buildings = [];
      w.data.structures = w.data.structures.filter((x) => x.castle || x.fixed);
    }
    if (table.preset === "magic" && fresh) {
      host.battle.magicKit(true);
      w.player.resources.reward({ mana: 300 });
      g.magic!.data.charge = 100;
      g.magic!.data.multiCharge = 100;
    }
    for (const o of table.objects) {
      if (["bumper", "target"].includes(o.kind)) {
        g.physics.addTarget({
          id: "custom-" + o.id,
          kind: "bonus",
          name: o.name,
          x: o.x,
          y: o.y,
          radius: Math.min(o.width, o.height) / 2,
          points: Math.min(1000, Math.round(o.value) || 100),
          kick: o.kind === "bumper" ? 600 : 350,
          color: 0xefcf83,
        });
      } else if (o.kind === "building") {
        const index = table.objects.indexOf(o),
          id = "building-" + (80000 + index),
          data = w.economy(o.side).data.building!;
        if (!data.buildings.some((b) => b.id === id))
          data.buildings.push({
            id,
            type: o.type,
            x: o.x,
            y: o.y,
            angle: o.angle,
            level: 1,
            paid: {},
            production: freshProduction(),
            charge: 0,
            lastHit: -10000,
            readyAt: 0,
            owner: o.side,
          });
        w.syncStructures();
        const structure = w.structure(id)!;
        if (fresh)
          structure.hp = structure.maxHp = Math.max(
            50,
            Math.min(2000, o.value),
          );
      } else if (["wall", "reflector"].includes(o.kind)) {
        const b = Matter.Bodies.rectangle(o.x, o.y, o.width, o.height, {
          isStatic: true,
          angle: (o.angle * Math.PI) / 180,
          restitution: o.kind === "reflector" ? 0.85 : 0.6,
          label: "custom-" + o.id,
          collisionFilter: { category: COLLISION.wall },
        });
        Matter.Composite.add(g.physics.engine.world, b);
        this.bodies.push(b);
      } else if (o.kind === "unit" && fresh) {
        const a = w.troops(o.side),
          u = a.createUnit(o.type as any, o.side, { x: o.x, y: o.y });
        u.squad = "deployed";
        a.data.units.push(u);
      } else if (o.kind === "boss" && fresh) host.battle.summonBoss(o.type);
    }
    const originalLayout = w.onLayout;
    w.onLayout = () => {
      originalLayout();
      for (const [id, body] of g.physics.buildingBodies) {
        const number = Number(id.split("-")[1]);
        if (!warBoard && (number < 80000 || number >= 80080))
          Matter.Composite.remove(g.physics.engine.world, body);
      }
      for (const o of table.objects.filter((x) => x.kind === "building")) {
        const id = "building-" + (80000 + table.objects.indexOf(o)),
          body = g.physics.buildingBodies.get(id),
          config = buildingConfig(o.type)!;
        if (body && !body.isSensor && !this.scaled.has(body.id)) {
          this.scaled.add(body.id);
          Matter.Body.scale(
            body,
            o.width / config.width,
            o.height / config.height,
          );
        }
      }
    };
    w.onLayout();
    if (table.rule === "war") {
      const ai = new EnemyAI(w);
      w.ai.update = () => ai.update();
      w.objectiveControlled = table.goal !== "time";
    }
    if (table.rule === "survival") s.options.preparation = 10;
    w.builder.placementRule = () =>
      "제작기에서 시설을 배치한 뒤 다시 테스트하세요.";
    host.battle.beforePhysics = (dt) => this.before(dt);
  }
  hit(id: string) {
    const o = this.table.objects.find((o) => "custom-" + o.id === id);
    if (!o || !["target", "bumper"].includes(o.kind)) return;
    const s = this.host.session;
    s.flags.tableHits = (s.flags.tableHits ?? 0) + 1;
    if (
      this.table.rule === "resource" ||
      (o.kind === "target" && RESOURCE_IDS.includes(o.type as ResourceId))
    )
      this.host.game.economy!.resources.grant(
        RESOURCE_IDS.includes(o.type as ResourceId)
          ? (o.type as ResourceId)
          : "gold",
        Math.min(25, Math.max(1, o.value)),
        "production",
      );
  }
  private before(dt: number) {
    const g = this.host.game,
      p = g.physics;
    p.engine.gravity.y = 1;
    for (const b of p.balls) {
      if (b.isStatic) continue;
      for (const o of this.table.objects) {
        if (
          Math.abs(b.position.x - o.x) > o.width / 2 ||
          Math.abs(b.position.y - o.y) > o.height / 2
        )
          continue;
        if (o.kind === "wind")
          Matter.Body.applyForce(b, b.position, {
            x: b.mass * Math.cos((o.angle * Math.PI) / 180) * 0.0001,
            y: 0,
          });
        if (o.kind === "accelerator")
          Matter.Body.setVelocity(b, {
            x: b.velocity.x,
            y: b.velocity.y - dt * 3,
          });
        if (o.kind === "slow")
          Matter.Body.setVelocity(b, {
            x: b.velocity.x * Math.exp(-dt * 0.6),
            y: b.velocity.y * Math.exp(-dt * 0.6),
          });
        if (o.kind === "portal" && g.time >= this.nextPortal) {
          const dest = this.table.objects.find((x) => x.id === o.link)!;
          const probe = Matter.Bodies.circle(dest.x, dest.y, 12);
          if (
            !Matter.Query.collides(
              probe,
              Matter.Composite.allBodies(p.engine.world).filter(
                (x) => x.isStatic && !x.isSensor,
              ),
            ).length
          ) {
            Matter.Body.setPosition(b, { x: dest.x, y: dest.y });
            this.nextPortal = g.time + 2000;
          }
        }
      }
      p.limitSpeed(b);
    }
  }
  tick() {
    const s = this.host.session,
      t = this.table,
      g = this.host.game;
    let value = 0;
    switch (t.goal) {
      case "score":
        value = g.score.score;
        break;
      case "resources":
        value = g.economy!.resources.totalProduction;
        break;
      case "time":
        value = s.time / 1000;
        break;
      case "hits":
        value = s.flags.tableHits ?? 0;
        break;
      case "kills":
        value = g.war!.data.stats.kills;
        break;
      case "boss":
        value = this.host.battle.boss?.state.hp === 0 ? 1 : 0;
        break;
      case "zone":
        value = t.objects.some(
          (o) =>
            o.type === "goal" &&
            g.physics.balls.some(
              (b) =>
                !b.isStatic &&
                Math.abs(b.position.x - o.x) < o.width / 2 &&
                Math.abs(b.position.y - o.y) < o.height / 2,
            ),
        )
          ? 1
          : 0;
    }
    s.flags.progress = value;
    if (value >= t.amount) {
      this.host.creator.verifiedGoal(t);
      this.host.finish(true, "직접 플레이로 테이블 목표를 달성했습니다.");
    } else if (s.time >= t.seconds * 1000)
      this.host.finish(false, "테이블 제한 시간이 끝났습니다.");
  }
  loss() {
    if (this.host.session.stats.balls >= this.table.balls)
      this.host.finish(false, "공을 모두 사용했습니다.");
    else this.host.game.physics.spawn();
    return true;
  }
  get objects(): TableObject[] {
    return this.table.objects;
  }
}
