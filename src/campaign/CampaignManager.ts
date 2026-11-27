import Matter from "matter-js";
import { CampaignGrowth } from "./CampaignGrowth";
import { BossManager } from "./BossManager";
import { RegionalPhysicsSystem } from "./RegionalPhysicsSystem";
import type { GameStateManager } from "../core/GameStateManager";
import {
  CampaignSaveManager,
  freshCampaign,
  freshMission,
} from "./CampaignSaveManager";
import { freshWar } from "../war/WarManager";
import { WarSaveManager, WAR_KEY } from "../war/WarSaveManager";
import {
  STAGES,
  stage,
  region,
  CAMPAIGN_DIFFICULTIES,
} from "../config/campaign";
import { campaignAchievements, stageLocked } from "./CampaignProgression";
import type {
  CampaignProfile,
  CampaignDifficulty,
  CampaignSession,
  SessionExtension,
} from "./types";
import type { WarResult } from "../war/types";
export class CampaignManager {
  readonly growth = new CampaignGrowth(this);
  terrain?: RegionalPhysicsSystem;
  boss?: BossManager;
  profile: CampaignProfile | null = null;
  slot = 0;
  onChange: () => void = () => {};
  private extension?: SessionExtension;
  private unsub?: () => void;
  private accumulator = 0;
  constructor(
    readonly game: GameStateManager,
    readonly save = new CampaignSaveManager(),
  ) {}
  get active() {
    return !!this.extension && this.game.sessionExtension === this.extension;
  }
  get session() {
    return this.profile?.session ?? null;
  }
  create(
    slot: number,
    name: string,
    difficulty: CampaignDifficulty,
    overwrite = false,
  ) {
    if (
      slot < 0 ||
      slot > 2 ||
      !Object.hasOwn(CAMPAIGN_DIFFICULTIES, difficulty)
    )
      return "잘못된 캠페인 설정입니다.";
    if (this.save.occupied(slot) && !overwrite)
      return "기존 슬롯 덮어쓰기 확인이 필요합니다.";
    this.leave();
    this.save.acceptCurrent(slot);
    this.slot = slot;
    this.profile = freshCampaign(name, difficulty);
    this.persist();
    return null;
  }
  load(slot: number) {
    this.leave();
    const p = this.save.load(slot);
    if (!p) return false;
    this.slot = slot;
    this.profile = p;
    this.onChange();
    return true;
  }
  persist() {
    if (this.profile && !this.save.save(this.slot, this.profile))
      this.game.events.emit("message", {
        text: this.save.lastError,
        tone: "warning",
      });
  }
  handleStorageConflict(key: string | null) {
    if (!this.profile || key !== "kingdom-pinball:campaign:v1:" + this.slot)
      return false;
    this.save.block(this.slot);
    if (this.active) this.game.pause();
    this.game.events.emit("message", {
      text: "다른 창에서 캠페인을 변경했습니다. 슬롯을 다시 불러오세요.",
      tone: "warning",
    });
    return true;
  }
  begin(
    id: string,
    difficulty = this.profile?.difficulty ?? "normal",
    elite = false,
    event = false,
  ): string | null {
    const p = this.profile;
    if (!p) return "캠페인을 선택하세요.";
    const reason = stageLocked(p, id);
    if (reason) return reason;
    if (elite && !p.completed) return "대륙 정복 후 정예 재전이 해금됩니다.";
    if (this.active) return "현재 전투에서 월드맵으로 복귀하세요.";
    const s = stage(id),
      r = region(s.region),
      d = CAMPAIGN_DIFFICULTIES[difficulty];
    if (!d) return "난이도를 선택하세요.";
    const w = freshWar({
      name: p.name,
      crest: r.crest,
      type: "conquest",
      enemy: r.enemy,
      difficulty: d.enemy,
      preparation: d.prep,
      limit: 0,
      tutorial: false,
    });
    w.player.building!.presets = structuredClone(p.blueprints ?? []);
    w.player.rank = s.rank;
    w.enemy.rank = Math.max(s.rank, Math.min(5, s.rank + (elite ? 1 : 0)));
    w.player.storageLevel = Math.min(3, s.rank);
    for (const key of ["wood", "stone", "gold", "food", "mana"] as const)
      w.player.resources[key] = Math.floor(s.initial[key] * d.initial);
    for (const b of w.player.building!.buildings)
      for (const [k, n] of Object.entries(b.paid))
        w.player.resources[k as keyof typeof w.player.resources] = Math.max(
          0,
          w.player.resources[k as keyof typeof w.player.resources] - n,
        );
    w.ai.nextAttack =
      d.prep * 1000 + (s.mission === "development" ? 180000 : 60000);
    w.enemy.resources.gold += Math.min(300, p.ngPlus * 75 + (elite ? 200 : 0));
    const prior = (p.records[id] ??= {
      wins: 0,
      attempts: 0,
      stars: 0,
      bestSeconds: 0,
      difficulty: {},
      lastReason: "",
    });
    prior.attempts++;
    p.records[id] = prior;
    p.session = {
      id: w.id,
      stage: id,
      difficulty,
      war: w,
      mission: freshMission(),
      settled: false,
      elite,
      event,
      stars: [false, false, false],
      reasons: [],
      reward: "",
    };
    p.difficulty = difficulty;
    this.persist();
    this.attach();
    return null;
  }
  resume() {
    if (!this.profile?.session || this.profile.session.settled) return false;
    this.attach();
    return true;
  }
  private attach() {
    this.accumulator = 0;
    const p = this.profile!,
      session = p.session!;
    this.game.menu();
    const storage = new WarSaveManager({
      getItem: (key) => (key === WAR_KEY ? JSON.stringify(session.war) : null),
      setItem: (key, value) => {
        if (key === WAR_KEY) {
          session.war = JSON.parse(value);
          p.blueprints = structuredClone(
            session.war.player.building?.presets ?? [],
          );
          this.persist();
        }
      },
    });
    this.game.startWar(undefined, storage);
    const g = this.game,
      w = g.war!;
    session.war = w.data;
    w.objectiveControlled = true;
    this.terrain = new RegionalPhysicsSystem(g, session);
    w.environmentRule = (item) => this.terrain!.placement(item);
    for (const a of [w.army, w.enemyArmy]) {
      const old = a.navigation.terrain;
      a.navigation.terrain = (p) => old(p) || this.terrain!.blocked(p);
      a.navigation.invalidate();
      a.navigation.rebuild(w.navigationBuildings);
    }
    this.installMission(session);
    const initial = !session.mission.deviceCooldowns.growthApplied;
    this.growth.apply(initial);
    session.mission.deviceCooldowns.growthApplied = 1;
    const finish = w.onEnd;
    w.onEnd = () => {
      this.settle(w.data.result!);
      finish();
      this.onChange();
    };
    this.unsub = g.events.on("hit", ({ id }) => {
      if (
        g.testBall ||
        g.tilt.tilted ||
        g.time < g.recovery.suppressUntil ||
        g.state !== "playing" ||
        !this.active ||
        w.data.result
      )
        return;
      const hits = session.mission.hits;
      hits[id] = Math.min(9999, (hits[id] ?? 0) + 1);
      this.terrain?.hit(id);
      this.growth.hit();
      if (
        stage(session.stage).mission === "rescue" &&
        id === "env-scout" &&
        (hits[id] ?? 0) >= 3
      )
        session.mission.released = true;
    });
    const offHit = this.unsub,
      offLaunch = g.events.on("launch", () => {
        const b = g.physics.ball;
        if (b) {
          const factor =
            1 +
            0.03 * (p.research.launcher ?? 0) +
            (p.general === "engineer" ? 0.05 : 0);
          Matter.Body.setVelocity(b, {
            x: b.velocity.x * factor,
            y: b.velocity.y * factor,
          });
          g.physics.limitSpeed(b);
        }
      });
    this.unsub = () => {
      offHit?.();
      offLaunch();
    };
    this.extension = {
      regionId: stage(session.stage).region,
      bossPhase: () => session.mission.boss?.phase ?? 0,
      onLoss: () => {
        const used = session.mission.deviceCooldowns.savedLosses ?? 0;
        if (used >= Math.min(3, p.research.loss ?? 0)) return false;
        session.mission.deviceCooldowns.savedLosses = used + 1;
        g.magic?.endMulti();
        g.physics.spawn();
        g.economy!.data.launchState = "ready";
        g.recovery.reset();
        g.tilt.reset();
        g.events.emit("message", {
          text: "캠페인 스피어 수호 · 무료 재발사",
          tone: "gold",
        });
        g.checkpoint();
        return true;
      },
      beforeStep: (dt) => this.terrain?.beforeStep(dt),
      afterStep: (dt) => this.tick(dt),
      dispose: () => {
        this.unsub?.();
        this.terrain?.dispose();
        this.terrain = undefined;
        this.boss = undefined;
        this.unsub = undefined;
        this.extension = undefined;
      },
    };
    g.sessionExtension = this.extension;
    if (w.data.result && !session.settled) this.settle(w.data.result);
    this.persist();
    this.onChange();
  }
  private installMission(session: CampaignSession) {
    const g = this.game,
      w = g.war!,
      s = stage(session.stage),
      m = session.mission;
    if (s.mission === "boss" && !session.event)
      this.boss = new BossManager(g, session);
    if (["escort", "rescue"].includes(s.mission) && !session.event) {
      let unit = m.escortId
        ? w.army.data.units.find((u) => u.id === m.escortId)
        : undefined;
      if (!m.escortId) {
        unit = w.army.createUnit(
          "guard",
          "ally",
          w.army.navigation.closest({
            x: 120,
            y: s.mission === "rescue" ? 300 : 620,
          }) ?? { x: 120, y: 620 },
        );
        unit.squad = "escort";
        unit.hp = 350;
        unit.maxHpOverride = 350;
        unit.bossName =
          s.mission === "rescue" ? "고립된 아군" : "ROYAL CARAVAN";
        w.army.data.units.push(unit);
        m.escortId = unit.id;
      }
      if (unit) {
        unit.maxHpOverride = 350;
        if (m.deviceCooldowns.escortHp !== undefined)
          unit.hp = m.deviceCooldowns.escortHp;
      }
      const control = w.army.combat.controlUnit;
      w.army.combat.controlUnit = (u, dt, now, all) => {
        if (u.id !== m.escortId) return control?.(u, dt, now, all) ?? false;
        if (!m.released && s.mission === "rescue") return true;
        const points =
            s.mission === "rescue"
              ? [{ x: 120, y: 620 }]
              : [
                  { x: 120, y: 430 },
                  { x: 470, y: 430 },
                  { x: 470, y: 220 },
                ],
          goal = points[m.waypoint];
        if (!goal) return true;
        if (now < (m.deviceCooldowns.escortWait ?? 0)) return true;
        if (Math.hypot(u.x - goal.x, u.y - goal.y) < 25) {
          m.waypoint++;
          m.deviceCooldowns.escortWait = now + 30000;
        } else
          w.army.combat.move(
            u,
            goal,
            dt * (s.mission === "rescue" ? 0.3 : 0.1),
            now,
          );
        return true;
      };
    }
  }
  private tick(dt: number) {
    this.accumulator += dt;
    if (this.accumulator < 0.05) return;
    this.accumulator = 0;
    const g = this.game,
      w = g.war,
      s = this.session;
    if (!w || !s || s.settled || w.data.result || g.testBall || g.sandboxKind)
      return;
    const c = stage(s.stage),
      m = s.mission;
    this.boss?.tick();
    if (m.boss) {
      const u = w.enemyArmy.data.units.find((u) => u.id === m.boss!.unitId);
      m.boss.hp = u?.hp ?? 0;
    }
    let won = false;
    const elapsed = g.time - w.data.options.preparation * 1000;
    if (elapsed < 0) return;
    if (c.mission === "development")
      won =
        w.player.resources.totalProduction >= c.goal &&
        w.player.data.building!.buildings.some((b) =>
          ["lumber", "quarry", "farm", "mine", "arcane"].includes(b.type),
        );
    if (c.mission === "resource")
      won = (w.player.data.produced[c.resource!] ?? 0) >= c.goal;
    if (c.mission === "defense" || c.mission === "survival")
      won = elapsed >= c.seconds * 1000;
    if (c.mission === "siege") won = w.data.stats.walls >= c.goal;
    if (c.mission === "conquest") won = w.castle("enemy").hp <= 0;
    if (c.mission === "boss") won = !!m.boss && m.boss.hp <= 0;
    if (c.mission === "magic") won = m.devices >= c.goal;
    if (!s.event && (c.mission === "escort" || c.mission === "rescue")) {
      const unit = w.army.living.find((u) => u.id === m.escortId);
      m.deviceCooldowns.escortHp = unit?.hp ?? 0;
      if (!unit) {
        w.finish("defeat", "보호 대상 병력 손실");
        return;
      }
      won = m.waypoint >= (c.mission === "rescue" ? 1 : 3);
    }
    if (s.event) won = elapsed >= 180000;
    if (won) w.finish("victory", "캠페인 목표 달성");
    else if (elapsed >= c.limit * 1000)
      w.finish("defeat", "스테이지 제한 시간 초과");
  }
  private settle(result: WarResult) {
    const p = this.profile,
      s = p?.session;
    if (
      !p ||
      !s ||
      s.settled ||
      result.id !== s.id ||
      this.game.testBall ||
      this.game.sandboxKind
    )
      return;
    s.settled = true;
    const c = stage(s.stage),
      w = this.game.war!,
      record = p.records[s.stage],
      win = result.outcome === "victory";
    const seconds = Math.max(0, result.seconds - w.data.options.preparation),
      conditions = [
        win,
        win && w.castle("ally").hp / w.castle("ally").maxHp >= 0.6,
        win &&
          (c.challenge === "combo"
            ? this.game.score.combo.max >= 5
            : c.challenge === "losses"
              ? result.losses <= 12
              : c.challenge === "magic"
                ? Object.values(result.magic?.spells ?? {}).some((n) => !!n)
                : seconds <= c.limit * 0.7),
      ];
    s.stars = conditions;
    s.reasons = [
      win ? "목표 달성" : result.reason,
      conditions[1] ? "왕궁 체력 조건 달성" : "왕궁 체력 60% 미달",
      conditions[2] ? "고급 도전 달성" : c.star3 + " 미달",
    ];
    record.lastReason = result.reason;
    if (s.event) {
      const event = p.events.find((e) => !e.done && s.mission.hits[e.id]);
      if (win && event) {
        event.done = true;
        p.specialties[event.region] = (p.specialties[event.region] ?? 0) + 8;
        p.prestige += 5;
        s.reward = "방어 성공 · 특산물 8 / 명성 5";
      } else
        s.reward =
          "영토를 잃지 않았습니다. 다음 기회에 다시 방어할 수 있습니다.";
      p.stats.seconds += result.seconds;
      this.persist();
      return;
    }
    if (win) {
      const first = record.wins === 0,
        stars = conditions.filter(Boolean).length,
        improved = stars > record.stars;
      record.wins++;
      record.stars = Math.max(record.stars, stars);
      record.bestSeconds = record.bestSeconds
        ? Math.min(record.bestSeconds, seconds)
        : seconds;
      const old = record.difficulty[s.difficulty];
      record.difficulty[s.difficulty] = {
        stars: Math.max(old?.stars ?? 0, stars),
        seconds: old ? Math.min(old.seconds, seconds) : seconds,
      };
      const amount = first ? c.reward : record.wins <= 4 ? 5 : 0;
      p.specialties[c.region] =
        (p.specialties[c.region] ?? 0) +
        amount +
        (first ? s.mission.specialty : 0);
      p.stats.specialties += amount;
      p.points += first ? c.points : improved ? 2 : record.wins <= 20 ? 1 : 0;
      p.prestige += first ? (c.index === 2 ? 80 : 30) : improved ? 10 : 0;
      s.reward = first
        ? `최초 보상 · 특산물 ${amount} · 연구 ${c.points}`
        : `반복 보상 · 특산물 ${amount} (첫 3회), 연구 ${improved ? 2 : record.wins <= 20 ? 1 : 0} · 성장 턴 최대 20승`;
      if (c.index === 2 && !p.cores.includes(c.region)) {
        p.cores.push(c.region);
        p.territories[c.region] = {
          level: 1,
          facilities: { administration: 1 },
        };
        p.story.push(c.region);
      }
      if (first || improved || record.wins <= 20) {
        p.turn++;
        this.growth.turn();
        for (const [id, t] of Object.entries(p.territories)) {
          const gain = Math.min(
            8,
            1 + t.level + (t.facilities.production ?? 0),
          );
          p.specialties[id] = (p.specialties[id] ?? 0) + gain;
          p.stats.specialties += gain;
        }
      }
      p.completed = p.cores.length === 8;
      campaignAchievements(p);
      p.stats.wins++;
    } else s.reward = "영구 성장과 영토는 유지됩니다.";
    p.stats.seconds += result.seconds;
    p.stats.units += result.units;
    p.stats.combo = Math.max(p.stats.combo, result.combo);
    p.stats.multiballs += result.magic?.multiballs ?? 0;
    p.stats.storms += result.magic?.storms ?? 0;
    for (const [id, n] of Object.entries(result.magic?.spells ?? {}))
      p.stats.spells[id] = (p.stats.spells[id] ?? 0) + n;
    this.persist();
  }
  leave() {
    if (this.active) this.game.menu();
  }
  get progress() {
    const p = this.profile;
    return {
      territories: p?.cores.length ?? 0,
      stages: p ? STAGES.filter((s) => p.records[s.id]?.wins).length : 0,
      stars: p ? Object.values(p.records).reduce((n, r) => n + r.stars, 0) : 0,
    };
  }
  advice() {
    const r = this.session?.war.result;
    if (!r) return "";
    return r.losses > 12
      ? "병력 손실이 컸습니다. 적 기병에는 창병과 방어 진형을 준비하세요."
      : r.castle < 400
        ? "왕궁 피해가 컸습니다. 성벽 수리와 후방 방어를 강화하세요."
        : r.produced.food === 0
          ? "식량 생산 기록이 없습니다. 농장을 조준하고 유지비를 확인하세요."
          : "전쟁 패널에서 적 보호시설을 확인하고 공성 명령을 활용하세요.";
  }
  startEvent(id: string) {
    const event = this.profile?.events.find(
      (e) => e.id === id && !e.done && e.expires >= this.profile!.turn,
    );
    if (!event) return "현재 가능한 방어 이벤트가 아닙니다.";
    const number = STAGES.find(
      (s) => s.region === event.region && s.index === 1,
    )!.id;
    const error = this.begin(number, this.profile!.difficulty, false, true);
    if (!error) {
      this.session!.mission.hits[event.id] = 1;
      this.persist();
    }
    return error;
  }
  newGamePlus(slot: number) {
    const source = this.profile;
    if (!source?.completed) return "대륙 정복 후 사용할 수 있습니다.";
    if (this.save.occupied(slot))
      return "NEW GAME PLUS는 빈 슬롯에만 생성합니다.";
    const error = this.create(slot, source.name + " +", "hard");
    if (error) return error;
    this.profile!.ngPlus = source.ngPlus + 1;
    this.profile!.research = Object.fromEntries(
      Object.entries(source.research).map(([id, n]) => [id, Math.min(1, n)]),
    );
    this.profile!.equipment = [...source.equipment];
    this.profile!.generals = [...source.generals];
    this.profile!.loadout = { ...source.loadout };
    this.profile!.blueprints = structuredClone(source.blueprints ?? []);
    this.profile!.magicLoadout = structuredClone(source.magicLoadout);
    this.persist();
    return null;
  }
  dispose() {
    this.leave();
    this.unsub?.();
  }
}
