import { TARGETS, type TargetDefinition } from "../data/table";

export const RESOURCE_IDS = [
  "wood",
  "stone",
  "gold",
  "food",
  "mana",
  "energy",
] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];
export type ResourceAmounts = Record<ResourceId, number>;
export type Cost = Partial<ResourceAmounts>;
export const RESOURCES: Record<
  ResourceId,
  {
    name: string;
    english: string;
    icon: string;
    color: string;
    initial: number;
    capacity: number;
  }
> = {
  wood: {
    name: "목재",
    english: "WOOD",
    icon: "♧",
    color: "#c6986c",
    initial: 50,
    capacity: 500,
  },
  stone: {
    name: "석재",
    english: "STONE",
    icon: "⬡",
    color: "#b7c3c1",
    initial: 30,
    capacity: 500,
  },
  gold: {
    name: "금화",
    english: "GOLD",
    icon: "◈",
    color: "#edc36a",
    initial: 50,
    capacity: 1000,
  },
  food: {
    name: "식량",
    english: "FOOD",
    icon: "♨",
    color: "#a2c77e",
    initial: 30,
    capacity: 500,
  },
  mana: {
    name: "마력석",
    english: "MANA",
    icon: "✧",
    color: "#c39ce4",
    initial: 0,
    capacity: 100,
  },
  energy: {
    name: "코어 에너지",
    english: "ENERGY",
    icon: "ϟ",
    color: "#8dd8ef",
    initial: 100,
    capacity: 100,
  },
};
export interface FacilityConfig {
  id: string;
  name: string;
  english: string;
  resource: ResourceId;
  base: number;
  target: string;
}
export const FACILITIES: FacilityConfig[] = [
  {
    id: "lumber",
    name: "벌목장",
    english: "LUMBER CAMP",
    resource: "wood",
    base: 10,
    target: "forest",
  },
  {
    id: "quarry",
    name: "채석장",
    english: "STONE QUARRY",
    resource: "stone",
    base: 8,
    target: "stone",
  },
  {
    id: "mine",
    name: "금광",
    english: "GOLD MINE",
    resource: "gold",
    base: 6,
    target: "gold",
  },
  {
    id: "farm",
    name: "농장",
    english: "FARM",
    resource: "food",
    base: 12,
    target: "farm",
  },
  {
    id: "tower",
    name: "마력 수정탑",
    english: "MANA TOWER",
    resource: "mana",
    base: 3,
    target: "crystal",
  },
  {
    id: "sanctuary",
    name: "코어 충전소",
    english: "CORE SANCTUARY",
    resource: "energy",
    base: 5,
    target: "core",
  },
];
export const ECONOMY_TARGETS: TargetDefinition[] = [
  ...TARGETS.map((t) => (t.kind === "crystal" ? { ...t, color: 0xc39ce4 } : t)),
  {
    id: "farm",
    kind: "farm",
    name: "농장",
    x: 159,
    y: 555,
    radius: 26,
    points: 100,
    kick: 460,
    color: 0xa2c77e,
  },
  {
    id: "core",
    kind: "core",
    name: "코어 충전소",
    x: 345,
    y: 598,
    radius: 23,
    points: 200,
    kick: 480,
    color: 0x8dd8ef,
  },
];
export const ECONOMY = {
  comboWindowMs: 4000,
  cooldownMs: 420,
  maxMultiplier: 8,
  levelMultipliers: [1, 1.25, 1.6, 2, 2.5],
  storageMultipliers: [1, 2, 4, 7, 10],
  overloadHits: 7,
  overloadWindowMs: 8000,
  overloadDurationMs: 7000,
  overloadMultiplier: 0.25,
  specialCooldownMs: 20000,
  prosperityWindowMs: 15000,
  harvestWindowMs: 12000,
  relaunchCost: 20,
  goldRecoveryCost: 30,
  manaRecoveryCost: 8,
  recoveryEnergy: 20,
  royalDurationMs: 15000,
  royalMultiplier: 1.2,
  eventEveryHits: 18,
  upgradeCosts: [
    { wood: 50, stone: 30, gold: 40 },
    { wood: 100, stone: 70, gold: 80 },
    { wood: 200, stone: 140, gold: 160 },
    { wood: 350, stone: 250, gold: 300 },
  ] as Cost[],
  storageCosts: [
    { wood: 80, stone: 60, gold: 60 },
    { wood: 160, stone: 120, gold: 120 },
    { wood: 280, stone: 240, gold: 240 },
    { wood: 450, stone: 400, gold: 400 },
  ] as Cost[],
  royalReward: {
    wood: 20,
    stone: 20,
    gold: 30,
    food: 20,
    mana: 5,
    energy: 10,
  } as Cost,
  rankRewardGold: [0, 50, 100, 200, 400],
};
export const SPECIALS = [
  {
    id: "forest",
    name: "FOREST MASTER",
    text: "벌목장 5회",
    goal: 5,
    reward: { wood: 30 },
  },
  {
    id: "mining",
    name: "MINING MASTER",
    text: "채석장 ↔ 금광 교대 4회",
    goal: 4,
    reward: { stone: 20, gold: 15 },
  },
  {
    id: "harvest",
    name: "HARVEST FESTIVAL",
    text: "12초 안에 농장 5회",
    goal: 5,
    reward: { food: 40 },
  },
  {
    id: "magic",
    name: "MAGIC AWAKENING",
    text: "수정탑·충전소 각 2회",
    goal: 4,
    reward: { mana: 10, energy: 15 },
  },
  {
    id: "prosperity",
    name: "KINGDOM PROSPERITY",
    text: "15초 안에 모든 시설",
    goal: 6,
    reward: { wood: 30, stone: 30, gold: 30, food: 30, mana: 5, energy: 20 },
  },
] satisfies {
  id: string;
  name: string;
  text: string;
  goal: number;
  reward: Cost;
}[];
export type SpecialId = (typeof SPECIALS)[number]["id"];
export const PRODUCTION_EVENTS: {
  name: string;
  resource?: ResourceId;
  multiplier: number;
  duration: number;
  hint: string;
}[] = [
  {
    name: "GOLD RUSH",
    resource: "gold",
    multiplier: 2,
    duration: 20000,
    hint: "금광을 조준하세요 · 금화 생산 ×2",
  },
  {
    name: "BOUNTIFUL HARVEST",
    resource: "food",
    multiplier: 2,
    duration: 20000,
    hint: "농장을 조준하세요 · 식량 생산 ×2",
  },
  {
    name: "CRYSTAL SURGE",
    resource: "mana",
    multiplier: 2,
    duration: 15000,
    hint: "수정탑을 조준하세요 · 마력석 생산 ×2",
  },
  {
    name: "TIMBER BOOM",
    resource: "wood",
    multiplier: 2,
    duration: 20000,
    hint: "벌목장을 조준하세요 · 목재 생산 ×2",
  },
  {
    name: "ROYAL BLESSING",
    multiplier: 1.5,
    duration: 15000,
    hint: "모든 일반 자원 생산 ×1.5",
  },
];
export interface Trade {
  id: string;
  from: ResourceId;
  take: number;
  to: ResourceId;
  give: number;
  side: "buy" | "sell";
}
export const TRADES: Trade[] = [
  {
    id: "sell-wood",
    from: "wood",
    take: 20,
    to: "gold",
    give: 8,
    side: "sell",
  },
  {
    id: "sell-stone",
    from: "stone",
    take: 20,
    to: "gold",
    give: 10,
    side: "sell",
  },
  {
    id: "sell-food",
    from: "food",
    take: 30,
    to: "gold",
    give: 8,
    side: "sell",
  },
  {
    id: "sell-mana",
    from: "mana",
    take: 5,
    to: "gold",
    give: 15,
    side: "sell",
  },
  { id: "buy-wood", from: "gold", take: 15, to: "wood", give: 20, side: "buy" },
  {
    id: "buy-stone",
    from: "gold",
    take: 18,
    to: "stone",
    give: 20,
    side: "buy",
  },
  { id: "buy-food", from: "gold", take: 15, to: "food", give: 30, side: "buy" },
  { id: "buy-mana", from: "gold", take: 25, to: "mana", give: 5, side: "buy" },
];
export const RANKS = [
  "SETTLEMENT",
  "VILLAGE",
  "TOWN",
  "KINGDOM",
  "PROSPEROUS KINGDOM",
];
export const RANK_NAMES = [
  "개척 마을",
  "발전하는 마을",
  "번영하는 도시",
  "강력한 왕국",
  "번영하는 대왕국",
];
export const ECONOMY_TUTORIAL = [
  [
    "새로운 왕국의 시작",
    "Space를 충전해 스피어를 발사하세요. 첫 발사는 무료입니다.",
  ],
  ["숲의 선물", "왼쪽 위 벌목장을 맞혀 목재를 생산하세요."],
  ["왕국의 기초", "오른쪽 위 채석장에서 석재를 생산하세요."],
  ["황금빛 원정", "중앙 금광을 조준해 금화를 획득하세요."],
  [
    "첫 시설 강화",
    "하단 생산시설 메뉴에서 시설을 강화하세요. 메뉴를 열면 공이 멈춥니다.",
  ],
  ["왕실 시장", "시장에서 남는 자원을 판매하거나 필요한 자원을 구매하세요."],
  ["충분한 저장 공간", "창고 메뉴에서 용량과 누적 생산을 살펴보세요."],
  [
    "다음 원정을 위한 힘",
    "청색 코어 충전소를 타격하거나 재발사 화면에서 에너지를 충전하세요.",
  ],
  [
    "다채로운 생산",
    "특수 생산 콤보를 달성해 추가 보상을 받으세요. 목표는 콤보 메뉴에서 볼 수 있어요.",
  ],
  [
    "자유롭게 번영하세요",
    "필요한 자원의 시설을 조준하고, 왕국의 다음 발전 등급을 향해 나아가세요.",
  ],
];
