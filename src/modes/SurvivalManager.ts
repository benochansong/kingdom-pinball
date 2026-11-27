import type { ModeSession } from "./types";
import type { ModeBattle } from "./ModeBattle";
import type { UnitKind } from "../army/types";
import { SeededRandom } from "./SeededRandom";
export function survivalWave(number: number, seed: number) {
  const rng = new SeededRandom(seed ^ Math.imul(number, 2654435761));
  const pool: UnitKind[] =
    number <= 5
      ? ["swordsman", "spearman"]
      : number <= 10
        ? ["swordsman", "spearman", "archer", "knight"]
        : number <= 15
          ? ["guard", "spearman", "archer", "knight"]
          : ["guard", "spearman", "archer", "knight", "mage", "catapult"];
  const count = Math.min(100, 4 + Math.floor(number * 1.8)),
    units = Array.from({ length: count }, () => rng.pick(pool));
  let boss = "";
  if (number % 10 === 0)
    boss =
      number >= 50
        ? "dark"
        : number === 40
          ? "arcane"
          : number === 30
            ? "volcano"
            : number === 20
              ? "frost"
              : "iron";
  return {
    units,
    boss,
    elite: number % 5 === 0,
    rank: Math.min(5, 1 + Math.floor(number / 15)),
    lane: rng.pick(["left", "center", "right"] as const),
    formation: rng.pick([
      "standard",
      "shield",
      "spear",
      "assault",
      "ranged",
      "siege",
    ] as const),
  };
}
export interface SurvivalHost {
  session: ModeSession;
  battle: ModeBattle;
  offerReward(): void;
  persist(): void;
}
/** At most one unfinished wave; excess troops stay in a bounded spawn queue. */
export class SurvivalManager {
  constructor(readonly host: SurvivalHost) {}
  get session() {
    return this.host.session;
  }
  get g() {
    return this.host.battle.game;
  }
  get preview() {
    return survivalWave(
      this.session.wave.number + 1,
      this.session.options.seed,
    );
  }
  attach() {
    this.g.war!.ai.update = () => {};
  }
  initialize() {
    const w = this.g.war!;
    this.attach();
    w.enemyArmy.data.queues = {};
    w.enemyArmy.data.units = [];
    w.enemyArmy.onNotice = () => {};
    this.session.wave.readyAt =
      this.g.time + this.session.options.preparation * 1000;
  }
  startNext() {
    const s = this.session,
      wave = s.wave,
      w = this.g.war!;
    if (wave.phase !== "preparation" || s.status !== "playing") return false;
    wave.number++;
    const next = survivalWave(wave.number, s.options.seed);
    wave.pending = [...next.units];
    wave.ids = [];
    wave.phase = "active";
    wave.nextSpawn = this.g.time;
    wave.bossRegion = next.boss;
    w.data.options.preparation = 0;
    w.enemyArmy.data.formation = next.formation;
    w.data.ai.lane = next.lane;
    w.data.ai.strategy = wave.number >= 16 ? "siege" : "assault";
    if (next.boss) {
      const boss = this.host.battle.summonBoss(next.boss);
      wave.ids.push(boss.state.unitId);
    } else if (next.elite) {
      const u = this.host.battle.spawn("knight", 1, "enemy", next.rank)[0];
      if (u) {
        u.hp *= 1.6;
        u.maxHpOverride = u.hp;
        u.squad = "commander";
        u.bossName = wave.number % 10 === 5 ? "ELITE COMMANDER" : "COMMANDER";
        wave.ids.push(u.id);
      }
    }
    this.host.persist();
    return true;
  }
  tick() {
    const s = this.session,
      wave = s.wave,
      w = this.g.war!;
    if (s.status !== "playing") return;
    if (wave.phase === "preparation") {
      if (this.g.time >= wave.readyAt) this.startNext();
      return;
    }
    if (wave.phase !== "active") return;
    if (
      wave.pending.length &&
      this.g.time >= wave.nextSpawn &&
      w.enemyArmy.living.length < 60
    ) {
      const kind = wave.pending[0],
        u = this.host.battle.spawn(
          kind,
          1,
          "enemy",
          Math.min(5, 1 + Math.floor(wave.number / 15)),
        )[0];
      if (u) {
        wave.pending.shift();
        wave.ids.push(u.id);
        wave.nextSpawn = this.g.time + 700;
      }
    }
    const alive = w.enemyArmy.living.some((u) => wave.ids.includes(u.id));
    if (!wave.pending.length && !alive) {
      if (wave.bossRegion) {
        wave.bosses++;
        s.stats.bosses++;
      }
      this.host.battle.clearBoss();
      wave.phase = "reward";
      this.host.offerReward();
    }
  }
  afterReward() {
    const wave = this.session.wave;
    wave.phase = "preparation";
    wave.readyAt = this.g.time + 20000;
    wave.ids = [];
    wave.pending = [];
    this.g.war!.enemyArmy.data.units = this.g.war!.enemyArmy.data.units.filter(
      (u) => u.hp > 0,
    );
    this.host.persist();
  }
}
