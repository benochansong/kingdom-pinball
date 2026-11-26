import {
  distanceToBuilding,
  fixedBlocked,
  type Point,
} from "../building/PlacementValidator";
import type { BuildingEntity } from "../building/types";
/** Cached 10px navigation grid shared by all units; no Matter bodies per soldier. */
export class PathfindingSystem {
  terrain: (p: Point) => boolean = (p) => fixedBlocked(p, 8);
  readonly width = 60;
  readonly height = 75;
  private blocked = new Uint8Array(4500);
  private cache = new Map<number, Int32Array>();
  private signature = "";
  rebuild(buildings: BuildingEntity[]) {
    buildings = buildings.filter((b) => !b.disabled);
    const s = JSON.stringify(buildings.map((b) => [b.type, b.x, b.y, b.angle]));
    if (s === this.signature) return;
    this.signature = s;
    this.cache.clear();
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        const p = { x: x * 10, y: y * 10 };
        this.blocked[y * 60 + x] =
          p.y < 100 ||
          p.y > 730 ||
          this.terrain(p) ||
          buildings.some((b) => distanceToBuilding(p, b) < 8)
            ? 1
            : 0;
      }
  }
  free(p: Point): boolean {
    const x = Math.round(p.x / 10),
      y = Math.round(p.y / 10);
    return x >= 0 && x < 60 && y >= 0 && y < 75 && !this.blocked[y * 60 + x];
  }
  closest(p: Point): Point | null {
    if (this.free(p))
      return { x: Math.round(p.x / 10) * 10, y: Math.round(p.y / 10) * 10 };
    let best = -1,
      d = Infinity;
    for (let i = 0; i < this.blocked.length; i++) {
      if (this.blocked[i]) continue;
      const x = (i % 60) * 10,
        y = Math.floor(i / 60) * 10,
        v = (x - p.x) ** 2 + (y - p.y) ** 2;
      if (v < d) {
        best = i;
        d = v;
      }
    }
    return best < 0
      ? null
      : { x: (best % 60) * 10, y: Math.floor(best / 60) * 10 };
  }
  clearLine(a: Point, b: Point): boolean {
    const n = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 5));
    for (let i = 0; i <= n; i++)
      if (
        !this.free({
          x: a.x + ((b.x - a.x) * i) / n,
          y: a.y + ((b.y - a.y) * i) / n,
        })
      )
        return false;
    return true;
  }
  path(a: Point, b: Point): Point[] {
    const start = this.closest(a),
      end = this.closest(b);
    if (!start || !end || Math.hypot(end.x - b.x, end.y - b.y) > 80) return [];
    const sid = Math.round(start.y / 10) * 60 + Math.round(start.x / 10),
      eid = Math.round(end.y / 10) * 60 + Math.round(end.x / 10);
    let field = this.cache.get(eid);
    if (!field) {
      field = new Int32Array(4500).fill(-1);
      field[eid] = eid;
      const q = [eid];
      for (let i = 0; i < q.length; i++) {
        const n = q[i],
          x = n % 60,
          y = Math.floor(n / 60);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const xx = x + dx,
            yy = y + dy,
            id = yy * 60 + xx;
          if (
            xx < 0 ||
            xx >= 60 ||
            yy < 0 ||
            yy >= 75 ||
            this.blocked[id] ||
            field[id] >= 0
          )
            continue;
          field[id] = n;
          q.push(id);
        }
      }
      if (this.cache.size >= 64)
        this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(eid, field);
    }
    if (field[sid] < 0) return [];
    const out: Point[] = [start];
    let n = sid;
    while (n !== eid && out.length < 4500) {
      n = field[n];
      out.push({ x: (n % 60) * 10, y: Math.floor(n / 60) * 10 });
    }
    return out;
  }
}
