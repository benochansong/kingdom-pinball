import type { GameStateManager } from "../core/GameStateManager";
import type { CampaignSession, BossState } from "./types";
import type { UnitKind } from "../army/types";
import { unitConfig } from "../config/army";
import { region, stage } from "../config/campaign";
export const BOSS_CONFIG: Record<
  string,
  { armor: number; pattern: string; weakness: string; interval: number }
> = {
  greenwood: {
    armor: 0,
    pattern: "cavalry",
    weakness: "창병 · 기병 돌격 저지",
    interval: 18,
  },
  shadow: {
    armor: 0,
    pattern: "teleport",
    weakness: "정찰 목표로 실제 위치 공개",
    interval: 16,
  },
  iron: {
    armor: 450,
    pattern: "shockwave",
    weakness: "공성구·투석기로 외부 장갑 파괴",
    interval: 22,
  },
  desert: {
    armor: 0,
    pattern: "sun",
    weakness: "태양석 타격 후 8초 보호막 약화",
    interval: 20,
  },
  frost: {
    armor: 0,
    pattern: "icewall",
    weakness: "화염구·공성구로 얼음 성벽 돌파",
    interval: 22,
  },
  volcano: {
    armor: 0,
    pattern: "breath",
    weakness: "얼음·공성 공격 / 화염 준비 중 코어 노출",
    interval: 18,
  },
  arcane: {
    armor: 0,
    pattern: "arcane",
    weakness: "보호막과 다른 속성 / 룬 목표로 해제",
    interval: 16,
  },
  dark: {
    armor: 0,
    pattern: "imperial",
    weakness: "보호시설 파괴 · 5단계 최종 형태",
    interval: 18,
  },
};
export class BossManager {
  readonly state: BossState;
  private nextThink = 0;
  constructor(
    readonly game: GameStateManager,
    readonly session: CampaignSession,
  ) {
    const w = game.war!,
      r = region(stage(session.stage).region),
      m = session.mission;
    let u = m.boss
      ? w.enemyArmy.data.units.find((u) => u.id === m.boss!.unitId)
      : undefined;
    if (!m.boss) {
      u = w.enemyArmy.createUnit(
        r.unit,
        "enemy",
        w.enemyArmy.navigation.closest({ x: 300, y: 180 }) ?? {
          x: 300,
          y: 180,
        },
      );
      u.squad = "commander";
      const hp =
        r.id === "dark"
          ? 6000 + (session.elite ? 1800 : 0)
          : 900 +
            [
              "greenwood",
              "shadow",
              "iron",
              "desert",
              "frost",
              "volcano",
              "arcane",
            ].indexOf(r.id) *
              300 +
            (session.elite ? 900 : 0);
      u.hp = hp;
      w.enemyArmy.data.units.push(u);
      m.boss = {
        id: r.id,
        unitId: u.id,
        hp,
        maxHp: hp,
        armor: BOSS_CONFIG[r.id].armor,
        phase: 1,
        next: w.data.options.preparation * 1000 + 15000,
        warning: null,
        weakUntil: 0,
        summons: 0,
        repairs: 0,
        revealedUntil: 0,
        shield: "fire",
      };
    }
    this.state = m.boss;
    if (u) {
      u.maxHpOverride = this.state.maxHp;
      u.hp = this.state.hp;
      u.bossName = r.boss;
    }
    const filter = w.army.combat.damageFilter;
    w.army.combat.damageFilter = (target, n, source, sphere) => {
      n = filter(target, n, source, sphere);
      if (target.id !== this.state.unitId) return n;
      const element = sphere
          ? game.magic?.balls?.state(game.magic.contactBall)?.type
          : "steel",
        siege = element === "cannon" || source?.kind === "catapult";
      const b = this.state;
      if (b.id === "iron" && b.armor > 0) {
        b.armor = Math.max(0, b.armor - n * (siege ? 2 : 1));
        if (!b.armor) b.weakUntil = game.time + 10000;
        return n * 0.15;
      }
      if (game.time < b.weakUntil) return n * 1.3;
      if (b.id === "desert") return n * 0.5;
      if (b.id === "volcano")
        return (
          n * (element === "fire" ? 0.4 : element === "ice" || siege ? 1.4 : 1)
        );
      if (b.id === "frost" && element === "fire") return n * 1.4;
      if (b.id === "arcane") return n * (element === b.shield ? 0.45 : 1);
      if (b.id === "shadow" && game.time >= b.revealedUntil) return n * 0.7;
      if (b.id === "dark") {
        if (b.phase === 1 && w.protection("enemy") > 0) return n * 0.5;
        if (b.phase === 3 && element === b.shield) return n * 0.5;
        if (
          b.phase === 4 &&
          (session.mission.deviceHealth["env-crystal"] ?? 3) > 0
        )
          return n * 0.6;
      }
      return n;
    };
  }
  get unit() {
    return this.game.war!.enemyArmy.data.units.find(
      (u) => u.id === this.state.unitId,
    );
  }
  private summon(kind: UnitKind, count: number, clone = false) {
    const w = this.game.war!,
      b = this.state;
    for (let i = 0; i < count && b.summons < 12; i++) {
      if (!w.enemy.resources.transact(unitConfig(kind).cost)) break;
      const p = w.enemyArmy.navigation.closest({
        x: i % 2 ? 450 : 120,
        y: 240,
      });
      if (!p) break;
      const u = w.enemyArmy.createUnit(kind, "enemy", p);
      u.squad = "deployed";
      if (clone) {
        u.hp *= 0.35;
        u.maxHpOverride = u.hp;
        u.bossName = "SHADOW ECHO";
      }
      w.enemyArmy.data.units.push(u);
      b.summons++;
    }
  }
  private attack(x: number, y: number, damage: number, radius: number) {
    const g = this.game,
      w = g.war!;
    for (const u of w.army.living.filter(
      (u) => Math.hypot(u.x - x, u.y - y) < radius,
    ))
      w.army.combat.hurt(u, damage, this.unit);
    for (const s of w.data.structures.filter(
      (s) =>
        s.side === "ally" && s.hp > 0 && Math.hypot(s.x - x, s.y - y) < radius,
    ))
      w.damageStructure(s.id, damage, "unit", "enemy");
    g.enemyMagic?.effect(x, y, radius, "warning");
  }
  private resolve() {
    const b = this.state,
      w = this.game.war!,
      g = this.game,
      warning = b.warning!;
    b.warning = null;
    const kind = warning.kind;
    if (kind === "cavalry") {
      this.summon("knight", 2);
      this.attack(warning.x, warning.y, 20, 65);
    }
    if (kind === "teleport") {
      this.summon("knight", 2, true);
      const p = w.enemyArmy.navigation.closest(warning);
      if (
        p &&
        this.unit &&
        !g.physics.balls.some(
          (ball) =>
            Math.hypot(ball.position.x - p.x, ball.position.y - p.y) < 35,
        )
      ) {
        Object.assign(this.unit, { x: p.x, y: p.y, path: [], pathAt: 0 });
      }
      b.revealedUntil = g.time + 4000;
    }
    if (kind === "shockwave") {
      this.attack(warning.x, warning.y, 35, 105);
      if (b.armor === 0 && b.repairs < 2 && b.hp < b.maxHp * 0.7) {
        b.armor = 120;
        b.repairs++;
      }
    }
    if (kind === "sun") {
      this.summon("guard", 2);
      if (w.enemy.resources.transact({ mana: 8 }))
        this.attack(warning.x, warning.y, 30, 90);
    }
    if (kind === "icewall") {
      for (const x of [120, 450]) w.queueBuild("enemy", "wall", { x, y: 280 });
      this.summon("guard", 1);
      if (w.enemy.resources.transact({ mana: 8 }))
        for (const u of w.army.living.filter(
          (u) => Math.hypot(u.x - warning.x, u.y - warning.y) < 90,
        ))
          g.enemyMagic?.status.add(u.id, "chill", 3500);
    }
    if (kind === "breath") {
      if (w.enemy.resources.transact({ mana: 6 }))
        this.attack(warning.x, warning.y, 42, 95);
      b.weakUntil = g.time + 7000;
    }
    if (kind === "arcane") {
      b.shield = ["fire", "ice", "thunder"][Math.floor(g.time / 16000) % 3];
      this.summon("mage", 1);
      if (w.enemy.resources.transact({ mana: 10 }))
        this.attack(warning.x, warning.y, 32, 85);
    }
    if (kind === "imperial") {
      if (b.phase === 2) this.summon("guard", 3);
      else if (b.phase === 3) {
        b.shield = ["fire", "ice", "thunder"][Math.floor(g.time / 16000) % 3];
        this.summon("mage", 1);
      } else if (b.phase === 4) {
        for (const x of [120, 450])
          w.queueBuild("enemy", "wall", { x, y: 280 });
      } else this.attack(warning.x, warning.y, b.phase === 5 ? 45 : 25, 90);
    }
  }
  tick() {
    const g = this.game,
      w = g.war!,
      b = this.state,
      u = this.unit;
    b.hp = u?.hp ?? 0;
    if (
      !u ||
      u.hp <= 0 ||
      w.preparing ||
      w.data.result ||
      g.time < this.nextThink
    )
      return;
    this.nextThink = g.time + 200;
    if (b.id === "dark") {
      const phase = Math.min(5, 1 + Math.floor((1 - b.hp / b.maxHp) * 5));
      if (phase > b.phase) {
        b.phase = phase;
        b.warning = null;
        b.next = g.time + 6000;
        g.magic?.charge(10, 20, 20);
        w.notice("bossPhase", `DARK EMPEROR · PHASE ${phase} · 전장 장치 변경`);
      }
    } else b.phase = b.hp < b.maxHp * 0.35 ? 3 : b.hp < b.maxHp * 0.7 ? 2 : 1;
    if (b.warning && g.time >= b.warning.at) this.resolve();
    if (!b.warning && g.time >= b.next) {
      b.next = g.time + BOSS_CONFIG[b.id].interval * 1000;
      const target = w.army.living[0] ?? w.castle("ally"),
        p =
          b.id === "teleport"
            ? { x: u.x < 300 ? 450 : 120, y: 320 }
            : b.id === "iron"
              ? u
              : target;
      b.warning = {
        x: p.x,
        y: p.y,
        at: g.time + 3000,
        kind: BOSS_CONFIG[b.id].pattern,
      };
      if (b.id === "volcano") b.weakUntil = g.time + 3000;
      w.notice(
        "bossWarning",
        `${region(b.id).boss} · ${b.warning.kind} · 3초 후 표시 영역 공격`,
      );
    }
  }
}
