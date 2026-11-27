import type {
  ModeId,
  ModeOptions,
  PhysicsSettings,
  SandboxSettings,
  ModeReward,
  StartKind,
} from "../modes/types";
export const MODE_VERSION = "0.8.0";
export const MODE_CATALOG: {
  id: ModeId;
  name: string;
  group: string;
  crest: string;
  minutes: string;
  description: string;
  difficulty: string;
}[] = [
  {
    id: "survival",
    name: "SURVIVAL",
    group: "STRATEGY & WAR",
    crest: "⚑",
    minutes: "15–60+분",
    description:
      "웨이브를 막고 세 가지 보상 중 하나를 선택하세요. 왕궁이 무너지면 기록이 남습니다.",
    difficulty: "선택",
  },
  {
    id: "sandbox",
    name: "SANDBOX",
    group: "CREATIVE & PUZZLE",
    crest: "⚒",
    minutes: "자유",
    description: "분리된 자원으로 건설·물리·전투·마법을 실험합니다.",
    difficulty: "자유 설정",
  },
  {
    id: "bossRush",
    name: "BOSS RUSH",
    group: "STRATEGY & WAR",
    crest: "♛",
    minutes: "20–40분",
    description: "왕국과 생존 병력을 유지하며 여덟 보스를 연속 공략하세요.",
    difficulty: "선택",
  },
  {
    id: "puzzle",
    name: "PINBALL PUZZLES",
    group: "CREATIVE & PUZZLE",
    crest: "◇",
    minutes: "1–5분",
    description: "제한된 공과 반사·순서·포털 목표로 물리를 익히세요.",
    difficulty: "BEGINNER → MASTER",
  },
  {
    id: "roguelike",
    name: "ROGUELIKE CONQUEST",
    group: "STRATEGY & WAR",
    crest: "✧",
    minutes: "25–50분",
    description: "분기 경로, 한정 강화와 유물로 새로운 왕국을 완성하세요.",
    difficulty: "선택",
  },
  {
    id: "customTable",
    name: "TABLE CREATOR",
    group: "CREATIVE & PUZZLE",
    crest: "▦",
    minutes: "자유",
    description: "안전 검사를 거친 로컬 테이블을 만들고 JSON으로 공유하세요.",
    difficulty: "창작",
  },
  {
    id: "daily",
    name: "DAILY CHALLENGE",
    group: "CLASSIC & CHALLENGE",
    crest: "☀",
    minutes: "3–10분",
    description: "같은 UTC 날짜와 버전에는 같은 규칙. 로컬 기록에 도전하세요.",
    difficulty: "고정",
  },
  {
    id: "weekly",
    name: "WEEKLY CHALLENGE",
    group: "CLASSIC & CHALLENGE",
    crest: "☷",
    minutes: "15–45분",
    description: "ISO 주차로 생성되는 전쟁·마법·보스 장기 도전입니다.",
    difficulty: "고정",
  },
  {
    id: "customWar",
    name: "CUSTOM WAR",
    group: "STRATEGY & WAR",
    crest: "⚔",
    minutes: "10–25분",
    description: "지역·시설·군대·마법 제한을 직접 설정한 별도 기록 전쟁입니다.",
    difficulty: "자유 설정",
  },
  {
    id: "spectator",
    name: "AI vs AI",
    group: "STRATEGY & WAR",
    crest: "◉",
    minutes: "자유",
    description:
      "두 왕국의 경제와 전술을 관전합니다. 경쟁 보상은 지급하지 않습니다.",
    difficulty: "관전",
  },
];
export const STARTS: Record<
  StartKind,
  {
    name: string;
    description: string;
    resources: Partial<
      Record<"wood" | "stone" | "gold" | "food" | "mana", number>
    >;
    units: number;
    buildings: string[];
  }
> = {
  balanced: {
    name: "BALANCED",
    description: "균형 자원 · 검병 3기",
    resources: { wood: 300, stone: 240, gold: 280, food: 280, mana: 15 },
    units: 3,
    buildings: [],
  },
  economic: {
    name: "ECONOMIC",
    description: "목재·식량과 벌목장 · 초기 병력 없음",
    resources: { wood: 380, stone: 200, gold: 230, food: 350, mana: 10 },
    units: 0,
    buildings: ["lumber"],
  },
  fortress: {
    name: "FORTRESS",
    description: "성벽 2개 · 초기 식량 감소",
    resources: { wood: 240, stone: 280, gold: 260, food: 220, mana: 10 },
    units: 1,
    buildings: ["wall", "wall"],
  },
  military: {
    name: "MILITARY",
    description: "검병 8기 · 초기 목재 감소",
    resources: { wood: 220, stone: 220, gold: 230, food: 320, mana: 10 },
    units: 8,
    buildings: [],
  },
  magic: {
    name: "MAGIC",
    description: "원소 대장간·화염 연구 · 마력석",
    resources: { wood: 240, stone: 200, gold: 200, food: 220, mana: 65 },
    units: 0,
    buildings: ["elementalForge"],
  },
};
export const DEFAULT_PHYSICS: PhysicsSettings = {
  gravity: 1,
  mass: 1,
  restitution: 1,
  friction: 1,
  maxSpeed: 1380,
  flipper: 1,
  bumper: 1,
  accelerator: 1,
  slow: 1,
  wind: 0,
  balls: 1,
};
export const PHYSICS_LIMITS: Record<keyof PhysicsSettings, [number, number]> = {
  gravity: [0.2, 1.6],
  mass: [0.5, 2],
  restitution: [0.4, 1.25],
  friction: [0.2, 3],
  maxSpeed: [500, 1380],
  flipper: [0.6, 1.3],
  bumper: [0.5, 1.4],
  accelerator: [0.5, 1.4],
  slow: [0.5, 2],
  wind: [-0.00015, 0.00015],
  balls: [1, 10],
};
export const DEFAULT_SANDBOX: SandboxSettings = {
  rescueShots: 2,
  unlimited: true,
  production: 1,
  cost: 0,
  storage: false,
  population: 100,
  training: 1,
  ai: false,
  movement: true,
  allMagic: true,
  infiniteMana: true,
  infiniteCharge: true,
  cooldowns: false,
  enemyKingdom: true,
  invasion: false,
  destruction: true,
  castleDamage: false,
  allyInvincible: false,
  enemyInvincible: false,
  endConditions: false,
};
export function defaultModeOptions(): ModeOptions {
  return {
    allyFaction: "iron",
    allyDifficulty: "normal",
    region: "greenwood",
    difficulty: "normal",
    start: "balanced",
    general: "guardian",
    equipment: "",
    magic: ["fire", "ice"],
    variant: "standard",
    seed: Date.now() >>> 0,
    preparation: 60,
    limit: 900,
    enemy: "crimson",
    warType: "conquest",
    castleLevel: 2,
    resources: 300,
    units: 3,
    buildingLimit: 20,
    magicEnabled: true,
    multiEnabled: true,
    stormEnabled: true,
    population: 60,
    puzzle: 0,
    tableId: "",
    physics: { ...DEFAULT_PHYSICS },
    sandbox: { ...DEFAULT_SANDBOX },
  };
}
export const MODE_REWARDS: ModeReward[] = [
  {
    id: "materials",
    name: "건축 보급",
    description: "목재 90 · 석재 70",
    category: "resource",
  },
  {
    id: "gold",
    name: "왕실 금고",
    description: "금화 120",
    category: "resource",
  },
  { id: "food", name: "풍년", description: "식량 150", category: "resource" },
  {
    id: "castle",
    name: "왕궁 복구",
    description: "왕궁 최대 체력의 25% 회복",
    category: "recovery",
  },
  {
    id: "walls",
    name: "성벽 수리",
    description: "살아 있는 아군 방어시설 35% 회복",
    category: "recovery",
  },
  {
    id: "mana",
    name: "마력 결정",
    description: "마력석 35",
    category: "magic",
  },
  {
    id: "energy",
    name: "코어 충전",
    description: "코어 에너지 50",
    category: "recovery",
  },
  {
    id: "reinforcements",
    name: "왕실 지원군",
    description: "검병 4기 · 안전 인구 상한 적용",
    category: "army",
  },
  {
    id: "production",
    name: "생산 개선",
    description: "생산 +5% (최대 30%)",
    category: "upgrade",
  },
  {
    id: "attack",
    name: "병기 강화",
    description: "아군 피해 +5% (최대 30%)",
    category: "upgrade",
  },
  {
    id: "defense",
    name: "방어 훈련",
    description: "아군 받는 피해 −4% (최대 24%)",
    category: "upgrade",
  },
  {
    id: "charge",
    name: "마법 충전",
    description: "마법 충전 +50",
    category: "magic",
  },
  {
    id: "multi",
    name: "분열 준비",
    description: "멀티볼 게이지 +70 · 기존 시설/비용 필요",
    category: "magic",
  },
  {
    id: "element",
    name: "원소 지식",
    description: "새 특수 공 연구 1개 해금 · 시설 필요",
    category: "magic",
  },
];
export const WAR_VARIANTS = [
  "standard",
  "noMagic",
  "allMagic",
  "limitedArmy",
  "fortress",
  "economy",
  "rapid",
  "long",
  "oneCore",
  "random",
] as const;
export const RUSH_VARIANTS = [
  "standard",
  "random",
  "elemental",
  "siege",
  "legendary",
] as const;
