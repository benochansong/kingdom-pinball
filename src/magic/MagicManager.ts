import type Matter from "matter-js";
import type { GameStateManager } from "../core/GameStateManager";
import type { UnitEntity } from "../army/types";
import type { Structure, Side } from "../war/types";
import { maxHp } from "../army/DamageCalculator";
import {
  element,
  ELEMENTS,
  MAGIC_RESEARCH,
  MULTI_TYPES,
  STORMS,
  spell,
  SPELLS,
} from "../config/magic";
import { scaleCost } from "../building/BuildingManager";
import { freshMagic } from "./MagicSave";
import type { Element, Spell, MagicData } from "./types";
import { BallManager } from "./BallManager";
import { StatusEffectManager } from "./StatusEffectManager";
type Target = UnitEntity | Structure;
export class MagicManager {
  readonly data: MagicData;
  readonly balls?: BallManager;
  readonly status: StatusEffectManager;
  contactBall?: Matter.Body;
  private accumulator = 0;
  private nextSpawn = 0;
  private lastCombo = 0;
  private lastMilitary = 0;
  private lastWalls = 0;
  private lastCommander = "";
  effects: {
    x: number;
    y: number;
    radius: number;
    type: string;
    until: number;
    tx?: number;
    ty?: number;
  }[] = [];
  constructor(
    readonly game: GameStateManager,
    readonly side: Side = "ally",
  ) {
    this.data = this.economy.data.magic ??= freshMagic();
    this.status = new StatusEffectManager(this.data, () => this.now);
    if (side === "ally") {
      this.balls = new BallManager(game.physics, this.data);
      // Safe load checkpoint consumes the already-paid ability, retaining cooldowns and gauges.
      if (this.data.multi) {
        this.data.cooldowns[this.data.multi.storm ? "storm" : "multiball"] =
          Math.max(
            this.data.cooldowns[
              this.data.multi.storm ? "storm" : "multiball"
            ] ?? 0,
            this.now + 30000,
          );
        this.data.multi = null;
      }
      game.physics.shouldPhase = (b, other) => {
        const state = this.balls!.state(b),
          s = game.war?.structure(other.label);
        if (
          state?.type !== "phantom" ||
          !state.phaseLeft ||
          s?.side !== "enemy" ||
          !s.defense
        )
          return false;
        state.phaseLeft--;
        this.effect(b.position.x, b.position.y, 30, "phantom");
        return true;
      };
    }
    this.lastMilitary = this.army.data.stats.combos;
    this.lastWalls = game.war?.data.stats.walls ?? 0;
  }
  get economy() {
    return this.side === "ally" ? this.game.economy! : this.game.war!.enemy;
  }
  get army() {
    return this.side === "ally" ? this.game.army! : this.game.war!.enemyArmy;
  }
  get now() {
    return this.game.time;
  }
  get stopped() {
    return (
      !!this.game.testBall ||
      this.game.saveConflict ||
      !!this.game.war?.data.result ||
      this.game.state === "over" ||
      this.game.state === "menu"
    );
  }
  get protected() {
    return !!this.game.war?.preparing;
  }
  get combat() {
    return this.game.army!.combat;
  }
  get targets(): Target[] {
    return [...this.combat.units, ...(this.game.war?.data.structures ?? [])];
  }
  find(id: string) {
    return this.targets.find((t) => t.id === id && t.hp > 0);
  }
  has(type: string) {
    return (
      this.economy.data.building?.buildings.some(
        (b) => b.type === type && !b.disabled,
      ) ?? false
    );
  }
  notify(text: string) {
    if (this.side === "ally")
      this.game.events.emit("message", { text, tone: "gold" });
  }
  save() {
    this.game.checkpoint();
  }
  effect(
    x: number,
    y: number,
    radius: number,
    type: string,
    tx?: number,
    ty?: number,
  ) {
    if (this.effects.length >= 48) this.effects.shift();
    this.effects.push({ x, y, radius, type, until: this.now + 650, tx, ty });
    this.game.events.emit("militarySound", { kind: type });
  }
  locked(id: string): string | null {
    if (id === "steel") return null;
    const r = MAGIC_RESEARCH.find((r) => r.id === id);
    if (!r) return "알 수 없는 마법";
    if (this.economy.data.rank < r.rank) return `왕국 등급 ${r.rank} 필요`;
    if (!this.has(r.facility)) return `${r.facility} 건설·복구 필요`;
    if (!(this.data.research[id] > 0)) return `${r.name} 필요`;
    return null;
  }
  research(id: string): string | null {
    const r = MAGIC_RESEARCH.find((r) => r.id === id),
      level = (this.data.research[id] ?? 0) + 1;
    if (this.stopped || !r || this.data.task)
      return "연구를 시작할 수 없습니다.";
    if (level > 3) return "최대 연구 단계입니다.";
    if (
      this.economy.data.rank < r.rank ||
      (id === "multiball" && level > 1 && this.economy.data.rank < 5)
    )
      return "왕국 발전 등급이 부족합니다.";
    if (!this.has(r.facility)) return `${r.facility} 시설이 필요합니다.`;
    const paid = scaleCost(r.cost, level);
    if (!this.economy.resources.transact(paid))
      return "연구 자원이 부족합니다.";
    this.data.stats.mana += paid.mana ?? 0;
    this.data.task = { id, level, progress: 0, paid };
    this.save();
    return null;
  }
  private pay(mana: number, charge: number) {
    const paid = Math.max(
      0,
      Math.ceil(mana * (1 - 0.05 * (this.data.research.efficiency ?? 0))),
    );
    if (
      this.data.charge < charge ||
      !this.economy.resources.transact({ mana: paid })
    )
      return false;
    this.data.charge -= charge;
    this.data.stats.mana += paid;
    return true;
  }
  activate(type: Element): string | null {
    if (
      this.stopped ||
      this.game.state !== "playing" ||
      !this.game.physics.launched ||
      !this.game.physics.ball
    )
      return "공을 발사한 뒤 사용할 수 있습니다.";
    const reason = this.locked(type);
    if (reason) return reason;
    if (this.now < (this.data.cooldowns.transform ?? 0))
      return "속성 전환 대기 중";
    const c = element(type);
    if (!c || !this.pay(c.mana, c.charge))
      return "마력석 또는 마법 충전량이 부족합니다.";
    this.balls!.transform(
      this.game.physics.ball,
      type,
      this.now + c.seconds * 1000,
    );
    this.data.cooldowns.transform = this.now + 500;
    this.data.stats.uses[type] = (this.data.stats.uses[type] ?? 0) + 1;
    if (type !== "steel") this.award("FIRST MAGIC");
    this.effect(
      this.game.physics.ball.position.x,
      this.game.physics.ball.position.y,
      35,
      type,
    );
    this.notify(`${c.name} · ${c.seconds || "∞"}초`);
    this.save();
    return null;
  }
  charge(amount: number, multi = 0, storm = 0) {
    if (this.stopped) return;
    const before = this.data.charge;
    this.data.charge = Math.min(100, before + amount);
    this.data.stats.charge += this.data.charge - before;
    if (!this.data.multi)
      this.data.multiCharge = Math.min(100, this.data.multiCharge + multi);
    if (!this.data.multi?.storm)
      this.data.stormCharge = Math.min(100, this.data.stormCharge + storm);
  }
  validHit(id: string, type: string, ball?: Matter.Body) {
    if (this.stopped) return;
    const key = `hit-${id}`;
    if (this.now < (this.data.cooldowns[key] ?? 0)) return;
    this.data.cooldowns[key] = this.now + 550;
    const b = this.balls?.state(ball);
    if (b) {
      this.data.stats.hits[b.type] = (this.data.stats.hits[b.type] ?? 0) + 1;
      b.hits++;
      if (this.data.multi) this.data.stats.multiHits++;
    }
    const amounts: Record<string, number[]> = {
      arcane: [8, 0, 0],
      sanctuary: [5, 0, 0],
      crystal: [5, 0, 0],
      altar: [10, 5, 0],
      reflector: [4, 3, 0],
      multiballShrine: [5, 10, 0],
      stormObelisk: [5, 0, 5],
      enemyUnit: [1, 0, 0],
      wall: [2, 0, 0],
      palace: [10, 10, 0],
    };
    const a = amounts[type];
    if (a) this.charge(a[0], a[1], a[2]);
    if (this.data.task && ["elementalForge", "mysticLibrary"].includes(type))
      this.data.task.progress = Math.min(1, this.data.task.progress + 0.025);
    if (b?.type === "explosion" && b.hits >= 5 && ball) {
      this.burst(ball.position, 85, 55, "explosion");
      this.balls!.transform(ball, "steel", 0);
    }
    if (
      b?.type === "golden" &&
      [
        "arcane",
        "lumber",
        "quarry",
        "gold",
        "farm",
        "forest",
        "stone",
      ].includes(type)
    ) {
      const prior = this.data.history.at(-1);
      if (
        prior?.element === "golden" &&
        prior.target !== type &&
        this.now - prior.at < 8000 &&
        [prior.target, type].includes("arcane")
      )
        this.combo("prosperity", () => {
          this.charge(15);
          this.economy.resources.grant("gold", 10, "production");
        });
      this.data.history.push({ element: "golden", target: type, at: this.now });
    }
  }
  royal() {
    this.charge(10, 10, 0);
  }
  rewardFactor(ball?: Matter.Body, resource?: string) {
    const b = this.balls?.state(ball);
    return (
      (this.balls?.resourceFactor(ball) ?? 1) *
      (b?.type === "golden" ? (resource === "gold" ? 1.5 : 1.25) : 1) *
      (this.data.multi?.storm ? 1.2 : 1)
    );
  }
  resistance(t: Target, type: Element) {
    const defender =
      t.side === "ally" ? this.game.economy! : this.game.war?.enemy;
    let value = (defender?.data.magic?.research.resistance ?? 0) * 0.08;
    const faction = this.game.war?.data.options.enemy;
    if (t.side === "enemy") {
      if (faction === "iron" && type === "cannon") value += 0.15;
      if (faction === "crimson" && type === "fire") value += 0.15;
      if (faction === "arcane" && ["ice", "thunder"].includes(type))
        value += 0.15;
    }
    return Math.min(0.6, value);
  }
  sphereFactor(t: Target, ball = this.contactBall) {
    const type = this.balls?.state(ball)?.type ?? "steel",
      c = element(type);
    let factor =
      c.damage *
      (1 + 0.05 * Math.max(0, (this.data.research[type] ?? 1) - 1)) *
      (this.balls?.damageFactor(ball) ?? 1) *
      (1 - this.resistance(t, type));
    if (!("kind" in t) && type === "cannon") factor *= 1.5;
    if (
      !("kind" in t) &&
      type === "fire" &&
      ["lumber", "farm", "barracks"].includes(t.type)
    )
      factor *= 1.3;
    return factor;
  }
  direct(t: Target, amount: number, ball = this.contactBall) {
    const b = this.balls?.state(ball);
    if (!b) return;
    this.noteDamage(b.type, amount);
    this.validHit(t.id, "kind" in t ? "enemyUnit" : t.type, ball);
    if (t.hp <= 0) {
      if (!("kind" in t) && t.type === "wall") {
        this.data.stats.walls++;
      }
      return;
    }
    this.elementHit(t, b.type);
  }
  private noteDamage(type: Element, amount: number) {
    this.data.stats.damage[type] = (this.data.stats.damage[type] ?? 0) + amount;
    if (this.data.multi?.storm) this.data.stats.stormDamage += amount;
  }
  deal(t: Target, raw: number, type: Element, dot = false) {
    if (this.stopped || this.protected || t.hp <= 0 || t.side === this.side)
      return 0;
    const before = t.hp,
      amount = Math.min(250, raw * (1 - this.resistance(t, type)));
    if ("kind" in t) this.combat.hurt(t, amount);
    else this.game.war?.damageStructure(t.id, amount, "unit", this.side);
    const actual = before - t.hp;
    this.noteDamage(type, actual);
    if (dot) this.data.stats.dot += actual;
    if (t.hp <= 0 && type === "fire") this.data.stats.fireKills++;
    this.effect(t.x, t.y, 18, type);
    return actual;
  }
  elementHit(t: Target, type: Element) {
    if (this.stopped || this.protected || t.side === this.side || t.hp <= 0)
      return;
    const power = 1 + 0.15 * (this.data.research[type] ?? 0);
    if (type === "chaos")
      type = (["fire", "ice", "thunder", "golden"] as Element[])[
        Math.floor(Math.random() * 4)
      ];
    const burn = this.status.get(t.id, "burn"),
      chill = this.status.get(t.id, "chill"),
      shock = this.status.get(t.id, "shock");
    if (type === "fire") {
      this.status.add(t.id, "burn", 4000, 4 * power);
      if (chill)
        this.combo("thermal", () => {
          this.status.consume(t.id, "chill");
          this.deal(t, 25, "fire");
        });
    }
    if (type === "ice") {
      if (burn)
        this.combo("thermal", () => {
          this.status.consume(t.id, "burn");
          this.deal(t, 25, "ice");
        });
      const s = this.status.add(t.id, "chill", 4000);
      if ("kind" in t) {
        if (t.charge) this.data.stats.frozenCharges++;
        t.charge = false;
        if (
          s.stacks >= 3 &&
          this.now >= (this.data.cooldowns[`freeze-${t.id}`] ?? 0)
        ) {
          this.status.add(t.id, "freeze", t.squad === "commander" ? 400 : 1500);
          t.stun = Math.max(
            t.stun,
            this.now + (t.squad === "commander" ? 400 : 1500),
          );
          this.status.consume(t.id, "chill");
          this.data.cooldowns[`freeze-${t.id}`] = this.now + 6000;
        }
      }
    }
    if (type === "thunder") {
      this.status.add(t.id, "shock", 250);
      if ("kind" in t) t.stun = Math.max(t.stun, this.now + 200);
      this.chain(
        t,
        12 * power,
        Math.min(5, 2 + (this.data.research.thunder ?? 0)),
      );
      if (burn)
        this.combo("overload", () => {
          this.status.consume(t.id, "burn");
          this.burst(t, 65, 20, "thunder");
        });
    }
    if (type === "cannon") {
      if (chill || this.status.get(t.id, "freeze"))
        this.combo("shatter", () => {
          this.status.consume(t.id, "chill");
          this.status.consume(t.id, "freeze");
          this.deal(t, 30, "cannon");
        });
      if (shock)
        this.combo("armorBreaker", () => {
          this.status.consume(t.id, "shock");
          this.status.add(t.id, "break", 5000, 0.2);
        });
    }
    if (type === "golden")
      this.economy.resources.grant("gold", 1, "production");
    this.data.history.push({ element: type, target: t.id, at: this.now });
    this.data.history = this.data.history
      .filter((h) => this.now - h.at < 10000)
      .slice(-20);
    if (
      ["fire", "ice", "thunder"].every((type) =>
        this.data.history.some((h) => h.element === type),
      )
    )
      this.combo("fury", () => {
        this.burst(t, 80, 35, "thunder");
        this.data.history = [];
      });
  }
  chain(origin: Target, damage: number, max = 5) {
    if (this.protected || this.stopped) return;
    const seen = new Set([origin.id]);
    let from = origin;
    for (let i = 0; i < max; i++) {
      const next = this.combat.units
        .filter(
          (t) =>
            t.side !== this.side &&
            t.hp > 0 &&
            !seen.has(t.id) &&
            Math.hypot(t.x - from.x, t.y - from.y) < 110,
        )
        .sort(
          (a, b) =>
            Math.hypot(a.x - from.x, a.y - from.y) -
            Math.hypot(b.x - from.x, b.y - from.y),
        )[0];
      if (!next) break;
      seen.add(next.id);
      this.deal(next, damage, "thunder");
      this.status.add(next.id, "shock", 200);
      this.effect(from.x, from.y, 0, "thunder", next.x, next.y);
      from = next;
    }
    if (seen.size >= 4) this.award("CHAIN MASTER");
  }
  burst(
    p: { x: number; y: number },
    radius: number,
    damage: number,
    type: Element,
  ) {
    for (const t of this.targets
      .filter(
        (t) =>
          t.hp > 0 &&
          t.side !== this.side &&
          Math.hypot(t.x - p.x, t.y - p.y) < radius,
      )
      .slice(0, 30))
      this.deal(t, damage, type);
    this.effect(p.x, p.y, radius, type);
  }
  combo(id: string, action: () => void) {
    if (
      this.now < (this.data.cooldowns[`combo-${id}`] ?? 0) ||
      this.stopped ||
      this.protected
    )
      return;
    this.data.cooldowns[`combo-${id}`] = this.now + 15000;
    this.data.stats.combos[id] = (this.data.stats.combos[id] ?? 0) + 1;
    action();
    this.charge(15, 8, 8);
    this.notify(`ELEMENTAL COMBO · ${id.toUpperCase()}`);
  }
  damageFilter(t: Target, amount: number) {
    const shield = this.status.get(t.id, "shield"),
      blessing = this.status.get(t.id, "blessing"),
      broken = this.status.get(t.id, "break");
    let adjusted =
      amount * (shield ? 0.6 : blessing ? 0.9 : 1) * (broken ? 1.2 : 1);
    if (adjusted < amount) this.data.stats.shield += amount - adjusted;
    return adjusted;
  }
  heal(t: UnitEntity, amount: number) {
    if (t.hp <= 0) return;
    const actual = Math.min(maxHp(t) - t.hp, amount);
    t.hp += actual;
    this.data.stats.healing += actual;
    if (actual) this.effect(t.x, t.y, 18, "healing");
  }
  multiball(storm = false): string | null {
    if (
      this.stopped ||
      this.game.state !== "playing" ||
      !this.game.physics.launched ||
      !this.game.physics.ball
    )
      return "발사 후 사용하세요.";
    if (this.data.multi) return "이미 멀티볼이 진행 중입니다.";
    const id = storm ? "storm" : "multiball",
      reason = this.locked(id);
    if (reason) return reason;
    if (this.now < (this.data.cooldowns[id] ?? 0))
      return "재사용 대기 중입니다.";
    if ((storm ? this.data.stormCharge : this.data.multiCharge) < 100)
      return "게이지 100이 필요합니다.";
    const level = this.data.research[id],
      type = MULTI_TYPES[this.data.loadout.multi],
      variant = STORMS[this.data.loadout.storm];
    const elements = storm ? variant.elements : type.elements;
    if (elements.some((e) => e !== "steel" && !this.data.research[e]))
      return "구성된 속성 연구가 필요합니다.";
    if (storm && this.data.loadout.storm !== "core" && level < 2)
      return "CORE STORM 연구 2단계 필요";
    const count = storm ? 10 : [3, 5, 7][level - 1];
    if (!this.pay(storm ? 25 : level * 5 + type.extra, 0))
      return "마력석이 부족합니다.";
    const until = this.now + (storm ? 15 : [15, 20, 25][level - 1]) * 1000;
    this.data.multi = {
      count,
      until,
      started: this.now,
      storm,
      variant: storm ? this.data.loadout.storm : this.data.loadout.multi,
      saves: 0,
      pending: Array.from(
        { length: count - 1 },
        (_, i) => elements[(i + 1) % elements.length],
      ),
    };
    this.balls!.transform(this.game.physics.ball, elements[0], until);
    this.balls!.state()!.source = storm ? "storm" : "multiball";
    if (storm) {
      this.data.stormCharge = 0;
      this.data.stats.storms++;
      this.army.data.morale = Math.min(100, this.army.data.morale + 15);
      this.army.data.buffs.magicStorm = until;
      this.award("STORM AWAKENING");
      this.burst(this.game.physics.ball.position, 110, 35, "thunder");
    } else {
      this.data.multiCharge = 0;
      this.data.stats.multiballs++;
      this.award("MULTIBALL ROOKIE");
    }
    this.notify(storm ? variant.name : type.name);
    this.effect(300, 450, 170, storm ? "storm" : "multiball");
    this.save();
    return null;
  }
  endMulti() {
    const m = this.data.multi;
    if (!m) return;
    this.balls?.end();
    this.data.multi = null;
    this.data.cooldowns[m.storm ? "storm" : "multiball"] =
      this.now + (m.storm ? 120000 : 45000);
    this.army.data.buffs.magicStorm = 0;
    if (!m.storm && this.game.physics.ball) this.charge(0, 0, 10);
    this.effect(300, 450, 70, "multiEnd");
    this.save();
  }
  autoTarget(id: Spell): { x: number; y: number } | null {
    const own = ["holyLight", "royalShield"].includes(id),
      list = this.targets.filter(
        (t) =>
          t.hp > 0 &&
          (own ? t.side === this.side : t.side !== this.side) &&
          (id === "royalShield"
            ? (!("kind" in t) && t.defense) || (!("kind" in t) && t.castle)
            : id === "holyLight"
              ? "kind" in t && t.hp < maxHp(t)
              : id === "earthquake"
                ? !("kind" in t)
                : "kind" in t),
      );
    if (!list.length) return null;
    const radius = spell(id).radius;
    return list
      .map((t) => ({
        t,
        score: list.reduce(
          (n, u) => n + (Math.hypot(t.x - u.x, t.y - u.y) < radius ? 1 : 0),
          0,
        ),
      }))
      .sort((a, b) => b.score - a.score)[0].t;
  }
  cast(id: Spell, p = this.autoTarget(id)): string | null {
    if (this.stopped || this.protected)
      return "보호 시간 종료 후 사용할 수 있습니다.";
    const reason = this.locked(id);
    if (reason) return reason;
    const c = spell(id);
    if (
      !p ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      p.x < 60 ||
      p.x > 520 ||
      p.y < 90 ||
      p.y > 740
    )
      return "유효한 전장 대상을 선택하세요.";
    if (this.now < (this.data.cooldowns[id] ?? 0))
      return "주문 재사용 대기 중입니다.";
    const targets = this.targets.filter(
      (t) => t.hp > 0 && Math.hypot(t.x - p.x, t.y - p.y) < c.radius,
    );
    const own = ["holyLight", "royalShield"].includes(id);
    if (
      !targets.some(
        (t) =>
          (own ? t.side === this.side : t.side !== this.side) &&
          (id === "chainLightning" || id === "frostField"
            ? "kind" in t
            : id === "royalShield"
              ? !("kind" in t) && (t.castle || t.defense)
              : id === "holyLight"
                ? "kind" in t && t.hp < maxHp(t)
                : id === "earthquake"
                  ? !("kind" in t)
                  : true),
      )
    )
      return "범위 안에 유효한 대상이 없습니다.";
    if (!this.pay(c.mana, c.charge))
      return "마력석 또는 마법 충전량이 부족합니다.";
    this.data.cooldowns[id] = this.now + c.cooldown * 1000;
    this.data.stats.spells[id] = (this.data.stats.spells[id] ?? 0) + 1;
    const power = 1 + 0.1 * ((this.data.research[id] ?? 1) - 1);
    if (id === "fireStorm") {
      for (const t of targets.filter((t) => t.side !== this.side)) {
        this.deal(t, 35 * power, "fire");
        if (t.hp > 0) this.status.add(t.id, "burn", 4000, 4 * power);
      }
    }
    if (id === "frostField")
      this.data.fields.push({
        spell: id,
        ...p,
        until: this.now + 6000,
        next: 0,
      });
    if (id === "chainLightning") {
      const first = targets.find((t) => t.side !== this.side && "kind" in t);
      if (first) {
        this.deal(first, 30 * power, "thunder");
        this.chain(first, 25 * power, 4);
      }
    }
    if (id === "royalShield") {
      for (const t of targets.filter(
        (t) =>
          t.side === this.side && !("kind" in t) && (t.castle || t.defense),
      ))
        this.status.add(t.id, "shield", 8000, 0.4);
      if (this.now < (this.data.cooldowns.healedUntil ?? 0))
        this.combo("sacredGuard", () => {
          for (const u of this.army.living)
            this.status.add(u.id, "blessing", 8000);
          this.army.data.morale = Math.min(100, this.army.data.morale + 5);
        });
    }
    if (id === "holyLight") {
      for (const t of targets.filter(
        (t): t is UnitEntity => t.side === this.side && "kind" in t,
      )) {
        this.heal(t, 35 * power);
        this.game.magic?.status.clean(t.id);
        this.game.enemyMagic?.status.clean(t.id);
      }
      this.army.data.morale = Math.min(100, this.army.data.morale + 5);
      this.data.cooldowns.healedUntil = this.now + 10000;
    }
    if (id === "earthquake") {
      for (const t of targets.filter((t) => t.side !== this.side)) {
        if (!("kind" in t)) this.deal(t, 85 * power, "cannon");
        else {
          t.stun = Math.max(
            t.stun,
            this.now + (t.squad === "commander" ? 200 : 500),
          );
          this.status.add(t.id, "shock", 500);
        }
      }
    }
    this.effect(p.x, p.y, c.radius, id);
    this.notify(c.name);
    this.save();
    return null;
  }
  canEditLoadout() {
    return (
      !this.game.war ||
      this.game.war.preparing ||
      !this.game.physics.launched ||
      (!!this.game.physics.ball && this.game.physics.ball.position.y > 500)
    );
  }
  configure(
    balls: Element[],
    spells: Spell[],
    multi: string,
    storm: string,
    autoAim: boolean,
  ): string | null {
    if (this.stopped || !this.canEditLoadout())
      return "준비 기간 또는 공이 아군 하단 구역에 있을 때 변경하세요.";
    if (
      balls.length > 4 ||
      spells.length > 2 ||
      balls.some(
        (e) =>
          !ELEMENTS.some((c) => c.id === e) ||
          (e !== "steel" && !this.data.research[e]),
      ) ||
      spells.some(
        (s) => !SPELLS.some((c) => c.id === s) || !this.data.research[s],
      )
    )
      return "연구 완료한 능력만 등록할 수 있습니다.";
    if (
      !MULTI_TYPES[multi] ||
      !STORMS[storm] ||
      MULTI_TYPES[multi].elements.some(
        (e) => e !== "steel" && !this.data.research[e],
      )
    )
      return "멀티볼 속성 연구가 필요합니다.";
    if (
      storm !== "core" &&
      ((this.data.research.storm ?? 0) < 2 ||
        STORMS[storm].elements.some((e) => !this.data.research[e]))
    )
      return "궁극기 변형 연구 조건이 부족합니다.";
    this.data.loadout = { balls, spells, multi, storm, autoAim };
    this.save();
    return null;
  }
  private enemyAI() {
    const w = this.game.war;
    if (this.side !== "enemy" || !w) return;
    const pending = this.data.enemyCast;
    if (pending && this.now >= pending.at) {
      this.data.enemyCast = null;
      const error = this.cast(pending.spell, pending);
      if (!error)
        w.notice("enemySpell", `적 마법 발동 · ${spell(pending.spell).name}`);
    }
    if (this.now < this.data.nextAI) return;
    this.data.nextAI = this.now + 8000;
    const faction = w.data.options.enemy,
      preferred: Spell[] =
        faction === "iron"
          ? ["royalShield"]
          : faction === "crimson"
            ? ["fireStorm"]
            : faction === "golden"
              ? ["holyLight", "royalShield"]
              : faction === "arcane"
                ? ["chainLightning", "frostField", "holyLight"]
                : ["frostField", "fireStorm"];
    if (
      !this.has("mysticLibrary") &&
      !w.data.work.some((j) => j.side === "enemy" && j.type === "mysticLibrary")
    )
      for (const p of [
        { x: 110, y: 230 },
        { x: 480, y: 230 },
        { x: 300, y: 290 },
      ])
        if (!w.queueBuild("enemy", "mysticLibrary", p)) break;
    if (!this.data.task) {
      const next = preferred.find((id) => !this.data.research[id]);
      if (next) this.research(next);
      else if ((this.data.research.resistance ?? 0) < 3)
        this.research("resistance");
    }
    if (!this.protected && !this.data.enemyCast) {
      const id = preferred.find(
        (id) =>
          !this.locked(id) &&
          this.now >= (this.data.cooldowns[id] ?? 0) &&
          this.data.charge >= spell(id).charge &&
          this.economy.data.resources.mana >= spell(id).mana &&
          this.autoTarget(id),
      );
      if (id) {
        const p = this.autoTarget(id)!;
        this.data.enemyCast = {
          spell: id,
          x: p.x,
          y: p.y,
          at: this.now + 3000,
        };
        w.notice(
          "enemyMagicWarning",
          `적 ${spell(id).name} · 3초 후 (${Math.round(p.x)}, ${Math.round(p.y)})`,
        );
        this.effect(p.x, p.y, spell(id).radius, "warning");
        this.save();
      }
    }
  }
  award(id: string) {
    if (!this.data.achievements.includes(id)) {
      this.data.achievements.push(id);
      this.notify(`마법 업적 · ${id}`);
    }
  }
  tick(dt: number) {
    if (this.stopped) return;
    this.balls?.tick(this.now);
    const m = this.data.multi;
    if (m && this.now >= m.until) this.endMulti();
    else if (m && m.pending.length && this.now >= this.nextSpawn) {
      this.nextSpawn = this.now + 60;
      const type = m.pending[0];
      if (
        this.balls?.create(
          type,
          m.until,
          m.storm ? "storm" : "multiball",
          m.count - m.pending.length,
        )
      )
        m.pending.shift();
    }
    this.data.stats.maxBalls = Math.max(
      this.data.stats.maxBalls,
      this.game.physics.balls.length,
    );
    this.accumulator += dt;
    if (this.accumulator < 0.05) return;
    const step = this.accumulator;
    this.accumulator = 0;
    const task = this.data.task;
    if (task) {
      const r = MAGIC_RESEARCH.find((r) => r.id === task.id)!;
      if (this.has(r.facility)) {
        task.progress = Math.min(
          1,
          task.progress + step / (r.seconds * task.level),
        );
        if (task.progress >= 1) {
          this.data.research[task.id] = task.level;
          this.data.task = null;
          if (
            ELEMENTS.some((e) => e.id === task.id) &&
            this.data.loadout.balls.length < 4 &&
            !this.data.loadout.balls.includes(task.id as Element)
          )
            this.data.loadout.balls.push(task.id as Element);
          if (
            SPELLS.some((s) => s.id === task.id) &&
            this.data.loadout.spells.length < 2 &&
            !this.data.loadout.spells.includes(task.id as Spell)
          )
            this.data.loadout.spells.push(task.id as Spell);
          this.notify(`${r.name} ${task.level}단계 완료`);
          this.save();
        }
      }
    }
    this.status.prune((id) => !!this.find(id));
    for (const s of this.data.statuses)
      if (s.kind === "burn" && this.now >= s.next) {
        s.next = this.now + 500;
        const t = this.find(s.target);
        if (t) this.deal(t, s.power * s.stacks * 0.5, "fire", true);
      }
    for (const ball of this.game.physics.balls) {
      if (
        this.balls?.state(ball)?.type !== "healing" ||
        this.protected ||
        !this.game.physics.launched ||
        this.game.tilt.tilted
      )
        continue;
      for (const t of this.game.war?.data.structures.filter(
        (t) =>
          t.side === this.side &&
          t.hp > 0 &&
          t.hp < t.maxHp &&
          Math.hypot(t.x - ball.position.x, t.y - ball.position.y) < 40,
      ) ?? []) {
        const key = `repair-${t.id}`;
        if (this.now < (this.data.cooldowns[key] ?? 0)) continue;
        this.data.cooldowns[key] = this.now + 1000;
        const actual = Math.min(2, t.maxHp - t.hp);
        t.hp += actual;
        this.data.stats.healing += actual;
      }
    }
    this.effects = this.effects.filter((e) => e.until > this.now);
    this.data.fields = this.data.fields.filter((f) => f.until > this.now);
    for (const f of this.data.fields)
      if (this.now >= f.next) {
        f.next = this.now + 500;
        for (const u of this.combat.units.filter(
          (u) =>
            u.hp > 0 &&
            u.side !== this.side &&
            Math.hypot(u.x - f.x, u.y - f.y) < 100,
        )) {
          this.status.add(u.id, "chill", 1000);
          u.charge = false;
        }
      }
    this.enemyAI();
    for (const b of this.game.physics.balls) {
      if (
        this.balls?.state(b)?.type !== "healing" ||
        !this.game.physics.launched ||
        this.game.tilt.tilted ||
        this.now < this.game.recovery.suppressUntil
      )
        continue;
      for (const u of this.army.living.filter(
        (u) => Math.hypot(u.x - b.position.x, u.y - b.position.y) < 45,
      )) {
        const key = `heal-${u.id}`;
        if (this.now < (this.data.cooldowns[key] ?? 0)) continue;
        this.data.cooldowns[key] = this.now + 1000;
        this.heal(
          u,
          5 *
            (1 + 0.15 * (this.data.research.healing ?? 0)) *
            (this.balls?.damageFactor(b) ?? 1),
        );
        this.status.add(u.id, "blessing", 3000);
        this.army.data.morale = Math.min(100, this.army.data.morale + 0.2);
      }
    }
    if (this.side === "ally") {
      const combo = this.game.score.combo.count;
      if (combo >= 10 && combo > this.lastCombo) {
        this.charge(0, 10, 5);
        this.lastCombo = combo + 9;
      }
      if (!combo) this.lastCombo = 0;
      if (this.army.data.stats.combos > this.lastMilitary) {
        this.charge(0, 5, 5);
        this.lastMilitary = this.army.data.stats.combos;
      }
      const walls = this.game.war?.data.stats.walls ?? 0;
      if (walls > this.lastWalls) {
        this.charge(0, 0, 10);
        this.lastWalls = walls;
      }
      const commander = this.game.war?.data.ai.commanderId;
      if (
        commander &&
        commander !== this.lastCommander &&
        !this.game.war!.enemyArmy.living.some((u) => u.id === commander)
      ) {
        this.charge(0, 0, 10);
        this.lastCommander = commander;
      }
    }
    if (this.data.stats.fireKills >= 10) this.award("FIRE MASTER");
    if (this.data.stats.frozenCharges >= 3) this.award("FROST GUARDIAN");
    if (this.data.stats.walls >= 1) this.award("SIEGE SORCERER");
    if (this.data.stats.healing + this.data.stats.shield >= 200)
      this.award("HOLY PROTECTOR");
    if (this.data.stats.multiHits >= 40) this.award("MULTIBALL MASTER");
    if (Object.keys(this.data.stats.combos).length >= 4)
      this.award("ELEMENTAL ARCHMAGE");
  }
}
