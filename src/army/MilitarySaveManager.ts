import {
  UNITS,
  unitConfig,
  FORMATIONS,
  COMMANDS,
  RESEARCH,
} from "../config/army";
import { RESOURCE_IDS, type Cost } from "../config/economy";
import {
  freshArmy,
  type ArmyData,
  type UnitEntity,
  type BattleRecord,
  type Projectile,
} from "./types";
import { rankForXp, maxHp } from "./DamageCalculator";
const obj = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {};
const num = (x: unknown, f = 0, max = 1e9, min = 0) =>
  typeof x === "number" && Number.isFinite(x)
    ? Math.max(min, Math.min(x, max))
    : f;
const ids = (x: unknown) =>
  Array.isArray(x)
    ? x
        .filter(
          (v): v is string =>
            typeof v === "string" && /^[a-zA-Z0-9_-]{1,50}$/.test(v),
        )
        .slice(0, 120)
    : [];
const cost = (x: unknown): Cost =>
  Object.fromEntries(
    RESOURCE_IDS.map((r) => [r, Math.floor(num(obj(x)[r], 0, 100000))]),
  );
export function sanitizeArmy(raw: unknown): ArmyData {
  const r = obj(raw),
    a = freshArmy(),
    used = new Set<string>();
  const unit = (raw: unknown, side: "ally" | "enemy"): UnitEntity[] => {
    const x = obj(raw),
      kind = UNITS.find((c) => c.id === x.kind)?.id;
    if (
      !kind ||
      typeof x.id !== "string" ||
      !/^[a-z0-9-]{1,50}$/.test(x.id) ||
      used.has(x.id)
    )
      return [];
    used.add(x.id);
    const u: UnitEntity = {
      id: x.id,
      kind,
      side,
      x: num(x.x, 290, 520, 60),
      y: num(x.y, 680, 740, 100),
      hp: num(x.hp, unitConfig(kind).hp, 1000),
      xp: num(x.xp, 0, 10000),
      rank: 1,
      squad: x.squad === "commander" ? "commander" : side,
      state: "idle",
      cooldown: num(x.cooldown),
      windup: 0,
      stun: num(x.stun),
      charge: x.charge === true,
      nextBoost: num(x.nextBoost, 0, 1),
      damage: num(x.damage),
      healing: num(x.healing),
      kills: Math.floor(num(x.kills)),
      facing: num(x.facing, 0, Math.PI, -Math.PI),
      spawnAt: num(x.spawnAt),
      lastSphere: num(x.lastSphere, -10000, 1e9, -10000),
      path: [],
      pathAt: 0,
      holdX: num(x.holdX, 290, 520, 60),
      holdY: num(x.holdY, 680, 740, 100),
    };
    u.rank = side === "enemy" && u.squad === "commander" ? 5 : rankForXp(u.xp);
    u.hp = Math.min(u.hp, maxHp(u) * (u.squad === "commander" ? 1.25 : 1));
    return [u];
  };
  a.units = Array.isArray(r.units)
    ? r.units
        .slice(0, 120)
        .flatMap((x) => unit(x, "ally"))
        .filter((u) => u.hp > 0)
    : [];
  for (const [id, raw] of Object.entries(obj(r.queues)).slice(0, 20)) {
    if (!/^building-\d+$/.test(id)) continue;
    const q = obj(raw);
    a.queues[id] = {
      buildingId: id,
      entries: (Array.isArray(q.entries) ? q.entries : [])
        .slice(0, 10)
        .flatMap((e) => {
          const x = obj(e),
            kind = UNITS.find((c) => c.id === x.kind)?.id;
          if (
            !kind ||
            typeof x.id !== "string" ||
            !/^training-\d+$/.test(x.id) ||
            used.has(x.id)
          )
            return [];
          used.add(x.id);
          return [
            {
              id: x.id,
              kind,
              progress: num(x.progress, 0, 1),
              paid: cost(x.paid),
            },
          ];
        }),
      lastHit: num(q.lastHit, -10000, 1e9, -10000),
      auto: UNITS.find((c) => c.id === q.auto)?.id,
    };
  }
  a.nextId = Math.max(
    1,
    Math.floor(num(r.nextId, 1)),
    ...Array.from(used)
      .map((id) => Number(id.split("-").at(-1)) + 1)
      .filter(Number.isFinite),
  );
  for (const c of RESEARCH)
    a.research[c.id] = Math.floor(num(obj(r.research)[c.id], 0, 3));
  const task = obj(r.researchTask);
  if (
    RESEARCH.some((c) => c.id === task.id) &&
    (a.research[String(task.id)] ?? 0) < 3
  )
    a.researchTask = {
      id: String(task.id),
      level: (a.research[String(task.id)] ?? 0) + 1,
      progress: num(task.progress, 0, 1),
    };
  a.morale = num(r.morale, 70, 100);
  a.upkeepMs = num(r.upkeepMs, 0, 30000);
  a.starvingMs = num(r.starvingMs);
  a.formation = Object.hasOwn(FORMATIONS, String(r.formation))
    ? (r.formation as ArmyData["formation"])
    : "standard";
  a.command = Object.hasOwn(COMMANDS, String(r.command))
    ? (r.command as ArmyData["command"])
    : "regroup";
  for (const key of ["buffs", "comboReady"] as const)
    for (const [id, time] of Object.entries(obj(r[key])).slice(0, 10))
      if (/^[a-z]+$/.test(id)) a[key][id] = num(time);
  a.comboHits = Array.isArray(r.comboHits)
    ? r.comboHits.slice(-40).flatMap((v) => {
        const x = obj(v);
        return typeof x.id === "string" && /^[a-zA-Z0-9_|-]{1,80}$/.test(x.id)
          ? [{ id: x.id, time: num(x.time) }]
          : [];
      })
    : [];
  for (const key of ["completed", "attempted"] as const)
    a[key] = Array.isArray(r[key])
      ? Array.from(
          new Set(
            r[key].filter(
              (v): v is number =>
                Number.isInteger(v) && Number(v) >= 0 && Number(v) < 5,
            ),
          ),
        )
      : [];
  a.claimed = ids(r.claimed);
  a.tutorial = Math.floor(num(r.tutorial, 0, 6));
  a.tutorialDone = r.tutorialDone === true;
  const stats = obj(r.stats);
  for (const key of [
    "hits",
    "combos",
    "research",
    "commands",
    "sphereKills",
    "maxPopulation",
    "maxPower",
    "victories",
    "losses",
  ] as const)
    a.stats[key] = num(stats[key]);
  a.stats.defended = stats.defended === true;
  a.stats.advanced = stats.advanced === true;
  for (const c of UNITS) {
    const n = num(obj(stats.produced)[c.id]);
    if (n) a.stats.produced[c.id] = n;
  }
  const record = (raw: unknown): BattleRecord | null => {
    const x = obj(raw);
    if (
      !["practice", "challenge"].includes(String(x.mode)) ||
      !["victory", "defeat", "aborted"].includes(String(x.outcome))
    )
      return null;
    const values = (v: unknown) =>
      Object.fromEntries(
        Object.entries(obj(v))
          .slice(0, 120)
          .filter(([k]) => /^[a-z0-9-]{1,50}$/.test(k))
          .map(([k, v]) => [k, num(v)]),
      );
    return {
      mode: x.mode as BattleRecord["mode"],
      scenario: Math.floor(num(x.scenario, 0, 4)),
      outcome: x.outcome as BattleRecord["outcome"],
      seconds: num(x.seconds),
      initial: num(x.initial, 0, 120),
      survivors: num(x.survivors, 0, 120),
      losses: num(x.losses, 0, 120),
      kills: num(x.kills),
      damage: values(x.damage),
      healing: values(x.healing),
      sphereDamage: num(x.sphereDamage),
      combos: num(x.combos),
      xp: num(x.xp),
      reward: cost(x.reward),
    };
  };
  a.lastResult = record(r.lastResult);
  a.history = Array.isArray(r.history)
    ? r.history.slice(0, 10).flatMap((x) => {
        const v = record(x);
        return v ? [v] : [];
      })
    : [];
  const b = obj(r.battle);
  if (
    b.mode === "challenge" &&
    Number.isInteger(b.scenario) &&
    Number(b.scenario) >= 0 &&
    Number(b.scenario) < 5
  ) {
    a.battle = {
      mode: "challenge",
      scenario: Number(b.scenario),
      time: num(b.time, 0, 240),
      wave: Math.floor(num(b.wave, 0, b.scenario === 4 ? 1 : 0)),
      initial: ids(b.initial),
      enemies: (Array.isArray(b.enemies) ? b.enemies : [])
        .slice(0, 100)
        .flatMap((x) => unit(x, "enemy")),
      projectiles: [],
      nextProjectile: Math.floor(num(b.nextProjectile, 1)),
      sphereDamage: num(b.sphereDamage),
      combos: num(b.combos),
      xp: num(b.xp),
      rewardEligible: b.rewardEligible === true,
      contributions: {},
    };
    for (const [id, v] of Object.entries(obj(b.contributions)).slice(0, 120)) {
      if (!/^[a-z0-9-]{1,50}$/.test(id)) continue;
      const s = obj(v);
      a.battle.contributions[id] = {
        damage: num(s.damage),
        healing: num(s.healing),
        xp: num(s.xp, 0, 100),
      };
    }
    a.battle.projectiles = (Array.isArray(b.projectiles) ? b.projectiles : [])
      .slice(0, 160)
      .flatMap((raw) => {
        const p = obj(raw);
        if (
          typeof p.from !== "string" ||
          typeof p.target !== "string" ||
          !["tower", ...UNITS.map((u) => u.id)].includes(String(p.kind))
        )
          return [];
        return [
          {
            id: num(p.id),
            from: p.from,
            target: p.target,
            side: p.side === "enemy" ? "enemy" : "ally",
            kind: p.kind as Projectile["kind"],
            x: num(p.x),
            y: num(p.y),
            startX: num(p.startX),
            startY: num(p.startY),
            tx: num(p.tx),
            ty: num(p.ty),
            age: num(p.age, 0, 5),
            duration: num(p.duration, 0.3, 5, 0.05),
            damage: num(p.damage, 0, 1000),
            splash: num(p.splash, 0, 100),
            heal: p.heal === true,
          },
        ];
      });
  }
  return a;
}
