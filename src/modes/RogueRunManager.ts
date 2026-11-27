import type { GameModeManager } from "./GameModeManager";
import type { RogueNode } from "./types";
import { SeededRandom } from "./SeededRandom";
import { REGIONS } from "../config/campaign";
import { ROGUE_UPGRADES, RELICS, RARITY_WEIGHT } from "../config/roguelike";
import { PHYSICS } from "../config/physics";
export function generateRoute(seed: number): RogueNode[] {
  const rng = new SeededRandom(seed),
    nodes: RogueNode[] = [];
  for (let row = 0; row < 15; row++) {
    const act = Math.floor(row / 5),
      boss = row % 5 === 4,
      count = boss ? 1 : 2;
    for (let column = 0; column < count; column++) {
      const kind = boss
        ? "boss"
        : row % 5 === 0
          ? "battle"
          : rng.pick([
              "battle",
              "elite",
              "resource",
              "market",
              "repair",
              "treasure",
              "shrine",
              "puzzle",
            ] as const);
      nodes.push({
        id: `node-${row}-${column}`,
        act: act + 1,
        row,
        column,
        kind,
        risk:
          kind === "elite" ? "elite" : kind === "shrine" ? "cursed" : "safe",
        region:
          row === 14 ? "dark" : REGIONS[Math.min(6, act * 2 + rng.int(2))].id,
        next:
          row === 14
            ? []
            : (row + 1) % 5 === 4
              ? [`node-${row + 1}-0`]
              : [`node-${row + 1}-0`, `node-${row + 1}-1`],
        complete: false,
      });
    }
  }
  return nodes;
}
export class RogueRunManager {
  private twin?: { bodyId: number; until: number };
  constructor(readonly host: GameModeManager) {}
  get s() {
    return this.host.session;
  }
  get g() {
    return this.host.game;
  }
  get current() {
    return this.s.nodes.find((n) => n.id === this.s.node);
  }
  get available() {
    return this.current
      ? this.current.complete
        ? this.current.next
        : []
      : this.s.nodes.filter((n) => n.row === 0).map((n) => n.id);
  }
  initialize() {
    this.s.nodes = generateRoute(this.s.options.seed);
    this.s.status = "route";
    this.g.war!.ai.update = () => {};
    this.g.war!.enemyArmy.data.units = [];
    this.g.war!.enemyArmy.data.queues = {};
    this.host.battle.magicKit();
    this.g.pause();
  }
  attach() {
    const w = this.g.war!,
      s = this.s,
      g = this.g,
      has = (id: string) => s.relics.includes(id),
      level = (id: string) => s.upgrades[id] ?? 0;
    w.ai.update = () => {};
    const prod = w.player.productionBonus.bind(w.player);
    w.player.productionBonus = (r) =>
      prod(r) *
      (1 + level(r) * 0.1 + (r === "gold" && has("GoldenCrown") ? 0.15 : 0)) *
      (s.flags.curseProduction ? 0.8 : 1);
    const filter = w.army.combat.damageFilter;
    w.army.combat.damageFilter = (u, n, source, sphere) =>
      filter(
        u,
        n *
          (u.side === "ally"
            ? (has("IronHeart") ? 0.9 : 1) * (s.flags.curseAttack ? 1.15 : 1)
            : source && ["swordsman", "spearman"].includes(source.kind)
              ? 1 + level("infantry") * 0.08
              : 1) *
          (u.side === "enemy" &&
          sphere &&
          has("DragonEmber") &&
          ["fire", "explosion"].includes(
            g.magic!.balls!.state(g.magic!.contactBall)?.type ?? "",
          )
            ? 1.15
            : 1),
        source,
        sphere,
      );
    const move = w.army.combat.movementFactor;
    w.army.combat.movementFactor = (u) =>
      move(u) *
      (u.side === "ally" && u.kind === "knight"
        ? 1 + level("cavalry") * 0.08
        : 1);
    const train = w.army.productionFactor;
    w.army.productionFactor = (b) => train(b) * (1 + level("training") * 0.1);
    const damage = w.damageStructure.bind(w);
    w.damageStructure = (id, n, source, side) =>
      damage(
        id,
        n *
          (side === "ally"
            ? 1 + level("siege") * 0.08 + (has("SiegeHammer") ? 0.2 : 0)
            : w.structure(id)?.defense
              ? 1 - level("wall") * 0.06
              : 1),
        source,
        side,
      );
    const launch = g.physics.launch.bind(g.physics);
    g.physics.launch = (power) => {
      launch(power);
      const b = g.physics.ball;
      if (b) {
        const v = Math.min(
          PHYSICS.maxSpeed / 60,
          b.speed * (1 + level("launcher") * 0.03),
        );
        if (b.speed > 0)
          Matter.Body.setVelocity(b, {
            x: (b.velocity.x * v) / b.speed,
            y: (b.velocity.y * v) / b.speed,
          });
      }
    };
    const cast = g.magic!.cast.bind(g.magic);
    const transform = g.magic!.balls!.transform.bind(g.magic!.balls);
    g.magic!.balls!.transform = (...args) => {
      transform(...args);
      if (args[1] === "phantom" && has("PhantomRune"))
        g.magic!.balls!.state(args[0])!.phaseLeft++;
    };
    g.magic!.cast = (...args) => {
      const error = cast(...args);
      if (!error) {
        const key = args[0],
          end = g.magic!.data.cooldowns[key];
        g.magic!.data.cooldowns[key] =
          g.time +
          (end - g.time) *
            (1 - level("cooldown") * 0.05 - (has("ArcaneClock") ? 0.15 : 0));
      }
      return error;
    };
  }
  choose(id: string) {
    if (this.s.status !== "route" || !this.available.includes(id)) return false;
    const node = this.s.nodes.find((n) => n.id === id)!;
    this.s.node = id;
    this.s.status = "playing";
    this.s.flags.nodeHits = 0;
    this.s.flags.twin = 0;
    this.s.flags.crystal = 0;
    this.s.flags.curseProduction = node.risk === "cursed" ? 1 : 0;
    this.s.flags.curseAttack = node.risk === "elite" ? 1 : 0;
    const w = this.g.war!;
    w.data.options.preparation = 0;
    this.host.battle.clearBoss();
    this.host.battle.setRegion(node.region);
    w.enemyArmy.data.units = [];
    w.enemyArmy.data.queues = {};
    const c = w.castle("ally");
    c.hp = Math.min(
      c.maxHp,
      c.hp + c.maxHp * (this.s.upgrades.castle ?? 0) * 0.05,
    );
    w.player.resources.reward({
      wood: (this.s.upgrades.repair ?? 0) * 20,
      stone: (this.s.upgrades.repair ?? 0) * 20,
      energy: (this.s.upgrades.energy ?? 0) * 15,
    });
    if (this.s.relics.includes("RoyalStandard")) {
      w.army.data.morale = Math.min(100, w.army.data.morale + 10);
      for (const u of w.army.living) u.squad = "deployed";
    }
    if (node.kind === "boss") this.host.battle.summonBoss(node.region);
    else if (["battle", "elite"].includes(node.kind))
      for (const kind of ["swordsman", "spearman", "archer"] as const)
        this.host.battle.spawn(
          kind,
          node.act * (node.kind === "elite" ? 3 : 2),
          "enemy",
          node.act,
        );
    else if (node.kind === "puzzle") {
      this.s.flags.puzzleGoal = 5 + node.act;
      this.s.flags.puzzleDeadline = this.s.time + 90000;
    } else {
      this.g.pause();
      this.host.persist();
      this.host.onChange();
      return true;
    }
    this.g.resume();
    this.host.persist();
    this.host.onChange();
    return true;
  }
  event(choice: "accept" | "skip") {
    const n = this.current;
    if (
      !n ||
      n.complete ||
      !["resource", "market", "repair", "treasure", "shrine"].includes(n.kind)
    )
      return false;
    const r = this.g.war!.player.resources,
      c = this.g.war!.castle("ally");
    if (choice === "accept") {
      if (n.kind === "market") {
        const cost = this.s.relics.includes("MerchantSeal") ? 90 : 120;
        if (!r.transact({ gold: cost })) return false;
        r.reward({ wood: 100, stone: 80, food: 100, mana: 20 });
      }
      if (n.kind === "resource")
        r.reward({ wood: 100, stone: 80, gold: 100, food: 120 });
      if (n.kind === "repair") c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.35);
      if (n.kind === "shrine") {
        c.hp = Math.max(1, c.hp - c.maxHp * 0.15);
        this.s.flags.curseAttack = 1;
      }
    }
    this.complete(
      choice === "accept" && ["treasure", "shrine"].includes(n.kind),
    );
    return true;
  }
  tick() {
    if (this.twin && this.g.time >= this.twin.until) {
      const b = this.g.physics.balls.find((b) => b.id === this.twin!.bodyId);
      if (b && b !== this.g.physics.ball) this.g.physics.removeSphere(b);
      this.twin = undefined;
    }
    const n = this.current;
    if (!n || n.complete || this.s.status !== "playing") return;
    this.g.physics.bumperFactor = 1 + (this.s.upgrades.bumper ?? 0) * 0.05;
    if (
      ["battle", "elite", "boss"].includes(n.kind) &&
      this.g.war!.enemyArmy.living.length === 0
    ) {
      if (n.kind === "boss") this.s.stats.bosses++;
      this.complete(n.kind === "boss");
    }
    if (n.kind === "puzzle") {
      if (this.s.flags.nodeHits >= this.s.flags.puzzleGoal)
        this.complete(false);
      else if (this.s.time >= this.s.flags.puzzleDeadline)
        this.host.finish(false, "룬 퍼즐의 제한 시간을 넘겼습니다.");
    }
  }
  hit() {
    const s = this.s,
      g = this.g;
    s.flags.nodeHits = (s.flags.nodeHits ?? 0) + 1;
    g.magic!.charge(
      (s.upgrades.charge ?? 0) * 2 +
        (g.score.combo.count >= 3 ? (s.upgrades.combo ?? 0) * 2 : 0) +
        (s.relics.includes("FrostMirror") &&
        g.magic!.balls!.state()?.type === "ice"
          ? 4
          : 0),
      s.upgrades.multi ?? 0,
      (s.upgrades.storm ?? 0) + (s.relics.includes("StormRelic") ? 2 : 0),
    );
    if (
      s.relics.includes("TwinCore") &&
      g.score.combo.count >= 8 &&
      !s.flags.twin &&
      g.physics.balls.length < 10
    ) {
      const before = new Set(g.physics.balls.map((b) => b.id));
      if (g.magic!.balls!.create("steel", g.time + 15000, "multiball", 1)) {
        s.flags.twin = 1;
        const b = g.physics.balls.find((b) => !before.has(b.id));
        if (b) this.twin = { bodyId: b.id, until: g.time + 15000 };
      }
    }
    if (
      s.relics.includes("LivingCrystal") &&
      s.flags.nodeHits % 10 === 0 &&
      (s.flags.crystal ?? 0) < 6
    ) {
      g.economy!.resources.reward({ energy: 5 });
      s.flags.crystal = (s.flags.crystal ?? 0) + 1;
    }
  }
  private complete(relic: boolean) {
    const n = this.current!;
    n.complete = true;
    if (n.row === 14) {
      this.host.finish(true, "세 원정과 암흑 황제를 모두 정복했습니다.");
      return;
    }
    const rng = new SeededRandom(this.s.seedState);
    const pool = relic
      ? RELICS.filter((r) => !this.s.relics.includes(r.id))
      : ROGUE_UPGRADES.filter(
          (r) => (this.s.upgrades[r.id.slice(3)] ?? 0) < r.max,
        );
    const choices: string[] = [];
    while (choices.length < 3 && pool.length) {
      const total = pool.reduce((a, r) => a + RARITY_WEIGHT[r.rarity], 0);
      let roll = rng.next() * total,
        index = 0;
      for (; index < pool.length - 1; index++) {
        roll -= RARITY_WEIGHT[pool[index].rarity];
        if (roll < 0) break;
      }
      choices.push(pool.splice(index, 1)[0].id);
    }
    this.s.seedState = rng.state;
    this.s.rewards = choices;
    this.s.rewardId = this.s.id + ":" + n.id;
    this.s.status = choices.length ? "reward" : "route";
    this.g.pause();
    this.host.persist();
    this.host.onChange();
  }
  reward(id: string) {
    if (id.startsWith("up-")) {
      const key = id.slice(3);
      this.s.upgrades[key] = Math.min(3, (this.s.upgrades[key] ?? 0) + 1);
    } else if (RELICS.some((r) => r.id === id) && !this.s.relics.includes(id))
      this.s.relics.push(id);
    this.s.status = "route";
    this.g.pause();
  }
}
import Matter from "matter-js";
