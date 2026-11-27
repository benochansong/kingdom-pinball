import type {
  MagicData,
  MagicStats,
  StatusKind,
  Element,
  Spell,
} from "./types";
import {
  ELEMENTS,
  SPELLS,
  MAGIC_RESEARCH,
  MULTI_TYPES,
  STORMS,
} from "../config/magic";
const o = (v: unknown): Record<string, any> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, any>)
    : {};
const n = (v: unknown, max = 1e9) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.max(0, Math.min(max, v))
    : 0;
const numeric = (v: unknown, max = 1e9) =>
  Object.fromEntries(
    Object.entries(o(v))
      .filter(([k]) => /^[a-zA-Z0-9-]{1,55}$/.test(k))
      .slice(0, 2000)
      .map(([k, v]) => [k, n(v, max)]),
  );
export const freshMagicStats = (): MagicStats => ({
  uses: {},
  hits: {},
  damage: {},
  spells: {},
  dot: 0,
  statuses: 0,
  healing: 0,
  shield: 0,
  combos: {},
  multiballs: 0,
  maxBalls: 1,
  multiHits: 0,
  storms: 0,
  stormDamage: 0,
  stormResources: 0,
  mana: 0,
  charge: 0,
  fireKills: 0,
  frozenCharges: 0,
  walls: 0,
});
export const freshMagic = (): MagicData => ({
  version: 1,
  charge: 0,
  multiCharge: 0,
  stormCharge: 0,
  research: {},
  task: null,
  loadout: {
    balls: [],
    spells: [],
    multi: "steel",
    storm: "core",
    autoAim: true,
  },
  cooldowns: {},
  statuses: [],
  fields: [],
  multi: null,
  nextBall: 1,
  stats: freshMagicStats(),
  achievements: [],
  tutorial: 0,
  tutorialDone: false,
  training: [],
  history: [],
  enemyCast: null,
  nextAI: 0,
});
export function sanitizeMagic(raw: unknown): MagicData {
  const x = o(raw),
    d = freshMagic();
  d.charge = n(x.charge, 100);
  d.multiCharge = n(x.multiCharge, 100);
  d.stormCharge = n(x.stormCharge, 100);
  d.research = Object.fromEntries(
    MAGIC_RESEARCH.map((r) => [r.id, Math.floor(n(o(x.research)[r.id], 3))]),
  );
  const task = o(x.task);
  if (MAGIC_RESEARCH.some((r) => r.id === task.id))
    d.task = {
      id: task.id,
      level: Math.max(1, Math.floor(n(task.level, 3))),
      progress: n(task.progress, 1),
      paid: numeric(task.paid),
    };
  const l = o(x.loadout);
  d.loadout = {
    balls: (Array.isArray(l.balls) ? l.balls : [])
      .filter(
        (id: Element) =>
          ELEMENTS.some((e) => e.id === id) && d.research[id] > 0,
      )
      .slice(0, 4),
    spells: (Array.isArray(l.spells) ? l.spells : [])
      .filter(
        (id: Spell) => SPELLS.some((e) => e.id === id) && d.research[id] > 0,
      )
      .slice(0, 2),
    multi: Object.hasOwn(MULTI_TYPES, l.multi) ? l.multi : "steel",
    storm: Object.hasOwn(STORMS, l.storm) ? l.storm : "core",
    autoAim: l.autoAim !== false,
  };
  d.cooldowns = numeric(x.cooldowns);
  d.nextBall = Math.max(1, Math.floor(n(x.nextBall)));
  d.statuses = (Array.isArray(x.statuses) ? x.statuses : [])
    .slice(0, 600)
    .flatMap((v: unknown) => {
      const s = o(v);
      return typeof s.target === "string" &&
        s.target.length < 60 &&
        [
          "burn",
          "chill",
          "freeze",
          "shock",
          "break",
          "blessing",
          "shield",
        ].includes(s.kind)
        ? [
            {
              target: s.target,
              kind: s.kind as StatusKind,
              until: n(s.until),
              next: n(s.next),
              stacks: Math.max(1, n(s.stacks, 3)),
              power: n(s.power, 100),
            },
          ]
        : [];
    });
  d.fields = (Array.isArray(x.fields) ? x.fields : [])
    .slice(0, 8)
    .filter((v: any) => SPELLS.some((s) => s.id === v.spell))
    .map((v: any) => ({
      spell: v.spell,
      x: n(v.x, 600),
      y: n(v.y, 900),
      until: n(v.until),
      next: n(v.next),
    }));
  const m = o(x.multi);
  if ([3, 5, 7, 10].includes(m.count))
    d.multi = {
      count: m.count,
      until: n(m.until),
      started: n(m.started),
      storm: m.storm === true,
      variant: typeof m.variant === "string" ? m.variant : "core",
      saves: n(m.saves, 5),
      pending: (Array.isArray(m.pending) ? m.pending : [])
        .filter((id: Element) => ELEMENTS.some((e) => e.id === id))
        .slice(0, 9),
    };
  for (const k of Object.keys(d.stats) as (keyof MagicStats)[])
    Object.assign(d.stats, {
      [k]:
        typeof d.stats[k] === "number"
          ? n(o(x.stats)[k])
          : numeric(o(x.stats)[k]),
    });
  d.achievements = (Array.isArray(x.achievements) ? x.achievements : [])
    .filter((s: unknown) => typeof s === "string" && s.length < 50)
    .slice(0, 20);
  d.training = (Array.isArray(x.training) ? x.training : []).filter(
    (v: unknown) => Number.isInteger(v) && Number(v) >= 0 && Number(v) < 6,
  );
  d.tutorial = Math.floor(n(x.tutorial, 12));
  d.tutorialDone = x.tutorialDone === true;
  d.nextAI = n(x.nextAI);
  const cast = o(x.enemyCast);
  if (SPELLS.some((s) => s.id === cast.spell))
    d.enemyCast = {
      spell: cast.spell,
      x: n(cast.x, 600),
      y: n(cast.y, 900),
      at: n(cast.at),
    };
  d.history = (Array.isArray(x.history) ? x.history : [])
    .slice(-20)
    .filter(
      (h: any) =>
        ELEMENTS.some((e) => e.id === h.element) &&
        typeof h.target === "string",
    )
    .map((h: any) => ({
      element: h.element,
      target: h.target.slice(0, 60),
      at: n(h.at),
    }));
  return d;
}
