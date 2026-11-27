import { SeededRandom } from "./SeededRandom";
import { REGIONS } from "../config/campaign";
import { BUILDINGS } from "../config/buildings";
import { UNITS } from "../config/army";
import type { StorageLike } from "../systems/SaveManager";
export const TABLE_KEY = "kingdom-pinball:tables:v1";
export const OBJECT_KINDS = [
  "bumper",
  "wall",
  "reflector",
  "building",
  "portal",
  "target",
  "unit",
  "boss",
  "decoration",
  "wind",
  "accelerator",
  "slow",
] as const;
export type TableObjectKind = (typeof OBJECT_KINDS)[number];
export interface TableObject {
  id: string;
  kind: TableObjectKind;
  name: string;
  x: number;
  y: number;
  angle: number;
  width: number;
  height: number;
  value: number;
  type: string;
  side: "ally" | "enemy";
  link: string;
}
export interface TableDefinition {
  version: 1;
  id: string;
  name: string;
  region: string;
  preset: "classic" | "kingdom" | "magic";
  rule: "classicScore" | "resource" | "war" | "survival" | "boss" | "puzzle";
  goal: "score" | "resources" | "time" | "hits" | "kills" | "boss" | "zone";
  amount: number;
  seconds: number;
  balls: number;
  objects: TableObject[];
}
export interface TableValidation {
  errors: string[];
  warnings: string[];
  fingerprint: string;
}
const text = (x: unknown, max = 60) =>
  typeof x === "string" ? x.replace(/[<>\x00-\x1f]/g, "").slice(0, max) : "";
const validNumber = (n: unknown, min: number, max: number) =>
  typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
export function parseTable(raw: unknown): TableDefinition {
  const x = raw as Partial<TableDefinition>;
  if (!x || typeof x !== "object" || x.version !== 1)
    throw Error("지원하는 테이블 버전은 1입니다.");
  if (
    !["classic", "kingdom", "magic"].includes(x.preset ?? "") ||
    !["classicScore", "resource", "war", "survival", "boss", "puzzle"].includes(
      x.rule ?? "",
    ) ||
    !["score", "resources", "time", "hits", "kills", "boss", "zone"].includes(
      x.goal ?? "",
    ) ||
    !REGIONS.some((r) => r.id === x.region)
  )
    throw Error("테이블 규칙/지역이 유효하지 않습니다.");
  if (
    !validNumber(x.amount, 1, 1000000) ||
    !validNumber(x.seconds, 10, 3600) ||
    !validNumber(x.balls, 1, 10) ||
    !Number.isInteger(x.balls) ||
    !Array.isArray(x.objects) ||
    x.objects.length > 80
  )
    throw Error("목표, 시간, 공 수 또는 오브젝트 개수가 범위를 벗어났습니다.");
  const ids = new Set<string>();
  const objects = x.objects.map((o: TableObject) => {
    if (
      !o ||
      !OBJECT_KINDS.includes(o.kind) ||
      !["ally", "enemy"].includes(o.side)
    )
      throw Error("허용되지 않은 오브젝트입니다.");
    for (const [key, min, max] of [
      ["x", 65, 510],
      ["y", 110, 710],
      ["angle", -180, 180],
      ["width", 10, 140],
      ["height", 10, 140],
      ["value", 0, 10000],
    ] as const)
      if (!validNumber(o[key], min, max))
        throw Error(`오브젝트 ${key} 값이 잘못되었습니다.`);
    const id = text(o.id, 40);
    if (!/^[\w-]+$/.test(id) || ids.has(id))
      throw Error("오브젝트 ID가 없거나 중복됩니다.");
    ids.add(id);
    if (
      (o.kind === "building" && !BUILDINGS.some((b) => b.id === o.type)) ||
      (o.kind === "unit" && !UNITS.some((u) => u.id === o.type)) ||
      (o.kind === "boss" && !REGIONS.some((r) => r.id === o.type))
    )
      throw Error("알 수 없는 시설/병종/보스입니다.");
    return {
      id,
      kind: o.kind,
      name: text(o.name),
      x: o.x,
      y: o.y,
      angle: o.angle,
      width: o.width,
      height: o.height,
      value: o.value,
      type: text(o.type, 40),
      side: o.side,
      link: text(o.link, 40),
    };
  });
  return {
    version: 1,
    id: text(x.id, 50) || "table",
    name: text(x.name) || "UNTITLED TABLE",
    region: x.region!,
    preset: x.preset!,
    rule: x.rule!,
    goal: x.goal!,
    amount: x.amount!,
    seconds: x.seconds!,
    balls: x.balls!,
    objects,
  };
}
export function importTable(json: string) {
  if (json.length > 256000) throw Error("JSON은 256KB 이하여야 합니다.");
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    throw Error("올바른 JSON 파일이 아닙니다.");
  }
  return parseTable(raw);
}
export const tableFingerprint = (table: TableDefinition) =>
  SeededRandom.hash(JSON.stringify(parseTable(table))).toString(16);
const solid = (o: TableObject) =>
  ["bumper", "wall", "reflector", "building", "target"].includes(o.kind);
function contains(o: TableObject, x: number, y: number, pad = 12) {
  const a = (-o.angle * Math.PI) / 180,
    dx = x - o.x,
    dy = y - o.y;
  return (
    Math.abs(dx * Math.cos(a) - dy * Math.sin(a)) < o.width / 2 + pad &&
    Math.abs(dx * Math.sin(a) + dy * Math.cos(a)) < o.height / 2 + pad
  );
}
export function validateTable(raw: unknown): TableValidation {
  let t: TableDefinition;
  try {
    t = parseTable(raw);
  } catch (e) {
    return {
      errors: [String((e as Error).message)],
      warnings: [],
      fingerprint: "",
    };
  }
  const errors: string[] = [],
    warnings: string[] = [];
  const objects = t.objects;
  for (const o of objects) {
    if (
      solid(o) &&
      (o.x + Math.hypot(o.width, o.height) / 2 > 525 ||
        o.y + o.height / 2 > 725 ||
        o.y - o.height / 2 < 100)
    )
      errors.push(
        `${o.name || o.id}: 발사로·플리퍼·상단 경계의 안전 여백을 침범합니다.`,
      );
    if (
      o.kind === "portal" &&
      (!objects.some((p) => p.id === o.link && p.kind === "portal") ||
        o.id === o.link)
    )
      errors.push(`${o.id}: 서로 다른 포털 출구가 필요합니다.`);
    if (
      ["unit", "boss", "portal"].includes(o.kind) &&
      objects.some(
        (p) => p.id !== o.id && solid(p) && contains(p, o.x, o.y, 20),
      )
    )
      errors.push(`${o.id}: 출구/병력 생성 지점이 막혔습니다.`);
  }
  for (let i = 0; i < objects.length; i++)
    for (let j = i + 1; j < objects.length; j++) {
      const a = objects[i],
        b = objects[j];
      if (
        solid(a) &&
        solid(b) &&
        contains(a, b.x, b.y, Math.min(b.width, b.height) / 2 - 2)
      )
        errors.push(`${a.id} / ${b.id}: 충돌 물체가 겹칩니다.`);
    }
  if (["zone", "boss"].includes(t.goal) && t.amount !== 1)
    errors.push("구역/보스 목표 수치는 1이어야 합니다.");
  if (
    t.goal === "hits" &&
    !objects.some((o) => ["target", "bumper"].includes(o.kind))
  )
    errors.push("타격 목표에는 타겟/범퍼가 필요합니다.");
  if (t.goal === "boss" && !objects.some((o) => o.kind === "boss"))
    errors.push("보스 목표에는 보스가 필요합니다.");
  if (
    t.goal === "kills" &&
    !objects.some((o) => o.kind === "unit" && o.side === "enemy")
  )
    errors.push("처치 목표에는 적 병력이 필요합니다.");
  if (
    t.goal === "zone" &&
    !objects.some((o) => o.kind === "decoration" && o.type === "goal")
  )
    errors.push("도달 목표에는 goal 구역이 필요합니다.");
  if (
    t.goal === "resources" &&
    !objects.some((o) => ["target", "bumper"].includes(o.kind))
  )
    errors.push("생산 목표에는 타격 생산시설이 필요합니다.");
  if (t.goal === "time" && t.amount > t.seconds)
    errors.push("방어 목표 시간이 제한 시간보다 깁니다.");
  // Conservative 20px grid: all solid objects inflated by the sphere radius.
  const start = [22, 3],
    queue = [start],
    seen = new Set<string>([start.join(",")]);
  let reaches = false;
  for (let i = 0; i < queue.length; i++) {
    const [cx, cy] = queue[i],
      x = 70 + cx * 20,
      y = 110 + cy * 20;
    if (y >= 690) reaches = true;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + dx,
        ny = cy + dy,
        key = `${nx},${ny}`;
      if (
        nx < 0 ||
        nx > 22 ||
        ny < 0 ||
        ny > 30 ||
        seen.has(key) ||
        objects.some(
          (o) => solid(o) && contains(o, 70 + nx * 20, 110 + ny * 20),
        )
      )
        continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
    void x;
  }
  if (!reaches)
    errors.push("상단 진입부에서 플리퍼까지 공이 통과할 경로가 없습니다.");
  if (
    objects.some((o) =>
      ["reflector", "portal", "wind", "accelerator", "slow"].includes(o.kind),
    )
  )
    warnings.push("동적 궤적은 직접 테스트에서 목표를 달성해야 검증됩니다.");
  else
    warnings.push(
      "정적 안전 검사를 통과해도 목표 달성 가능성은 직접 플레이로 확인해야 합니다.",
    );
  if (objects.filter((o) => o.kind === "boss").length > 1)
    errors.push("동시 보스는 1기만 지원합니다.");
  return {
    errors: [...new Set(errors)],
    warnings,
    fingerprint: tableFingerprint(t),
  };
}
export function newTable(template = "Empty"): TableDefinition {
  const id = `table-${Date.now().toString(36)}`,
    t: TableDefinition = {
      version: 1,
      id,
      name: template + " TABLE",
      region: "greenwood",
      preset: "classic",
      rule: "classicScore",
      goal: "score",
      amount: 1000,
      seconds: 180,
      balls: 3,
      objects: [],
    };
  if (template !== "Empty")
    t.objects = [
      {
        id: "target-1",
        kind: "target",
        name: "ROYAL TARGET",
        x: 280,
        y: 205,
        angle: 0,
        width: 60,
        height: 60,
        value: 100,
        type: "gold",
        side: "ally",
        link: "",
      },
    ];
  if (template === "Economic") {
    t.rule = "resource";
    t.goal = "resources";
    t.amount = 100;
    t.preset = "kingdom";
  }
  if (template === "Fortress") {
    t.rule = "war";
    t.goal = "time";
    t.amount = 60;
    t.preset = "kingdom";
  }
  if (template === "Magic") {
    t.preset = "magic";
    t.region = "arcane";
  }
  if (template === "Survival") {
    t.rule = "survival";
    t.goal = "time";
    t.amount = 120;
    t.preset = "kingdom";
  }
  if (template === "Puzzle") {
    t.rule = "puzzle";
    t.goal = "hits";
    t.amount = 1;
  }
  if (template === "Empty") {
    t.goal = "time";
    t.amount = 30;
  }
  return t;
}
export class TableCreator {
  tables: TableDefinition[] = [];
  verified: Record<string, string> = {};
  selected: TableDefinition = newTable();
  message = "";
  private expected: string | null = null;
  constructor(
    readonly storage: StorageLike | undefined = typeof localStorage ===
    "undefined"
      ? undefined
      : localStorage,
  ) {
    try {
      this.expected = storage?.getItem(TABLE_KEY) ?? null;
      const raw = JSON.parse(this.expected ?? "{}");
      this.tables = (Array.isArray(raw.tables) ? raw.tables : [])
        .slice(0, 20)
        .flatMap((t: unknown) => {
          try {
            return [parseTable(t)];
          } catch {
            return [];
          }
        });
      for (const t of this.tables)
        if (raw.verified?.[t.id] === tableFingerprint(t))
          this.verified[t.id] = raw.verified[t.id];
    } catch {
      this.message = "테이블 저장을 읽지 못했습니다. 원본은 유지됩니다.";
    }
  }
  save() {
    const result = validateTable(this.selected);
    if (result.errors.length) {
      this.message = result.errors.join("\n");
      return false;
    }
    const index = this.tables.findIndex((t) => t.id === this.selected.id);
    if (index < 0 && this.tables.length >= 20) {
      this.message = "저장 가능한 테이블은 20개입니다.";
      return false;
    }
    if (index >= 0) this.tables[index] = structuredClone(this.selected);
    else this.tables.push(structuredClone(this.selected));
    return this.persist();
  }
  private persist() {
    try {
      if ((this.storage?.getItem(TABLE_KEY) ?? null) !== this.expected) {
        this.message = "다른 창에서 테이블을 변경했습니다. 새로 불러오세요.";
        return false;
      }
      const raw = JSON.stringify({
        version: 1,
        tables: this.tables,
        verified: this.verified,
      });
      this.storage?.setItem(TABLE_KEY, raw);
      this.expected = this.storage ? raw : null;
      this.message = "저장했습니다.";
      return true;
    } catch {
      this.message = "브라우저 저장 공간에 기록하지 못했습니다.";
      return false;
    }
  }
  verifiedGoal(table: TableDefinition) {
    this.verified[table.id] = tableFingerprint(table);
    this.persist();
  }
  isVerified(table = this.selected) {
    return this.verified[table.id] === tableFingerprint(table);
  }
  import(json: string) {
    this.selected = importTable(json);
    this.selected.id = "table-" + Date.now().toString(36);
    return this.selected;
  }
  export() {
    return JSON.stringify(parseTable(this.selected), null, 2);
  }
}
