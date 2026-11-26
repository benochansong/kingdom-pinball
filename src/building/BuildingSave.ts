import { buildingConfig, TERRITORIES } from "../config/buildings";
import { RESOURCE_IDS, type Cost } from "../config/economy";
import {
  freshBuildings,
  freshProduction,
  type BlueprintItem,
  type BuildingData,
} from "./types";
import { validatePlacement } from "./PlacementValidator";
const obj = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {};
const num = (x: unknown, f = 0, max = 1e9) =>
  typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.min(x, max) : f;
export function sanitizeBuildings(raw: unknown): BuildingData {
  const d = freshBuildings(),
    r = obj(raw),
    ids = new Set<string>();
  d.territories = TERRITORIES.filter(
    (t) =>
      t.id === "central" ||
      (Array.isArray(r.territories) && r.territories.includes(t.id)),
  ).map((t) => t.id);
  if (Array.isArray(r.buildings))
    for (const entry of r.buildings.slice(0, 20)) {
      const b = obj(entry),
        c = buildingConfig(String(b.type));
      if (
        !c ||
        typeof b.id !== "string" ||
        !/^building-\d+$/.test(b.id) ||
        ids.has(b.id)
      )
        continue;
      const item: BlueprintItem = {
        type: c.id,
        x: num(b.x),
        y: num(b.y),
        angle: num(b.angle, 0, 360),
        level: Math.max(1, Math.floor(num(b.level, 1, 5))),
      };
      if (validatePlacement(item, d.buildings, d.territories)) continue;
      const p = obj(b.production),
        paid: Cost = {};
      for (const id of RESOURCE_IDS)
        paid[id] = Math.floor(num(obj(b.paid)[id], 0, 100000));
      d.buildings.push({
        ...item,
        id: b.id,
        paid,
        charge: num(b.charge, 0, 5),
        lastHit: num(b.lastHit, -10000),
        readyAt: num(b.readyAt),
        production: {
          ...freshProduction(),
          level: item.level,
          hits: num(p.hits),
          yielded: num(p.yielded),
          lastHit: num(p.lastHit, -10000),
          overloadedUntil: num(p.overloadedUntil),
          recent: Array.isArray(p.recent)
            ? p.recent.slice(-12).map((x) => num(x))
            : [],
        },
      });
      ids.add(b.id);
    }
  d.nextId = Math.max(
    1,
    Math.floor(num(r.nextId, 1)),
    ...d.buildings.map((b) => Number(b.id.split("-")[1]) + 1),
  );
  const s = obj(r.stats);
  for (const key of Object.keys(d.stats) as (keyof typeof d.stats)[])
    d.stats[key] = Math.floor(num(s[key]));
  d.claimed = Array.isArray(r.claimed)
    ? r.claimed
        .filter((x): x is string => typeof x === "string" && x.length < 30)
        .slice(0, 30)
    : [];
  d.tutorial = Math.floor(num(r.tutorial, 0, 5));
  d.tutorialDone = r.tutorialDone === true;
  d.presets = Array.isArray(r.presets)
    ? r.presets.slice(0, 3).map((p) => {
        const v = obj(p);
        return {
          name: String(v.name ?? "설계")
            .replace(/[<>&"']/g, "")
            .slice(0, 32),
          items: (Array.isArray(v.items) ? v.items : [])
            .slice(0, 20)
            .flatMap((x) => {
              const b = obj(x);
              return buildingConfig(String(b.type))
                ? [
                    {
                      type: String(b.type),
                      x: num(b.x),
                      y: num(b.y),
                      angle: num(b.angle, 0, 360),
                      level: Math.max(1, Math.floor(num(b.level, 1, 5))),
                    },
                  ]
                : [];
            }),
        };
      })
    : [];
  return d;
}
