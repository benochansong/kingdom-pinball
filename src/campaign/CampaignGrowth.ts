import { ELEMENTS, SPELLS } from "../config/magic";
import Matter from "matter-js";
import type { CampaignManager } from "./CampaignManager";
import {
  CAMPAIGN_RESEARCH,
  EQUIPMENT,
  GENERALS,
  TERRITORY_FACILITIES,
  REGION_MAGIC,
} from "../config/campaignGrowth";
import { stage, prestigeRank } from "../config/campaign";
import { scaleCost } from "../building/BuildingManager";
import { buildingConfig } from "../config/buildings";
import { counter } from "../army/DamageCalculator";
import { freshMagic } from "../magic/MagicSave";
export class CampaignGrowth {
  constructor(readonly campaign: CampaignManager) {}
  get p() {
    return this.campaign.profile!;
  }
  private editable() {
    return !!this.campaign.profile && !this.campaign.active;
  }
  research(id: string) {
    const r = CAMPAIGN_RESEARCH.find((r) => r.id === id);
    if (!this.editable() || !r) return "월드맵에서 연구하세요.";
    const level = (this.p.research[id] ?? 0) + 1;
    if (level > r.max) return "최대 단계입니다.";
    if (!this.p.cores.includes(r.region)) return "관련 지역 정복이 필요합니다.";
    const points = r.points * level,
      specialty = r.specialty * level;
    if (
      this.p.points < points ||
      (this.p.specialties[r.region] ?? 0) < specialty
    )
      return "연구 포인트 또는 지역 특산물이 부족합니다.";
    this.p.points -= points;
    this.p.specialties[r.region] -= specialty;
    this.p.research[id] = level;
    if (
      CAMPAIGN_RESEARCH.every((r) => (this.p.research[r.id] ?? 0) >= r.max) &&
      !this.p.achievements.includes("ROYAL SCHOLAR")
    )
      this.p.achievements.push("ROYAL SCHOLAR");
    this.campaign.persist();
    return null;
  }
  develop(region: string, facility: string) {
    if (!this.editable() || !Object.hasOwn(TERRITORY_FACILITIES, facility))
      return "월드맵에서 관리하세요.";
    const t = this.p.territories[region];
    if (!t) return "정복한 영토에서만 건설할 수 있습니다.";
    const level = (t.facilities[facility] ?? 0) + 1;
    if (level > 5) return "최대 발전 단계입니다.";
    const cost = 10 * level;
    if ((this.p.specialties[region] ?? 0) < cost || this.p.points < level)
      return "특산물 또는 연구 포인트가 부족합니다.";
    this.p.specialties[region] -= cost;
    this.p.points -= level;
    t.facilities[facility] = level;
    t.level = t.facilities.administration ?? 1;
    this.p.prestige += 5;
    this.campaign.persist();
    return null;
  }
  general(id: string) {
    if (
      !this.editable() ||
      !this.p.generals.includes(id) ||
      !GENERALS.some((g) => g.id === id)
    )
      return "해금한 장군을 월드맵에서 선택하세요.";
    this.p.general = id;
    this.campaign.persist();
    return null;
  }
  equip(id: string) {
    const e = EQUIPMENT.find((e) => e.id === id);
    if (!this.editable() || !e || !this.p.equipment.includes(id))
      return "획득한 장비를 월드맵에서 선택하세요.";
    this.p.loadout[e.slot] = this.p.loadout[e.slot] === id ? "" : id;
    this.campaign.persist();
    return null;
  }
  trade(from: string, to: string, automatic = false) {
    if (
      !this.editable() ||
      from === to ||
      !this.p.cores.includes(from) ||
      !this.p.cores.includes(to)
    )
      return "서로 다른 정복 영토를 선택하세요.";
    let route = this.p.trade.find((t) => t.from === from && t.to === to);
    if (!route) {
      if (this.p.trade.length >= 8) return "교역로는 최대 8개입니다.";
      route = { from, to, used: 0, turn: this.p.turn, automatic: false };
      this.p.trade.push(route);
    }
    if (automatic) {
      route.automatic = !route.automatic;
      this.campaign.persist();
      return null;
    }
    if (route.turn !== this.p.turn) {
      route.turn = this.p.turn;
      route.used = 0;
    }
    if (route.used >= 3) return "현재 캠페인 턴 교역 한도 3회입니다.";
    if ((this.p.specialties[from] ?? 0) < 5)
      return "보낼 특산물 5개가 필요합니다.";
    const gain = Math.min(
      3,
      Math.floor(
        2 *
          (1 +
            0.1 * (this.p.research.trade ?? 0) +
            0.05 * (this.p.territories[to].facilities.trade ?? 0)),
      ),
    );
    this.p.specialties[from] -= 5;
    this.p.specialties[to] = (this.p.specialties[to] ?? 0) + gain;
    route.used++;
    this.campaign.persist();
    return null;
  }
  turn() {
    const p = this.p;
    for (const g of GENERALS)
      if (p.cores.includes(g.region) && !p.generals.includes(g.id))
        p.generals.push(g.id);
    for (const e of EQUIPMENT)
      if (p.cores.includes(e.region) && !p.equipment.includes(e.id))
        p.equipment.push(e.id);
    for (const route of p.trade) {
      route.used = 0;
      route.turn = p.turn;
      if (route.automatic && (p.specialties[route.from] ?? 0) >= 5) {
        p.specialties[route.from] -= 5;
        p.specialties[route.to] = (p.specialties[route.to] ?? 0) + 2;
        route.used = 1;
      }
    }
    for (const [id, t] of Object.entries(p.territories)) {
      p.points += Math.min(2, Math.floor((t.facilities.research ?? 0) / 2));
      const resource =
        id === "iron" || id === "frost"
          ? "stone"
          : id === "desert"
            ? "gold"
            : id === "arcane"
              ? "mana"
              : "wood";
      p.stock[resource] = Math.min(
        150,
        (p.stock[resource] ?? 0) + 5 * (t.facilities.trade ?? 0),
      );
    }
    if (p.turn % 3 === 0 && p.cores.length) {
      const region = p.cores[(p.turn / 3 - 1) % p.cores.length];
      p.events = p.events
        .filter((e) => !e.done && e.expires >= p.turn)
        .slice(-2);
      p.events.push({
        id: `counter-${p.turn}`,
        region,
        expires: p.turn + 3,
        done: false,
      });
    }
  }
  apply(initial: boolean) {
    const c = this.campaign,
      g = c.game,
      w = g.war!,
      p = this.p,
      level = (id: string) => Math.min(3, p.research[id] ?? 0),
      gear = (id: string) => Object.values(p.loadout).includes(id),
      general = p.general;
    if (initial) {
      for (const k of ["wood", "stone", "gold", "mana", "food"] as const) {
        const stock = Math.min(100, p.stock[k] ?? 0);
        w.player.data.resources[k] += 30 * level(k) + stock;
        p.stock[k] = (p.stock[k] ?? 0) - stock;
      }
      w.player.data.resources.gold += prestigeRank(p.prestige) * 5;
      if (general === "merchant") {
        w.player.data.resources.gold += 60;
        w.player.data.resources.wood += 40;
      }
      if (general === "archmage") w.player.data.resources.mana += 10;
      const castle = w.castle("ally");
      castle.castleMultiplier = 1 + 0.05 * level("palace");
      castle.maxHp = Math.round(castle.maxHp * castle.castleMultiplier);
      castle.hp = castle.maxHp;
      w.army.data.morale = Math.min(
        100,
        w.army.data.morale +
          3 * level("command") +
          (general === "tactician" ? 5 : 0),
      );
      const m = (w.player.data.magic ??= freshMagic());
      for (const id of p.cores.flatMap((id) => REGION_MAGIC[id] ?? []))
        m.research[id] = Math.max(m.research[id] ?? 0, 1);
      if (p.magicLoadout) m.loadout = structuredClone(p.magicLoadout);
      else {
        m.loadout.balls = ELEMENTS.filter(
          (e) => e.id !== "steel" && m.research[e.id],
        )
          .slice(0, 4)
          .map((e) => e.id);
        m.loadout.spells = SPELLS.filter((e) => m.research[e.id])
          .slice(0, 2)
          .map((e) => e.id);
      }
      if (c.session?.event) {
        const t = p.territories[stage(c.session.stage).region];
        const extra = 1 + 0.03 * (t?.facilities.garrison ?? 0);
        const before = castle.castleMultiplier ?? 1;
        castle.castleMultiplier = Math.min(1.3, before * extra);
        castle.maxHp = Math.round(
          (castle.maxHp * castle.castleMultiplier) / before,
        );
        castle.hp = castle.maxHp;
      }
      for (const id of [
        "fire",
        "ice",
        "thunder",
        "phantom",
        "multiball",
        "storm",
        "resistance",
      ])
        m.research[id] = Math.max(m.research[id] ?? 0, level(id));
      if (level("storm"))
        for (const id of ["fire", "ice", "thunder", "cannon", "healing"])
          m.research[id] = Math.max(m.research[id] ?? 0, 1);
    }
    for (const body of Matter.Composite.allBodies(g.physics.engine.world))
      if (
        ["forest", "stone", "gold", "crystal", "env-metal"].includes(body.label)
      )
        body.restitution = Math.min(
          0.98,
          body.restitution * (1 + 0.03 * level("bumper")),
        );
    w.army.unlockExtra = (kind) =>
      this.unlockedUnits.includes(kind)
        ? null
        : "관련 캠페인 지역 정복으로 병종을 해금하세요.";
    const capacity = w.player.resources.capacity.bind(w.player.resources);
    w.player.resources.capacity = (id) =>
      Math.floor(
        capacity(id) * (id === "energy" ? 1 : 1 + 0.1 * level("storage")),
      );
    const production = w.player.facilityFactor;
    w.player.facilityFactor = (id) =>
      production(id) *
      Math.min(
        1.3,
        1 +
          0.05 * level("production") +
          (general === "merchant" ? 0.05 : 0) +
          (gear("sunEmblem") ? 0.05 : 0),
      );
    const speed = w.army.productionFactor;
    w.army.productionFactor = (b) =>
      speed(b) *
      (1 + 0.05 * level("recruitment") + (general === "conqueror" ? 0.1 : 0));
    const quote = w.repairQuote.bind(w);
    w.repairQuote = (id, emergency = false) =>
      scaleCost(
        quote(id, emergency),
        w.structure(id)?.side === "ally"
          ? Math.max(
              0.6,
              1 -
                0.05 * level(emergency ? "emergency" : "repair") -
                (general === "guardian" ? 0.1 : 0),
            )
          : 1,
      );
    const cost = w.builder.cost.bind(w.builder);
    w.builder.cost = (type, all) =>
      scaleCost(
        cost(type, all),
        buildingConfig(type)?.category === "physics"
          ? Math.max(
              0.65,
              1 -
                0.05 * level("reflector") -
                (general === "engineer" ? 0.15 : 0),
            )
          : 1,
      );
    const filter = w.army.combat.damageFilter;
    w.army.combat.damageFilter = (u, n, source, sphere) => {
      let value = filter(u, n, source, sphere);
      if (u.side === "ally")
        value *= 1 - 0.02 * level("formation") - 0.02 * level("defense");
      else if (source?.side === "ally") {
        if (["swordsman", "spearman"].includes(source.kind))
          value *= 1 + 0.05 * level("infantry");
        if (source.kind === "catapult") value *= 1 + 0.08 * level("siege");
        if (general === "tactician" && counter(source.kind, u.kind) > 1)
          value *= 1.08;
      }
      return value;
    };
    const structures = w.damageFilter;
    w.damageFilter = (s, n) =>
      structures(s, n) *
      (s.side === "ally" && s.defense
        ? 1 - 0.04 * level("wall") - (general === "guardian" ? 0.1 : 0)
        : s.side === "enemy" && general === "conqueror"
          ? 1.05
          : 1);
    const movement = w.army.combat.movementFactor;
    w.army.combat.movementFactor = (u) =>
      movement(u) *
      (u.side === "ally" && u.kind === "knight"
        ? 1 + 0.05 * level("cavalry")
        : 1);
    const charge = g.magic!.charge.bind(g.magic);
    g.magic!.charge = (amount, multi = 0, storm = 0) =>
      charge(
        Math.min(
          30,
          amount *
            (1 +
              (general === "archmage" ? 0.1 : 0) +
              (gear("arcaneCrystal") ? 0.1 : 0)),
        ),
        multi,
        storm,
      );
    const factor = g.magic!.sphereFactor.bind(g.magic);
    g.magic!.sphereFactor = (target, ball) => {
      const type = g.magic!.balls!.state(ball ?? g.magic!.contactBall)?.type;
      return (
        factor(target, ball) *
        ((type === "cannon" && gear("ironShell") && !("kind" in target)) ||
        (type === "ice" && gear("frostGem")) ||
        (["fire", "explosion"].includes(type ?? "") && gear("magmaModule")) ||
        (type === "phantom" && gear("shadowEssence"))
          ? 1.1
          : 1)
      );
    };
    const relaunch = w.player.payRelaunch.bind(w.player);
    w.player.payRelaunch = () => {
      const paid = relaunch();
      if (paid && level("energy"))
        w.player.resources.grant("energy", level("energy"));
      return paid;
    };
  }
  hit() {
    const g = this.campaign.game;
    if (g.score.combo.count >= 3) g.magic?.charge(this.p.research.combo ?? 0);
  }
  get unlockedUnits() {
    const p = this.p;
    return [
      "swordsman",
      "spearman",
      "archer",
      ...(p.cores.includes("iron") ? ["guard", "catapult"] : []),
      ...(p.cores.includes("shadow") ? ["knight"] : []),
      ...(p.cores.includes("frost") ? ["healer"] : []),
      ...(p.cores.includes("arcane") ? ["mage"] : []),
    ];
  }
  get description() {
    const p = this.p;
    return GENERALS.find((g) => g.id === p.general)?.effect ?? "";
  }
}
