import type { Cost } from "./economy";
import type { UnitKind, Formation, Command } from "../army/types";
export interface UnitConfig {
  id: UnitKind;
  name: string;
  icon: string;
  hp: number;
  attack: number;
  armor: number;
  speed: number;
  interval: number;
  range: number;
  detect: number;
  crit: number;
  splash: number;
  heal: number;
  charge: number;
  population: number;
  seconds: number;
  cost: Cost;
  building: string;
  rank: number;
  level: number;
  description: string;
}
const u = (
  id: UnitKind,
  name: string,
  icon: string,
  hp: number,
  attack: number,
  armor: number,
  speed: number,
  interval: number,
  range: number,
  population: number,
  seconds: number,
  cost: Cost,
  building: string,
  rank: number,
  description: string,
  extra: Partial<UnitConfig> = {},
): UnitConfig => ({
  id,
  name,
  icon,
  hp,
  attack,
  armor,
  speed,
  interval,
  range,
  population,
  seconds,
  cost,
  building,
  rank,
  description,
  detect: 260,
  crit: 0.05,
  splash: 0,
  heal: 0,
  charge: 0,
  level: 1,
  ...extra,
});
export const UNITS: UnitConfig[] = [
  u(
    "swordsman",
    "검병",
    "⚔",
    100,
    15,
    5,
    60,
    1,
    22,
    1,
    12,
    { wood: 5, gold: 10, food: 15 },
    "barracks",
    1,
    "균형 잡힌 근접 전사 · 창병에 ×1.25",
  ),
  u(
    "spearman",
    "창병",
    "♜",
    85,
    18,
    4,
    55,
    1.2,
    32,
    1,
    15,
    { wood: 10, gold: 12, food: 15 },
    "barracks",
    2,
    "기병에 ×1.75 · 궁수에 취약",
  ),
  u(
    "archer",
    "궁수",
    "➶",
    60,
    14,
    2,
    55,
    1.3,
    150,
    1,
    15,
    { wood: 15, gold: 15, food: 12 },
    "archery",
    2,
    "화살 사거리 150 · 창병에 ×1.3 · 근접 취약",
  ),
  u(
    "guard",
    "방패병",
    "⬟",
    220,
    8,
    18,
    35,
    1.5,
    24,
    2,
    22,
    { wood: 5, stone: 15, gold: 25, food: 20 },
    "barracks",
    3,
    "아군 전방 보호 · 일반 원거리 피해 35% 감소",
    { level: 2 },
  ),
  u(
    "knight",
    "기병",
    "♞",
    160,
    30,
    8,
    100,
    1.2,
    26,
    3,
    25,
    { wood: 15, stone: 5, gold: 40, food: 30 },
    "stable",
    3,
    "첫 공격 돌격 +20 · 궁수/마법사 우선 · 창병 취약",
    { charge: 20 },
  ),
  u(
    "mage",
    "마법사",
    "✧",
    70,
    35,
    2,
    45,
    2,
    135,
    2,
    30,
    { wood: 10, gold: 35, food: 15, mana: 8 },
    "magicSchool",
    4,
    "반경 38 광역 마법 · 방패병에 ×1.3",
    { splash: 38 },
  ),
  u(
    "healer",
    "치유사",
    "✚",
    80,
    0,
    3,
    50,
    2,
    115,
    2,
    25,
    { wood: 5, gold: 25, food: 15, mana: 5 },
    "temple",
    4,
    "부상 아군 우선 · 체력 22 회복 · 공격하지 않음",
    { heal: 22 },
  ),
  u(
    "catapult",
    "투석기",
    "⚙",
    180,
    60,
    5,
    25,
    3.5,
    210,
    4,
    40,
    { wood: 60, stone: 40, gold: 60, food: 20 },
    "siegeWorkshop",
    5,
    "반경 48 포물선 포격 · 근접 취약",
    { splash: 48 },
  ),
];
export const unitConfig = (id: UnitKind) => UNITS.find((u) => u.id === id)!;
export const POPULATION = [15, 25, 40, 60, 80];
export const QUEUE_LIMIT = [5, 6, 7, 8, 10];
export const TRAINING_SPEED = [1, 1.2, 1.4, 1.7, 2];
export const COMMANDS: Record<Command, string> = {
  attack: "공격",
  defend: "방어",
  hold: "위치 유지",
  retreat: "후퇴",
  regroup: "재집결",
};
export const FORMATIONS: Record<
  Formation,
  { name: string; rank: number; description: string }
> = {
  standard: {
    name: "기본 진형",
    rank: 1,
    description: "근접 전방 · 원거리 후방",
  },
  shield: {
    name: "방패벽",
    rank: 2,
    description: "방패병 전방 · 받는 피해 −10%",
  },
  spear: { name: "대기병", rank: 2, description: "창병 전방 · 기병 방어 +15%" },
  assault: {
    name: "돌격",
    rank: 3,
    description: "기병·검병 전방 · 공격 +10%, 방어 −10%",
  },
  ranged: {
    name: "원거리",
    rank: 4,
    description: "원거리 사거리 +10% · 근접 호위",
  },
  siege: {
    name: "공성",
    rank: 5,
    description: "투석기 후방 · 방패 전방 · 포격 +10%",
  },
};
export const RESEARCH = [
  {
    id: "weapons",
    name: "무기 강화",
    building: "smith",
    rank: 3,
    description: "모든 공격력 단계당 +8%",
  },
  {
    id: "armor",
    name: "철제 갑옷",
    building: "smith",
    rank: 3,
    description: "방어력 단계당 +3",
  },
  {
    id: "tactics",
    name: "진형 전술",
    building: "academy",
    rank: 3,
    description: "집결 속도 +10% · 공격 +3% / 단계",
  },
  {
    id: "magic",
    name: "마법 연구",
    building: "magicSchool",
    rank: 4,
    description: "마법 피해·범위 +10% / 단계",
  },
  {
    id: "healing",
    name: "치유 연구",
    building: "temple",
    rank: 4,
    description: "치유 효과 +15% / 단계",
  },
];
export const researchCost = (level: number): Cost => ({
  wood: 40 * level,
  stone: 30 * level,
  gold: 60 * level,
  mana: 5 * level,
});
export const TRAININGS = [
  {
    name: "BASIC COMBAT",
    rank: 1,
    waves: [{ swordsman: 3 }],
    reward: { gold: 40, food: 30 },
  },
  {
    name: "RANGED DEFENSE",
    rank: 2,
    waves: [{ swordsman: 4, archer: 2 }],
    reward: { gold: 70, wood: 40, food: 30 },
  },
  {
    name: "CAVALRY ASSAULT",
    rank: 3,
    waves: [{ knight: 3, swordsman: 4 }],
    reward: { gold: 100, stone: 50, food: 50 },
  },
  {
    name: "COMBINED ARMS",
    rank: 4,
    waves: [{ swordsman: 5, archer: 4, knight: 2, guard: 2 }],
    reward: { gold: 160, mana: 15, food: 80 },
  },
  {
    name: "ROYAL CHALLENGE",
    rank: 5,
    waves: [
      { swordsman: 4, archer: 3, healer: 1 },
      { guard: 2, knight: 2, mage: 2, catapult: 1 },
    ],
    reward: { gold: 250, mana: 30, food: 100 },
  },
] as const;
export const MILITARY_COMBOS = [
  {
    id: "recruitment",
    name: "ROYAL RECRUITMENT",
    description: "군사시설 연속 5회 / 10초 · 생산 +30% 10초",
    duration: 10000,
  },
  {
    id: "iron",
    name: "IRON ARMY",
    description: "병영↔대장간 교대 2회씩 · 공격 +15% 12초",
    duration: 12000,
  },
  {
    id: "shield",
    name: "SHIELD OF THE KINGDOM",
    description: "성벽·감시탑·궁수탑 12초 내 · 피해 −20% 10초",
    duration: 10000,
  },
  {
    id: "holy",
    name: "HOLY BLESSING",
    description: "신전·코어 충전소 각각 2회 · 체력 10% 회복",
    duration: 1000,
  },
  {
    id: "cavalry",
    name: "CAVALRY CHARGE",
    description: "마구간·강화 범퍼 각각 2회 · 다음 돌격 +50%",
    duration: 15000,
  },
  {
    id: "arcane",
    name: "ARCANE ASSAULT",
    description: "마법학교→마력 수정탑 · 다음 마법 공격 +30%",
    duration: 15000,
  },
  {
    id: "offensive",
    name: "ROYAL OFFENSIVE",
    description:
      "20초 내 경제+군사 서로 다른 6시설 · 공격 +15%, 생산 +20% 15초",
    duration: 15000,
  },
];
export const ARMY_TUTORIAL = [
  "핀볼로 자원을 모으고 B에서 병영을 건설하세요.",
  "병영에서 검병을 생산하세요. 비용은 등록 때 한 번 차감됩니다.",
  "병영을 타격하면 현재 훈련 진행률이 최소 15% 증가합니다.",
  "첫 병사가 출격했습니다. 추가 병력을 모으세요.",
  "진형과 명령을 정하고 연습 전투를 시작하세요.",
  "1 공격 · 2 방어. 스피어를 적에게 맞혀 전투를 지원하세요.",
  "결과를 확인하세요. 군사 도전에서는 실제 병력이 손실됩니다.",
];
