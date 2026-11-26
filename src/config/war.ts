import type { Cost } from "./economy";
import { ECONOMY_TARGETS } from "./economy";
import type {
  Difficulty,
  EnemyKind,
  WarOptions,
  WarOrder,
  WarPhase,
} from "../war/types";
import type { UnitKind } from "../army/types";
export const WAR_TARGETS = ECONOMY_TARGETS.filter((t) => t.kind !== "palace");
export const CASTLE_HP = [1000, 1500, 2200, 3200, 5000];
export const DIFFICULTIES: Record<
  Difficulty,
  { name: string; prep: number; production: number; aggression: number }
> = {
  beginner: { name: "BEGINNER", prep: 180, production: 0.7, aggression: 0.75 },
  normal: { name: "NORMAL", prep: 120, production: 1, aggression: 1 },
  hard: { name: "HARD", prep: 90, production: 1.15, aggression: 1.15 },
  expert: { name: "EXPERT", prep: 75, production: 1.3, aggression: 1.3 },
  legendary: {
    name: "LEGENDARY",
    prep: 60,
    production: 1.45,
    aggression: 1.45,
  },
};
export const ENEMIES: Record<
  EnemyKind,
  {
    name: string;
    title: string;
    description: string;
    units: UnitKind[];
    builds: string[];
    economy: number;
    attack: number;
    commander: UnitKind;
  }
> = {
  iron: {
    name: "철의 왕국",
    title: "IRON GENERAL",
    description: "성벽·방패병·투석기 중심. 느린 발전과 강한 방어.",
    units: ["guard", "swordsman", "catapult", "spearman"],
    builds: ["wall", "archerTower", "smith", "siegeWorkshop", "granary"],
    economy: 0.9,
    attack: 1.2,
    commander: "guard",
  },
  crimson: {
    name: "진홍의 왕국",
    title: "CRIMSON WARLORD",
    description: "검병·기병의 빠른 공세. 식량과 후방 방어가 약점.",
    units: ["swordsman", "knight", "swordsman", "archer"],
    builds: ["stable", "barracks", "archery", "granary"],
    economy: 1,
    attack: 0.75,
    commander: "knight",
  },
  golden: {
    name: "황금의 왕국",
    title: "GOLDEN COMMANDER",
    description: "생산 강화·시장 거래 후 대규모 예비대. 초반 군사력이 약점.",
    units: ["archer", "guard", "knight", "catapult"],
    builds: ["warehouse", "market", "archery", "stable", "siegeWorkshop"],
    economy: 1.2,
    attack: 1.3,
    commander: "guard",
  },
  arcane: {
    name: "마법의 왕국",
    title: "ARCANE SOVEREIGN",
    description: "마법사·치유 지원과 광역 공격. 마력석 공급에 의존.",
    units: ["mage", "healer", "swordsman", "archer"],
    builds: ["magicSchool", "temple", "archery", "academy"],
    economy: 1,
    attack: 1.1,
    commander: "mage",
  },
  shadow: {
    name: "그림자의 왕국",
    title: "SHADOW MARSHAL",
    description: "측면 기습과 경제시설 습격. 정면 방어선에 취약.",
    units: ["knight", "archer", "spearman", "swordsman"],
    builds: ["stable", "archery", "watchtower", "academy"],
    economy: 0.95,
    attack: 0.85,
    commander: "knight",
  },
};
export const WAR_ORDERS: Record<WarOrder, string> = {
  defend: "왕국 방어",
  frontline: "전방 공격",
  economy: "경제시설 공격",
  military: "군사시설 공격",
  siege: "성벽 공성",
  castle: "왕궁 공격",
  retreat: "후퇴",
};
export const PHASE_NAMES: Record<WarPhase, string> = {
  preparation: "PREPARATION · 전쟁 준비",
  reconnaissance: "RECONNAISSANCE · 정찰",
  border: "BORDER CONFLICT · 국경 충돌",
  war: "FULL WAR · 전면전",
  siege: "SIEGE · 공성전",
  conquest: "FINAL CONQUEST · 최종 정복",
};
export const THREATS = ["PEACEFUL", "ALERT", "DANGER", "WAR", "CRITICAL"];
export const BUILDING_HEALTH: Record<string, [number, number]> = {
  lumber: [250, 5],
  farm: [200, 3],
  quarry: [350, 12],
  mine: [350, 10],
  warehouse: [400, 10],
  market: [300, 5],
  barracks: [500, 15],
  archerTower: [450, 15],
  watchtower: [350, 10],
  wall: [600, 25],
  smith: [450, 15],
  tower: [400, 10],
  siegeWorkshop: [500, 12],
};
export const SIEGE_MULTIPLIER: Record<UnitKind, number> = {
  swordsman: 0.7,
  spearman: 0.5,
  archer: 0.3,
  guard: 0.4,
  knight: 0.5,
  mage: 1,
  healer: 0,
  catapult: 3,
};
export const CASTLE_COST: Cost = { wood: 120, stone: 150, gold: 100 };
export const ENEMY_SLOTS = [
  { x: 170, y: 190 },
  { x: 230, y: 190 },
  { x: 370, y: 190 },
  { x: 430, y: 190 },
  { x: 240, y: 265 },
  { x: 360, y: 265 },
  { x: 170, y: 260 },
  { x: 430, y: 260 },
  { x: 210, y: 115 },
  { x: 390, y: 115 },
];
export const DEFAULT_WAR: WarOptions = {
  name: "GREENWOOD",
  crest: "crown",
  enemy: "iron",
  difficulty: "normal",
  type: "conquest",
  resources: "standard",
  preparation: 120,
  limit: 0,
  tutorial: true,
};
export const WAR_COMBOS = [
  ["wallBreaker", "WALL BREAKER", "성벽 4회 / 10초 · 다음 타격 +50%"],
  ["royalDefense", "ROYAL DEFENSE", "아군 방어시설 → 적군 · 10초 방어 강화"],
  [
    "counter",
    "COUNTER ATTACK",
    "침공 중 적군 4회 / 12초 · 10초 공격·이동 강화",
  ],
  ["economy", "WAR ECONOMY", "경제·군사시설 교대 4회 · 15초 생산 +20%"],
  [
    "siegeMaster",
    "SIEGE MASTER",
    "공성 작업장 → 성벽 → 공성 작업장 → 성벽 · 15초 공성 +25%",
  ],
  [
    "breaker",
    "KINGDOM BREAKER",
    "서로 다른 적 방어시설 3개 / 15초 · 양쪽 사기 변화",
  ],
] as const;
export const WAR_TUTORIAL = [
  "적 왕국을 선택했습니다. 위쪽 적 왕궁과 왼쪽 아래 아군 왕궁을 확인하세요.",
  "준비 시간에는 양쪽 모두 피해를 주지 못합니다. Space로 생산시설을 타격하세요.",
  "U에서 병력을 훈련하고 B에서 방어시설을 준비하세요.",
  "적 정찰과 침공 경고를 확인하세요. 오래된 정보는 추정치입니다.",
  "왕국 방어 명령과 스피어 타격으로 첫 침공을 막으세요.",
  "피해를 입었다면 수리 패널에서 비용을 확인하고 복구하세요.",
  "공격로를 선택해 반격하세요. 성벽 공성과 경제시설 습격을 비교해 보세요.",
  "성벽·궁수탑을 파괴하면 왕궁의 보호가 약해집니다.",
  "적 왕궁을 파괴하세요. 전쟁 결과와 기록이 한 번만 저장됩니다.",
];
