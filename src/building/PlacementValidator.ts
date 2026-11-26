import { buildingConfig, TERRITORIES } from "../config/buildings";
import { ECONOMY_TARGETS } from "../config/economy";
import { RAILS } from "../data/table";
import type { BuildingEntity, BlueprintItem } from "./types";
export type Point = { x: number; y: number };
export const snap = (v: number) => Math.round(v / 10) * 10;
/** Oriented rectangle signed distance; circles use their exact radius. */
export function distanceToBuilding(p: Point, b: BlueprintItem): number {
  const c = buildingConfig(b.type);
  if (!c) return -Infinity;
  if (c.shape === "circle")
    return Math.hypot(p.x - b.x, p.y - b.y) - c.width / 2;
  const a = (b.angle * Math.PI) / 180,
    dx = p.x - b.x,
    dy = p.y - b.y;
  const x = Math.abs(dx * Math.cos(a) + dy * Math.sin(a)) - c.width / 2;
  const y = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)) - c.height / 2;
  return (
    Math.hypot(Math.max(x, 0), Math.max(y, 0)) + Math.min(Math.max(x, y), 0)
  );
}
export function footprint(b: BlueprintItem, pad = 0): Point[] {
  const c = buildingConfig(b.type)!;
  const a = (b.angle * Math.PI) / 180;
  const n = c.shape === "circle" ? 16 : 4;
  return Array.from({ length: n }, (_, i) => {
    const x =
      c.shape === "circle"
        ? Math.cos((i * 2 * Math.PI) / n) * (c.width / 2 + pad)
        : [-1, 1, 1, -1][i] * (c.width / 2 + pad);
    const y =
      c.shape === "circle"
        ? Math.sin((i * 2 * Math.PI) / n) * (c.width / 2 + pad)
        : [-1, -1, 1, 1][i] * (c.height / 2 + pad);
    return {
      x: b.x + x * Math.cos(a) - y * Math.sin(a),
      y: b.y + x * Math.sin(a) + y * Math.cos(a),
    };
  });
}
function intersect(a: Point[], b: Point[]): boolean {
  for (const p of [a, b])
    for (let i = 0; i < p.length; i++) {
      const q = p[(i + 1) % p.length],
        axis = { x: q.y - p[i].y, y: p[i].x - q.x };
      const aa = a.map((v) => v.x * axis.x + v.y * axis.y),
        bb = b.map((v) => v.x * axis.x + v.y * axis.y);
      if (
        Math.max(...aa) < Math.min(...bb) ||
        Math.max(...bb) < Math.min(...aa)
      )
        return false;
    }
  return true;
}
function segmentDistance(
  p: Point,
  a: readonly number[],
  b: readonly number[],
): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / (dx * dx + dy * dy),
      ),
    );
  return Math.hypot(p.x - a[0] - t * dx, p.y - a[1] - t * dy);
}
export function fixedBlocked(p: Point, pad = 15): boolean {
  return (
    p.x < 60 + pad ||
    p.x > 522 - pad ||
    p.y < 60 + pad ||
    p.y > 748 ||
    ECONOMY_TARGETS.some(
      (t) => Math.hypot(p.x - t.x, p.y - t.y) < t.radius + pad,
    ) ||
    RAILS.some((r) => segmentDistance(p, r.a, r.b) < r.width / 2 + pad)
  );
}
export function pathSafety(buildings: BlueprintItem[]): string | null {
  const w = 60,
    h = 76,
    blocked = new Uint8Array(w * h),
    seen = new Uint8Array(w * h);
  for (let y = 6; y < h; y++)
    for (let x = 6; x < 53; x++) {
      const p = { x: x * 10, y: y * 10 };
      blocked[y * w + x] =
        fixedBlocked(p) || buildings.some((b) => distanceToBuilding(p, b) < 15)
          ? 1
          : 0;
    }
  const queue: number[] = [];
  const start = 70 * w + 29;
  if (blocked[start]) return "下단 집결 통로를 막습니다.";
  seen[start] = 1;
  queue.push(start);
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i],
      x = n % w,
      y = Math.floor(n / w);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const xx = x + dx,
        yy = y + dy,
        j = yy * w + xx;
      if (xx < 6 || xx >= 53 || yy < 6 || yy >= h || seen[j] || blocked[j])
        continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  for (const p of [
    { x: 450, y: 180 },
    { x: 290, y: 110 },
    { x: 220, y: 710 },
    { x: 360, y: 710 },
  ])
    if (!seen[Math.round(p.y / 10) * w + Math.round(p.x / 10)])
      return `발사·상하·플리퍼 필수 이동 통로 (${p.x}, ${p.y})를 막습니다.`;
  for (const t of ECONOMY_TARGETS) {
    let accessible = false;
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI) / 12,
        x = Math.round((t.x + Math.cos(a) * (t.radius + 23)) / 10),
        y = Math.round((t.y + Math.sin(a) * (t.radius + 23)) / 10);
      if (seen[y * w + x]) accessible = true;
    }
    if (!accessible) return `${t.name}에 접근할 수 없습니다.`;
  }
  // A newly enclosed pocket of at least 6 cells is unsafe, even if the main path survives.
  let pocket = 0;
  for (let y = 12; y < 69; y++)
    for (let x = 8; x < 51; x++) {
      const n = y * w + x;
      if (!blocked[n] && !seen[n]) pocket++;
    }
  if (pocket > 5) return "공이 갇히는 폐쇄 공간을 만듭니다.";
  return null;
}
export function validatePlacement(
  candidate: BlueprintItem,
  others: BuildingEntity[] | BlueprintItem[],
  territories: string[],
  ball?: Point,
  paths = true,
): string | null {
  const c = buildingConfig(candidate.type);
  if (!c || ![candidate.x, candidate.y, candidate.angle].every(Number.isFinite))
    return "잘못된 건물 배치입니다.";
  const vertices = footprint(candidate, 2);
  if (vertices.some((p) => p.x < 65 || p.x > 515 || p.y < 110 || p.y > 700))
    return "테이블 경계 또는 플리퍼 보호 구역입니다.";
  if (
    !vertices.every((p) =>
      TERRITORIES.some(
        (t) =>
          territories.includes(t.id) &&
          p.x >= t.rect[0] &&
          p.x <= t.rect[0] + t.rect[2] &&
          p.y >= t.rect[1] &&
          p.y <= t.rect[1] + t.rect[3],
      ),
    )
  )
    return "잠긴 영토입니다. 영토를 먼저 확장하세요.";
  if (
    vertices.some((p) =>
      RAILS.some((r) => segmentDistance(p, r.a, r.b) < r.width / 2 + 15),
    )
  )
    return "외벽 또는 발사 통로를 침범합니다.";
  if (ball && distanceToBuilding(ball, candidate) < 20)
    return "현재 공 위치와 겹칩니다.";
  if (
    ECONOMY_TARGETS.some(
      (t) => distanceToBuilding(t, candidate) < t.radius + 30,
    )
  )
    return "기존 시설과 겹치거나 통과 너비가 부족합니다.";
  if (others.some((b) => intersect(footprint(candidate, 15), footprint(b, 15))))
    return "다른 건물과 겹치거나 최소 30px 통로가 부족합니다.";
  if (paths) return pathSafety([...others, candidate]);
  return null;
}
