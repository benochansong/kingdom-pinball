import type { ModeBattle } from "./ModeBattle";
import type { ArmyFixture } from "./types";
import { RESOURCE_IDS, type Cost } from "../config/economy";
import { PhysicsLabController } from "./PhysicsLabController";
import { maxHp } from "../army/DamageCalculator";
import { RESEARCH } from "../config/army";
import { MAGIC_RESEARCH } from "../config/magic";
/** All overrides belong to this disposable war instance, never to global configuration. */
export class SandboxManager {
  readonly physics: PhysicsLabController;
  constructor(readonly battle: ModeBattle) {
    this.physics = new PhysicsLabController(
      battle.game,
      battle.host.session.options.physics,
    );
  }
  get settings() {
    return this.battle.host.session.options.sandbox;
  }
  attach() {
    const g = this.battle.game,
      w = g.war!,
      s = () => this.settings;
    this.battle.beforePhysics = (dt) => this.physics.beforeStep(dt);
    const ai = w.ai.update.bind(w.ai);
    w.ai.update = (...args) => {
      if (s().ai && s().enemyKingdom) ai(...args);
    };
    const production = w.player.productionBonus.bind(w.player);
    w.player.productionBonus = (r) => production(r) * s().production;
    const train = w.army.productionFactor;
    w.army.productionFactor = (b) => train(b) * s().training;
    Object.defineProperty(w.army, "capacity", {
      configurable: true,
      get: () => s().population,
    });
    const resources = w.player.resources,
      capacity = resources.capacity.bind(resources),
      pay = resources.transact.bind(resources),
      can = resources.canAfford.bind(resources);
    const scaled = (cost: Cost) =>
      Object.fromEntries(
        Object.entries(cost).map(([r, n]) => [r, Math.ceil(n * s().cost)]),
      );
    resources.capacity = (r) =>
      s().storage ? capacity(r) : r === "energy" ? 100 : 100000;
    resources.canAfford = (c) => can(scaled(c));
    resources.transact = (c, gain = {}) => {
      const saved = resources.canAfford;
      resources.canAfford = can;
      try {
        return pay(scaled(c), gain);
      } finally {
        resources.canAfford = saved;
      }
    };
    const damage = w.damageStructure.bind(w);
    w.damageStructure = (id, n, source, side) => {
      const target = w.data.structures.find((x) => x.id === id);
      if (
        (!s().enemyKingdom && target?.side === "enemy") ||
        !s().destruction ||
        (target?.castle && !s().castleDamage) ||
        (target?.side === "ally" && s().allyInvincible) ||
        (target?.side === "enemy" && s().enemyInvincible)
      )
        return 0;
      return damage(id, n, source, side);
    };
    for (const army of [w.army, w.enemyArmy]) {
      const movement = army.combat.movementFactor,
        filter = army.combat.damageFilter;
      army.combat.movementFactor = (u) => (s().movement ? movement(u) : 0);
      army.combat.damageFilter = (u, n, source, sphere) =>
        (u.side === "ally" && s().allyInvincible) ||
        (u.side === "enemy" && s().enemyInvincible)
          ? 0
          : filter(u, n, source, sphere);
    }
    const end = w.finish.bind(w);
    w.finish = (...args) => {
      if (s().endConditions) end(...args);
    };
  }
  initialize() {
    this.applyMagic();
    this.tick();
  }
  applyMagic() {
    const flags = this.battle.host.session.flags;
    const research = this.battle.game.magic!.data.research;
    if (this.settings.allMagic && !flags.sandboxMagic) {
      for (const r of MAGIC_RESEARCH)
        flags[`magicBefore:${r.id}`] = research[r.id] ?? 0;
      this.battle.magicKit(true);
      flags.sandboxMagic = 1;
    } else if (!this.settings.allMagic && flags.sandboxMagic) {
      for (const r of MAGIC_RESEARCH)
        research[r.id] = Number(flags[`magicBefore:${r.id}`] ?? 0);
      flags.sandboxMagic = 0;
    }
  }
  tick() {
    const g = this.battle.game,
      w = g.war!,
      s = this.settings;
    if (s.unlimited)
      for (const r of RESOURCE_IDS)
        w.player.data.resources[r] = Math.min(
          w.player.resources.capacity(r),
          r === "energy" ? 100 : 10000,
        );
    if (s.infiniteMana)
      w.player.data.resources.mana = w.player.resources.capacity("mana");
    if (s.infiniteCharge) {
      g.magic!.data.charge = 100;
      g.magic!.data.multiCharge = 100;
      g.magic!.data.stormCharge = 100;
    }
    if (!s.cooldowns)
      for (const key of [
        "transform",
        "multiball",
        "storm",
        "fireStorm",
        "frostField",
        "chainLightning",
        "royalShield",
        "holyLight",
        "earthquake",
      ])
        g.magic!.data.cooldowns[key] = 0;
    if (!s.enemyKingdom) w.enemyArmy.data.queues = {};
    if (!s.invasion) w.data.ai.nextAttack = g.time + 60000;
  }
  spawn(f: ArmyFixture) {
    const w = this.battle.game.war!,
      a = w.troops(f.side);
    a.data.formation = f.formation;
    for (const { id } of RESEARCH)
      a.data.research[id] = Math.min(5, Math.max(0, f.research));
    const units = this.battle.spawn(f.kind, f.count, f.side, f.rank);
    for (const u of units) u.hp = maxHp(u);
    return units.length;
  }
}
