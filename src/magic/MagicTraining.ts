import type { GameStateManager } from "../core/GameStateManager";
import { WarSaveManager } from "../war/WarSaveManager";
import { MAGIC_RESEARCH } from "../config/magic";
import { freshProduction } from "../building/types";
export const MAGIC_LESSONS = [
  "속성 전환 · 화염과 냉기 타격",
  "연쇄 번개 · 4명 연결",
  "공성구 · 적 시설 타격",
  "지원 마법 · 아군 회복",
  "멀티볼 · 공 3개 조작",
  "CORE STORM · 공 10개 조작",
];
/** No persistent battle storage: completion records are the only exported data. */
export class MagicTraining {
  scenario = -1;
  private restore?: () => void;
  constructor(readonly game: GameStateManager) {}
  start(index: number) {
    if (
      index < 0 ||
      index > 5 ||
      this.game.testBall ||
      this.game.builder?.active
    )
      return false;
    this.exit();
    this.restore = this.game.suspendSession();
    const g = this.game;
    g.startWar(
      { type: "siege", preparation: 60, tutorial: false },
      new WarSaveManager({ getItem: () => null, setItem: () => {} }),
    );
    this.scenario = index;
    g.sandboxKind = "magic";
    g.sandboxExit = () => this.exit();
    g.time = g.war!.data.time = 61000;
    g.economy!.data.rank = 5;
    g.war!.ai.update = () => {};
    g.enemyMagic = undefined;
    g.war!.damageFilter = (s, n) => g.magic!.damageFilter(s, n);
    Object.assign(g.economy!.data.resources, {
      wood: 4000,
      stone: 4000,
      gold: 4000,
      mana: 400,
      food: 4000,
      energy: 100,
    });
    for (const [i, type] of [
      ...new Set(MAGIC_RESEARCH.map((r) => r.facility)),
    ].entries())
      g.economy!.data.building!.buildings.push({
        id: `building-training-${i}`,
        type,
        x: 85 + i * 65,
        y: 510,
        angle: 0,
        level: 1,
        paid: {},
        production: freshProduction(),
        charge: 0,
        lastHit: -10000,
        readyAt: 0,
      });
    g.war!.syncStructures();
    g.war!.onLayout?.();
    const m = g.magic!;
    m.data.research = Object.fromEntries(MAGIC_RESEARCH.map((r) => [r.id, 3]));
    m.data.research.multiball = 1;
    m.data.charge = m.data.multiCharge = m.data.stormCharge = 100;
    m.data.loadout = {
      balls: ["fire", "ice", "thunder", "cannon"],
      spells:
        index === 3
          ? ["holyLight", "royalShield"]
          : ["chainLightning", "fireStorm"],
      multi: "steel",
      storm: "core",
      autoAim: true,
    };
    g.army!.data.units = [];
    g.war!.enemyArmy.data.units = [];
    for (let i = 0; i < 8; i++) {
      const a = index === 3 ? g.army! : g.war!.enemyArmy;
      const u = a.createUnit("guard", index === 3 ? "ally" : "enemy", {
        x: 210 + i * 22,
        y: index === 3 ? 540 : 360,
      });
      u.squad = "deployed";
      if (index === 3) u.hp *= 0.4;
      a.data.units.push(u);
    }
    g.war!.tick(0.01, g.time);
    g.setState("playing");
    return true;
  }
  get complete() {
    const s = this.game.magic?.data.stats;
    if (!s || this.scenario < 0) return false;
    return [
      !!s.damage.fire && !!s.damage.ice,
      this.game.magic!.data.achievements.includes("CHAIN MASTER"),
      !!s.damage.cannon,
      s.healing >= 30,
      s.maxBalls >= 3,
      s.maxBalls === 10,
    ][this.scenario];
  }
  exit() {
    if (!this.restore) return;
    const done = this.complete,
      index = this.scenario,
      restore = this.restore;
    this.restore = undefined;
    this.scenario = -1;
    restore();
    if (done) {
      try {
        const key = "kingdom-pinball:magic-training:v1",
          old = JSON.parse(localStorage.getItem(key) ?? "[]");
        localStorage.setItem(
          key,
          JSON.stringify([
            ...new Set([...(Array.isArray(old) ? old : []), index]),
          ]),
        );
      } catch {
        /* Storage unavailable; the original session remains intact. */
      }
    }
  }
}
