import { applyModeLoadout } from "./ModeLoadout";
import { COSMETICS, TITLE_GOALS } from "../config/profile";
import { CustomWarManager, applyWarVariant } from "./CustomWarManager";
import { TableCreator, validateTable } from "./TableCreator";
import { CustomTableManager } from "./CustomTableManager";
import { PuzzleManager } from "./PuzzleManager";
import { RogueRunManager } from "./RogueRunManager";
import { challenge } from "./ChallengeManager";
import type { GameStateManager } from "../core/GameStateManager";
import type {
  ModeId,
  ModeOptions,
  ModeSession,
  ModeBucket,
  ModeRecord,
} from "./types";
import { ModeSaveManager, freshMode, sanitizeOptions } from "./ModeSaveManager";
import { ModeBattle } from "./ModeBattle";
import { SurvivalManager } from "./SurvivalManager";
import { SandboxManager } from "./SandboxManager";
import { SeededRandom } from "./SeededRandom";
import { MODE_REWARDS } from "../config/modes";
import { ELEMENTS } from "../config/magic";
/** Orchestrates one active ruleset and one engine. Saves never touch campaign/legacy keys. */
export class GameModeManager {
  speed = 1;
  session!: ModeSession;
  bucket: ModeBucket = { version: 1, session: null, records: [] };
  battle!: ModeBattle;
  customWar?: CustomWarManager;
  customTable?: CustomTableManager;
  puzzle?: PuzzleManager;
  rogue?: RogueRunManager;
  survival?: SurvivalManager;
  sandbox?: SandboxManager;
  onChange = () => {};
  private saving = false;
  private nextSave = 0;
  readonly profile;
  readonly creator;
  constructor(
    readonly game: GameStateManager,
    readonly saves = new ModeSaveManager(),
  ) {
    this.profile = saves.loadProfile();
    this.creator = new TableCreator(saves.storage);
    this.refreshCosmetics();
  }
  get active() {
    return !!this.battle?.active;
  }
  get view() {
    return this.battle;
  }
  start(kind: ModeId, options: ModeOptions) {
    this.leave();
    this.bucket = this.saves.load(kind);
    const daily =
      kind === "daily" || kind === "weekly" ? challenge(kind) : null;
    this.session = freshMode(
      kind,
      sanitizeOptions(
        daily?.options ??
          (kind === "customWar" || kind === "spectator"
            ? applyWarVariant(options)
            : options),
      ),
    );
    if (daily) {
      this.session.challengeId = daily.id;
      this.session.goal = daily.goal;
      this.session.reason = daily.description;
    }
    if (kind === "customTable")
      this.session.table = structuredClone(this.creator.selected);
    this.bucket.session = this.session;
    this.open(true);
  }
  resume(kind: ModeId) {
    this.leave();
    this.bucket = this.saves.load(kind);
    if (!this.bucket.session) return false;
    this.session = this.bucket.session;
    if (kind === "puzzle") {
      const options = this.session.options;
      this.start(kind, options);
      return true;
    }
    if (["complete", "failed"].includes(this.session.status)) return false;
    this.open(false);
    return true;
  }
  private open(fresh: boolean) {
    this.battle = new ModeBattle(this);
    this.battle.open();
    this.attachEffects();
    if (fresh) this.battle.initialize();
    applyModeLoadout(this.battle, fresh);
    const s = this.session;
    if (s.kind === "survival") {
      this.survival = new SurvivalManager(this);
      if (fresh) this.survival.initialize();
      else this.survival.attach();
    }
    if (s.kind === "sandbox") {
      this.sandbox = new SandboxManager(this.battle);
      this.sandbox.attach();
      if (fresh) this.sandbox.initialize();
    }
    if (s.kind === "bossRush") {
      this.game.war!.ai.update = () => {};
      if (fresh) {
        this.battle.magicKit();
        this.game.war!.enemyArmy.data.units = [];
        this.game.war!.enemyArmy.data.queues = {};
        if (s.options.variant === "random")
          s.bossOrder = new SeededRandom(s.options.seed).shuffle(s.bossOrder);
        this.nextBoss();
      }
    }
    if (s.kind === "customTable" && s.table) {
      this.customTable = new CustomTableManager(this, s.table, fresh);
      if (s.table.rule === "survival") {
        this.survival = new SurvivalManager(this);
        if (fresh) this.survival.initialize();
        else this.survival.attach();
      }
    }
    if (s.kind === "puzzle") this.puzzle = new PuzzleManager(this);
    if (s.kind === "roguelike") {
      this.rogue = new RogueRunManager(this);
      this.rogue.attach();
      if (fresh) this.rogue.initialize();
    }
    if (["daily", "weekly"].includes(s.kind) && fresh) {
      const w = this.game.war!;
      if (["magic", "multiball"].includes(s.options.variant)) {
        this.battle.magicKit(true);
        w.player.data.resources.mana = 300;
        this.game.magic!.data.charge = 100;
        this.game.magic!.data.multiCharge = 100;
      }
      if (s.options.variant === "boss")
        this.battle.summonBoss(s.options.region);
    }
    if (s.kind === "customWar" || s.kind === "spectator") {
      this.customWar = new CustomWarManager(this);
      if (fresh) this.customWar.initialize();
    }
    if (!fresh) this.battle.restoreBoss();
    if (s.status !== "playing") this.game.pause();
    this.persist();
    this.onChange();
  }
  private attachEffects() {
    const w = this.game.war!,
      s = this.session;
    const prod = w.player.productionBonus.bind(w.player);
    w.player.productionBonus = (r) =>
      prod(r) * (1 + (s.upgrades.production ?? 0) * 0.05);
    const filter = w.army.combat.damageFilter;
    w.army.combat.damageFilter = (u, n, source, sphere) =>
      filter(
        u,
        n *
          (u.side === "enemy"
            ? 1 + (s.upgrades.attack ?? 0) * 0.05
            : 1 - (s.upgrades.defense ?? 0) * 0.04),
        source,
        sphere,
      );
    const damage = w.damageStructure.bind(w);
    w.damageStructure = (id, n, source, side) => {
      const target = w.structure(id);
      const dealt = damage(id, n, source, side);
      if (target?.castle && target.side === "ally") s.stats.damage += dealt;
      return dealt;
    };
  }
  tick(_dt: number) {
    if (!this.active || this.session.status !== "playing") return;
    const s = this.session,
      w = this.game.war!;
    s.stats.kills = w.data.stats.kills;
    s.stats.maxPower = Math.max(s.stats.maxPower, w.army.power);
    s.stats.combo = Math.max(s.stats.combo, this.game.score.combo.max);
    s.stats.produced = w.player.resources.totalProduction;
    s.stats.units = Object.values(w.army.data.stats.produced).reduce(
      (a, b) => a + b,
      0,
    );
    s.stats.multiballs = this.game.magic!.data.stats.multiballs;
    s.stats.storms = this.game.magic!.data.stats.storms;
    s.stats.spells = { ...this.game.magic!.data.stats.spells };
    s.score = this.game.score.score;
    this.sandbox?.tick();
    this.survival?.tick();
    this.rogue?.tick();
    this.puzzle?.tick(_dt);
    this.customTable?.tick();
    this.customWar?.tick();

    if (
      s.kind === "bossRush" &&
      this.battle.boss &&
      this.battle.boss.state.hp <= 0
    ) {
      s.stats.bosses++;
      s.bossTimes.push((s.time - s.legTime) / 1000);
      s.bossIndex++;
      this.battle.clearBoss();
      if (s.bossIndex >= s.bossOrder.length)
        this.finish(true, "여덟 왕국의 보스를 모두 격파했습니다.");
      else this.offerReward();
    }
    if (["daily", "weekly"].includes(s.kind)) {
      const v = s.options.variant,
        progress =
          v === "economy"
            ? s.stats.produced
            : v === "magic"
              ? Object.values(s.stats.spells).reduce((a, b) => a + b, 0)
              : v === "multiball"
                ? s.stats.multiballs
                : v === "boss"
                  ? this.battle.boss?.state.hp === 0
                    ? 1
                    : 0
                  : v === "fortress"
                    ? s.time / 1000
                    : w.data.stats.destroyed;
      s.flags.progress = progress;
      if (progress >= s.goal) this.finish(true, s.reason);
      else if (s.time >= s.options.limit * 1000)
        this.finish(false, "제한 시간이 끝났습니다.");
    }
    if (this.game.time >= this.nextSave) {
      this.nextSave = this.game.time + 5000;
      this.game.checkpoint();
    }
  }
  hit(id: string) {
    this.rogue?.hit();
    this.puzzle?.hit(id);
    this.customTable?.hit(id);
  }
  loss() {
    if (this.customTable) return this.customTable.loss();
    if (this.puzzle) return this.puzzle.loss();
    if (
      this.rogue &&
      (this.session.flags.saves ?? 0) < (this.session.upgrades.safety ?? 0)
    ) {
      this.session.flags.saves = (this.session.flags.saves ?? 0) + 1;
      this.game.physics.spawn();
      return true;
    }
    if (
      this.session.kind === "sandbox" &&
      !this.session.options.sandbox.endConditions
    ) {
      this.game.physics.spawn();
      return true;
    }
    if (this.session.options.variant === "oneCore") {
      this.finish(false, "단 하나의 코어를 잃었습니다.");
      return true;
    }
    return false;
  }
  ended() {
    const result = this.game.war?.data.result;
    if (result) this.finish(result.outcome === "victory", result.reason);
  }
  offerReward() {
    const s = this.session;
    if (s.status === "reward") return;
    s.status = "reward";
    s.rewardId = `${s.id}:${this.survival ? s.wave.number : s.bossIndex}`;
    const rng = new SeededRandom(s.seedState);
    s.rewards = rng
      .shuffle(
        MODE_REWARDS.filter(
          (r) =>
            !["production", "attack", "defense"].includes(r.id) ||
            (s.upgrades[r.id] ?? 0) < 6,
        ),
      )
      .slice(0, 3)
      .map((r) => r.id);
    s.seedState = rng.state;
    this.game.pause();
    this.persist();
    this.onChange();
  }
  chooseReward(id: string) {
    const s = this.session;
    if (
      !this.active ||
      s.status !== "reward" ||
      !s.rewards.includes(id) ||
      s.claimed.includes(s.rewardId)
    )
      return false;
    s.claimed.push(s.rewardId);
    s.claimed = s.claimed.slice(-200);
    s.rewards = [];
    if (this.rogue) {
      this.rogue.reward(id);
      this.persist();
      this.onChange();
      return true;
    }
    this.applyReward(id);
    s.status = "playing";
    if (this.survival) this.survival.afterReward();
    else if (s.kind === "bossRush") this.nextBoss();
    this.persist();
    this.game.resume();
    this.onChange();
    return true;
  }
  private applyReward(id: string) {
    const g = this.game,
      w = g.war!,
      r = w.player.resources,
      c = w.castle("ally");
    switch (id) {
      case "materials":
        r.reward({ wood: 90, stone: 70 });
        break;
      case "gold":
        r.reward({ gold: 120 });
        break;
      case "food":
        r.reward({ food: 150 });
        break;
      case "castle":
        c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.25);
        break;
      case "walls":
        for (const x of w.data.structures)
          if (x.side === "ally" && x.defense && x.hp > 0)
            x.hp = Math.min(x.maxHp, x.hp + x.maxHp * 0.35);
        break;
      case "mana":
        r.reward({ mana: 35 });
        break;
      case "energy":
        r.reward({ energy: 50 });
        break;
      case "reinforcements":
        this.battle.spawn("swordsman", 4, "ally");
        break;
      case "charge":
        g.magic!.charge(50);
        break;
      case "multi":
        g.magic!.charge(0, 70, 0);
        break;
      case "element": {
        const e = ELEMENTS.find(
          (e) => e.id !== "steel" && !g.magic!.data.research[e.id],
        );
        if (e) g.magic!.data.research[e.id] = 1;
        break;
      }
      default:
        this.session.upgrades[id] = Math.min(
          6,
          (this.session.upgrades[id] ?? 0) + 1,
        );
    }
  }
  private nextBoss() {
    const s = this.session;
    if (s.options.variant === "elemental") this.battle.magicKit(true);
    if (s.options.variant === "siege") {
      this.battle.build("siegeWorkshop", true);
      this.battle.spawn("catapult", 2, "ally");
    }
    this.game.war!.data.options.preparation = 0;
    s.legTime = s.time;
    this.battle.setRegion(s.bossOrder[s.bossIndex]);
    const boss = this.battle.summonBoss(s.bossOrder[s.bossIndex]);
    if (s.options.variant === "legendary") {
      boss.state.next = this.game.time + 10000;
    }
    if (s.options.variant === "elemental") {
      boss.state.weakUntil = this.game.time + 8000;
    }
    this.game.war!.enemyArmy.data.units =
      this.game.war!.enemyArmy.data.units.filter((u) => u.hp > 0);
  }
  finish(won: boolean, reason: string) {
    const s = this.session;
    if (!s || s.recorded) return;
    s.status = won ? "complete" : "failed";
    s.reason = reason;
    s.recorded = true;
    this.game.pause();
    const hp = this.game.war
      ? this.game.war.castle("ally").hp / this.game.war.castle("ally").maxHp
      : 1;
    const record: ModeRecord = {
      id: s.id,
      mode: s.kind,
      variant: s.options.variant,
      region: s.options.region,
      difficulty: s.options.difficulty,
      won,
      seconds: Math.floor(s.time / 1000),
      score: s.score,
      wave: s.wave.number,
      bosses: s.stats.bosses,
      grade:
        s.kind === "puzzle" && won
          ? "★".repeat(s.flags.stars ?? 1)
          : won
            ? hp >= 0.8
              ? "♛♛♛♛♛"
              : hp >= 0.6
                ? "♛♛♛♛"
                : hp >= 0.4
                  ? "♛♛♛"
                  : "♛♛"
            : "♛",
      stats: structuredClone(s.stats),
      seed: s.options.seed,
      challengeId: s.challengeId,
      at: new Date().toISOString(),
      competitive: s.competitive,
    };
    if (!this.bucket.records.some((r) => r.id === s.id))
      this.bucket.records.push(record);
    this.bucket.records = this.bucket.records.slice(-30);
    this.persist();
    this.recordProfile(record);
    this.onChange();
  }
  private recordProfile(r: ModeRecord) {
    const p = this.profile;
    if (p.seen.includes(r.id)) return;
    p.seen.push(r.id);
    p.seen = p.seen.slice(-1000);
    p.runs++;
    p.seconds += r.seconds;
    p.lastMode = r.mode;
    p.styles[r.mode] = (p.styles[r.mode] ?? 0) + 1;
    if (r.competitive) {
      const unlock = (id: string, title: string) => {
        if (!p.achievements.includes(id)) p.achievements.push(id);
        if (!p.titles.includes(title)) p.titles.push(title);
      };
      if (r.mode === "survival")
        for (const n of [10, 25, 50])
          if (r.wave > n)
            unlock(
              `survival-${n}`,
              n === 50
                ? "ETERNAL GUARDIAN"
                : n === 25
                  ? "FORTRESS KEEPER"
                  : "WAVE DEFENDER",
            );
      if (r.mode === "bossRush" && r.bosses)
        unlock("boss-first", "BOSS HUNTER");
      if (r.mode === "bossRush" && r.won) unlock("boss-all", "CROWN BREAKER");
      if (r.mode === "bossRush" && r.won && r.variant === "legendary")
        unlock("boss-legendary", "LEGEND SLAYER");
      if (r.mode === "puzzle" && r.won) {
        const id = this.session.options.puzzle;
        p.styles["puzzle-stars-" + id] = Math.max(
          p.styles["puzzle-stars-" + id] ?? 0,
          this.session.flags.stars ?? 1,
        );
        const stars = Object.entries(p.styles).filter(([k]) =>
            k.startsWith("puzzle-stars-"),
          ),
          count = stars.length,
          total = stars.reduce((a, [, v]) => a + v, 0);
        if (count >= 5) unlock("puzzle-5", "RUNE SEEKER");
        if (count >= 15) unlock("puzzle-15", "PUZZLE SCHOLAR");
        if (total >= 90) unlock("puzzle-90", "PERFECT MIND");
      }
      if (r.mode === "roguelike") {
        if (r.won) unlock("rogue-final", "REALM WALKER");
        if (this.session.nodes.some((n) => n.complete))
          unlock("rogue-first", "PATHFINDER");
        if (this.session.relics.length) unlock("rogue-relic", "PATHFINDER");
      }
      if (r.mode === "daily" && r.won) unlock("daily-first", "DAWN CHALLENGER");
      if (r.mode === "weekly" && r.won)
        unlock("weekly-first", "DAWN CHALLENGER");
    }
    if (r.mode === "customTable" && r.won) {
      for (const id of [
        "creator-first",
        "creator-goal",
        ...(Object.keys(this.creator.verified).length >= 5
          ? ["creator-five"]
          : []),
      ])
        if (!p.achievements.includes(id)) p.achievements.push(id);
      if (!p.titles.includes("TABLE ARCHITECT"))
        p.titles.push("TABLE ARCHITECT");
    }
    this.refreshCosmetics();
    this.saves.saveProfile(p);
  }
  refreshCosmetics() {
    for (const c of COSMETICS)
      if (
        this.profile.achievements.length >= c.required &&
        !this.profile.cosmetics.includes(c.id)
      )
        this.profile.cosmetics.push(c.id);
    for (const c of COSMETICS)
      if (c.required === 0 && !this.profile.equipped[c.category])
        this.profile.equipped[c.category] = c.id;
    for (const [id, title] of TITLE_GOALS)
      if (
        this.profile.achievements.includes(id) &&
        !this.profile.titles.includes(title)
      )
        this.profile.titles.push(title);
  }
  persist() {
    if (this.saving || !this.session) return;
    this.saving = true;
    try {
      this.bucket.session = this.session;
      this.saves.save(this.session.kind, this.bucket);
    } finally {
      this.saving = false;
    }
  }
  leave() {
    if (this.active) {
      this.game.checkpoint();
      this.game.menu();
    }
    this.survival = undefined;
    this.sandbox = undefined;
    this.rogue = undefined;
    this.puzzle = undefined;
    this.customTable = undefined;
    this.customWar = undefined;
    this.speed = 1;
  }
  saveProject(slot: number, name: string, overwrite = false) {
    if (!this.active || this.session.kind !== "sandbox")
      return "샌드박스를 먼저 시작하세요.";
    this.game.checkpoint();
    return this.saves.saveProject(slot, this.session, name, overwrite);
  }
  loadProject(slot: number) {
    const p = this.saves.project(slot);
    if (!p) return false;
    this.leave();
    this.bucket = this.saves.load("sandbox");
    this.session = p.session;
    this.bucket.session = this.session;
    this.open(false);
    return true;
  }
  testTable(formal = false) {
    const result = validateTable(this.creator.selected);
    if (result.errors.length) return result.errors.join(" · ");
    if (formal && !this.creator.isVerified())
      return "먼저 직접 테스트에서 목표를 달성하세요.";
    const options = sanitizeOptions({
      region: this.creator.selected.region,
      variant: formal ? "custom" : "test",
      preparation: 0,
    });
    this.start("customTable", options);
    return null;
  }
  abandon() {
    this.finish(false, "플레이어가 이 도전을 종료했습니다.");
  }
}
