import type { WarManager } from "./WarManager";
import { DIFFICULTIES, ENEMIES, ENEMY_SLOTS } from "../config/war";
import { FACILITIES, TRADES, RESOURCE_IDS } from "../config/economy";
import { unitConfig, RESEARCH } from "../config/army";
import { buildingConfig } from "../config/buildings";
import { scaleCost } from "../building/BuildingManager";
import { maxHp } from "../army/DamageCalculator";
import type { Strategy } from "./types";
export class EnemyAI {
  constructor(private war: WarManager) {}
  update() {
    const w = this.war,
      d = w.data,
      a = d.ai,
      e = w.enemy,
      army = w.enemyArmy,
      faction = ENEMIES[d.options.enemy],
      difficulty = DIFFICULTIES[d.options.difficulty];
    if (w.now >= a.nextHarvest) {
      a.nextHarvest = w.now + 3000 / (difficulty.production * faction.economy);
      const options = FACILITIES.filter(
        (f) =>
          w.facilityFactor("enemy", f.target) > 0 &&
          e.resources.space(f.resource) > 0,
      ).sort(
        (a, b) =>
          e.data.resources[a.resource] / (a.resource === "food" ? 2 : 1) -
          e.data.resources[b.resource] / (b.resource === "food" ? 2 : 1),
      );
      const f = options[a.harvestIndex++ % Math.min(3, options.length)];
      if (f) {
        e.data.launchState = "inflight";
        e.harvest(f.target, 300, true);
      }
    }
    if (w.now < a.nextThink) return;
    a.nextThink = w.now + 4000;
    const castle = w.castle("enemy"),
      ratio = castle.hp / castle.maxHp;
    if (
      !w.preparing &&
      army.living.some((u) => u.squad === "scout" && u.y > 350)
    )
      w.scout("enemy");
    if (
      !w.preparing &&
      w.army.living.some((u) => u.y < 300) &&
      d.structures.some(
        (s) => s.side === "enemy" && s.type === "watchtower" && s.hp > 0,
      )
    )
      w.scout("enemy");
    let desired: Strategy =
      ratio < 0.25
        ? "emergency"
        : d.structures.some((s) => s.side === "enemy" && s.hp < s.maxHp * 0.5)
          ? "recovery"
          : w.army.living.some((u) => u.y < 280)
            ? "defense"
            : e.data.rank < 2
              ? "economy"
              : army.living.some((u) => u.kind === "catapult")
                ? "siege"
                : w.now > a.nextAttack - 20000
                  ? "assault"
                  : army.living.length < 5
                    ? "military"
                    : w.now < d.options.preparation * 1000 + 20000
                      ? "recon"
                      : d.options.enemy === "shadow"
                        ? "raid"
                        : "military";
    if (
      desired !== a.strategy &&
      (w.now - a.since >= 12000 || desired === "emergency")
    ) {
      a.strategy = desired;
      a.since = w.now;
    }
    if (ratio < 0.25 && !a.lastStand) {
      a.lastStand = true;
      a.strategy = "emergency";
      army.data.formation = "shield";
      for (const u of army.living) u.squad = "deployed";
      w.notice(
        "lastStand",
        "LAST STAND · 적 왕궁이 남은 병력과 자원을 동원합니다.",
      );
      w.onSound("castle");
    }
    const damaged = d.structures
      .filter((s) => s.side === "enemy" && s.hp < s.maxHp * 0.65)
      .sort(
        (a, b) =>
          (a.castle ? -2 : 0) -
          (b.castle ? -2 : 0) +
          a.hp / a.maxHp -
          b.hp / b.maxHp,
      );
    if (damaged[0] && e.data.resources.gold > 35)
      w.repair(damaged[0].id, ratio < 0.25, "enemy");
    if (w.now > 12000) {
      const low = FACILITIES.filter(
        (f) => w.facilityFactor("enemy", f.target) > 0,
      ).sort(
        (a, b) => e.data.facilities[a.id].level - e.data.facilities[b.id].level,
      );
      if (low[0]) e.upgrade(low[0].id);
    }
    if (
      RESOURCE_IDS.some(
        (r) =>
          r !== "energy" &&
          e.data.resources[r] > e.resources.capacity(r) * 0.85,
      )
    )
      e.upgradeStorage();
    if (d.options.enemy === "golden" || e.data.resources.food < army.upkeep) {
      const trade = TRADES.find((t) => t.to === "food" && t.from === "gold");
      if (trade) e.market.trade(trade.id, Math.min(2, e.market.max(trade.id)));
    }
    const preferred = [...faction.builds];
    if (
      a.intel &&
      w.now - a.intel.at < 90000 &&
      (a.intel.kinds.archer ?? 0) + (a.intel.kinds.mage ?? 0) > 3
    )
      preferred.unshift("stable");
    const available = preferred.find((type) => {
      const c = buildingConfig(type)!;
      return (
        e.data.rank >= c.rank &&
        !army.buildings.some((b) => b.type === type) &&
        !d.work.some((x) => x.side === "enemy" && x.type === type)
      );
    });
    if (available) {
      for (const p of [
        ...ENEMY_SLOTS,
        { x: 300, y: 290 },
        { x: 110, y: 230 },
        { x: 480, y: 230 },
      ])
        if (!w.queueBuild("enemy", available, p)) break;
    }
    const barracks = army.buildings.find(
      (b) => b.type === "barracks" && !b.disabled,
    );
    if (
      barracks &&
      barracks.level < Math.min(e.data.rank, 3) &&
      e.resources.transact(
        scaleCost(buildingConfig("barracks")!.cost, 0.6 * barracks.level),
      )
    ) {
      barracks.level++;
      w.syncStructures();
      w.layout();
    }
    if (e.data.rank >= 3 && !army.data.researchTask) {
      const research = RESEARCH.find(
        (r) =>
          (army.data.research[r.id] ?? 0) < 2 &&
          army.buildings.some((b) => b.type === r.building && !b.disabled),
      );
      if (research) army.startResearch(research.id);
    }
    let kinds = [...faction.units];
    if (
      a.intel &&
      w.now - a.intel.at < 90000 &&
      (a.intel.kinds.knight ?? 0) >= 2
    )
      kinds = ["spearman", ...kinds];
    // Choose affordable unlocked units from a deterministic faction rotation, never spawn a wave for free.
    kinds = [
      ...kinds.slice(a.harvestIndex % kinds.length),
      ...kinds.slice(0, a.harvestIndex % kinds.length),
      "swordsman",
    ];
    for (const kind of kinds) {
      const c = unitConfig(kind),
        b = army.buildings.find((b) => b.type === c.building && !b.disabled);
      if (
        b &&
        army.queueFor(b.id).entries.length < 3 &&
        army.enqueue(b.id, kind, 1)
      )
        break;
    }
    if (
      !w.preparing &&
      a.wave === 0 &&
      w.now < d.options.preparation * 1000 + 25000
    ) {
      const scout = army.living.find((u) => u.squad === "reserve");
      if (scout) scout.squad = "scout";
    }
    if (a.lastStand) {
      a.warningAt = 0;
      a.nextAttack = w.now + 60000;
      for (const u of army.living)
        if (u.squad === "reserve") u.squad = "deployed";
    }
    if (!w.preparing && !a.warningAt && w.now >= a.nextAttack - 10000) {
      const reserves = army.living.filter((u) => u.squad === "reserve");
      if (!reserves.length) {
        a.nextAttack = w.now + 15000;
        return;
      }
      const observed = a.intel && w.now - a.intel.at < 90000;
      a.lane =
        d.options.enemy === "shadow"
          ? observed && a.intel!.lane === "left"
            ? "right"
            : "left"
          : d.options.enemy === "crimson"
            ? a.wave % 2
              ? "right"
              : "center"
            : "center";
      a.warningAt = w.now + 10000;
      w.notice(
        "invasion",
        `적 침공 예고 · ${a.lane === "left" ? "왼쪽" : a.lane === "right" ? "오른쪽" : "중앙"} · 약 ${Math.max(1, reserves.length - 2)}~${reserves.length + 2}기 · 10초`,
      );
      w.onSound("invasion");
    }
    if (a.warningAt && w.now >= a.warningAt) {
      const count = [4, 9, 11, 14, 18, 24][Math.min(5, a.wave)];
      const units = army.living
        .filter((u) => u.squad === "reserve")
        .slice(0, count);
      for (const u of units) u.squad = "deployed";
      if (units.length) {
        a.wave++;
        w.notice("deploy", `적 ${units.length}기 출격 · ${a.wave}차 침공`);
      }
      a.warningAt = 0;
      a.nextAttack =
        w.now +
        Math.max(
          45000,
          ((120000 * faction.attack) / difficulty.aggression) *
            (w.finalOffensive ? 0.7 : 1),
        );
    }
    if (!a.commanderId && a.wave >= 3) {
      const commander = army.living.find(
        (u) => u.kind === faction.commander && u.squad === "deployed",
      );
      if (commander) {
        a.commanderId = commander.id;
        commander.squad = "commander";
        commander.rank = 5;
        commander.hp = maxHp(commander);
        a.abilityAt = w.now + 20000;
        w.notice(
          "commander",
          `${faction.title} 등장 · 특수 능력은 3초 전에 예고됩니다.`,
        );
      }
    }
    const commander = army.living.find((u) => u.id === a.commanderId);
    if (commander && w.now >= a.abilityAt - 3000 && !a.abilityWarning) {
      a.abilityWarning = w.now + 3000;
      w.notice("ability", `${faction.title} · 3초 후 지휘 능력!`);
    }
    if (commander && a.abilityWarning && w.now >= a.abilityWarning) {
      const near = army.living.filter(
        (u) => Math.hypot(u.x - commander.x, u.y - commander.y) < 150,
      );
      switch (d.options.enemy) {
        case "iron":
          army.data.buffs.shield = w.now + 8000;
          break;
        case "crimson":
          army.data.buffs.iron = w.now + 8000;
          for (const u of near.filter((u) => u.kind === "knight"))
            u.charge = true;
          break;
        case "golden":
          army.data.buffs.recruitment = w.now + 10000;
          break;
        case "arcane":
          for (const u of near) u.hp = Math.min(maxHp(u), u.hp + 15);
          army.data.buffs.shield = w.now + 5000;
          break;
        case "shadow":
          a.lane = a.lane === "left" ? "right" : "left";
          army.data.buffs.iron = w.now + 7000;
          break;
      }
      a.abilityWarning = 0;
      a.abilityAt = w.now + 30000;
    }
  }
  get tactic(): string {
    const w = this.war,
      a = w.data.ai,
      units = w.enemyArmy.living;
    if (a.strategy === "emergency") return "LAST STAND";
    if (a.strategy === "recovery") return "EMERGENCY RETREAT";
    if (units.some((u) => u.kind === "catapult") && a.strategy === "siege")
      return "SIEGE ASSAULT";
    if (a.strategy === "defense") return "DEFENSIVE WALL";
    if (w.data.options.enemy === "shadow")
      return units.some((u) => u.kind === "knight")
        ? "FLANK ATTACK"
        : "ECONOMIC RAID";
    if (
      units.filter((u) => ["archer", "mage"].includes(u.kind)).length >
      units.length / 2
    )
      return "RANGED PRESSURE";
    return "FRONTAL ASSAULT";
  }
}
