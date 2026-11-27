import Matter from "matter-js";
import type { ModeBattle } from "./ModeBattle";
import { scaleCost } from "../building/BuildingManager";
import { buildingConfig } from "../config/buildings";
import { counter } from "../army/DamageCalculator";
import { MAGIC_RESEARCH, ELEMENTS } from "../config/magic";
export function applyModeLoadout(battle: ModeBattle, initial: boolean) {
  const g = battle.game,
    w = g.war!,
    s = battle.host.session,
    o = s.options;
  if (!["survival", "bossRush"].includes(s.kind)) return;
  if (initial) {
    if (o.general === "merchant")
      w.player.resources.reward({ gold: 60, wood: 40 });
    if (o.general === "archmage") w.player.resources.reward({ mana: 10 });
    if (o.general === "tactician")
      w.army.data.morale = Math.min(100, w.army.data.morale + 5);
    for (const id of o.magic.slice(0, 2)) {
      const r = MAGIC_RESEARCH.find((r) => r.id === id);
      if (!r) continue;
      if (
        battle.build(r.facility, true) ||
        w.builder.buildings.some((b) => b.type === r.facility)
      )
        g.magic!.data.research[id] = 1;
    }
    g.magic!.data.loadout.balls = o.magic.filter((id) =>
      ELEMENTS.some((e) => e.id === id),
    ) as any;
  }
  const prod = w.player.productionBonus.bind(w.player);
  w.player.productionBonus = (r) =>
    prod(r) *
    (1 +
      (o.general === "merchant" ? 0.05 : 0) +
      (o.equipment === "sunEmblem" ? 0.05 : 0));
  const train = w.army.productionFactor;
  w.army.productionFactor = (b) =>
    train(b) * (o.general === "conqueror" ? 1.1 : 1);
  const filter = w.army.combat.damageFilter;
  w.army.combat.damageFilter = (u, n, source, sphere) =>
    filter(
      u,
      n *
        (source?.side === "ally" &&
        o.general === "tactician" &&
        counter(source.kind, u.kind) > 1
          ? 1.08
          : 1),
      source,
      sphere,
    );
  const structure = w.damageFilter;
  w.damageFilter = (target, n) =>
    structure(target, n) *
    (target.side === "ally" && target.defense && o.general === "guardian"
      ? 0.9
      : target.side === "enemy" && o.general === "conqueror"
        ? 1.05
        : 1);
  const quote = w.repairQuote.bind(w);
  w.repairQuote = (id, emergency = false) =>
    scaleCost(
      quote(id, emergency),
      w.structure(id)?.side === "ally" && o.general === "guardian" ? 0.9 : 1,
    );
  const cost = w.builder.cost.bind(w.builder);
  w.builder.cost = (type, all) =>
    scaleCost(
      cost(type, all),
      o.general === "engineer" && buildingConfig(type)?.category === "physics"
        ? 0.85
        : 1,
    );
  const launch = g.physics.launch.bind(g.physics);
  g.physics.launch = (power) => {
    launch(power);
    if (o.general === "engineer" && g.physics.ball) {
      const b = g.physics.ball;
      Matter.Body.setVelocity(b, {
        x: b.velocity.x * 1.05,
        y: b.velocity.y * 1.05,
      });
      g.physics.limitSpeed(b);
    }
  };
  const charge = g.magic!.charge.bind(g.magic);
  g.magic!.charge = (amount, multi = 0, storm = 0) =>
    charge(
      amount *
        (1 +
          (o.general === "archmage" ? 0.1 : 0) +
          (o.equipment === "arcaneCrystal" ? 0.1 : 0)),
      multi,
      storm,
    );
  const sphere = g.magic!.sphereFactor.bind(g.magic);
  g.magic!.sphereFactor = (target, ball) => {
    const type = g.magic!.balls!.state(ball ?? g.magic!.contactBall)?.type;
    return (
      sphere(target, ball) *
      ((o.equipment === "ironShell" &&
        type === "cannon" &&
        !("kind" in target)) ||
      (o.equipment === "frostGem" && type === "ice") ||
      (o.equipment === "magmaModule" &&
        ["fire", "explosion"].includes(type ?? "")) ||
      (o.equipment === "shadowEssence" && type === "phantom")
        ? 1.1
        : 1)
    );
  };
}
