import type { EnemyKind } from "../war/types";
import type { UnitKind } from "../army/types";
import type { CampaignDifficulty, MissionKind } from "../campaign/types";
export interface RegionConfig {
  id: string;
  name: string;
  english: string;
  crest: string;
  color: string;
  x: number;
  y: number;
  specialty: string;
  core: string;
  enemy: EnemyKind;
  boss: string;
  unit: UnitKind;
  gravity: number;
  friction: number;
  terrain: string;
  strategy: string;
  story: string;
}
export const REGIONS: RegionConfig[] = [
  {
    id: "greenwood",
    name: "초록 평원",
    english: "GREENWOOD PLAINS",
    crest: "♧",
    color: "#74b979",
    x: 210,
    y: 530,
    specialty: "GREENWOOD TIMBER",
    core: "LIFE",
    enemy: "crimson",
    boss: "CRIMSON BARON",
    unit: "knight",
    gravity: 1,
    friction: 1,
    terrain: "표준 중력 · 넓은 통로 · 목재 다리",
    strategy: "벌목과 농장으로 발전하고 창병으로 기병을 막으세요.",
    story:
      "ROYAL ADVISOR · 작은 왕국의 첫 번째 깃발입니다. 남작의 요새에서 생명의 코어를 되찾으십시오.",
  },
  {
    id: "shadow",
    name: "검은 숲",
    english: "SHADOW FOREST",
    crest: "♠",
    color: "#478f88",
    x: 155,
    y: 345,
    specialty: "SHADOWWOOD",
    core: "SHADOW",
    enemy: "shadow",
    boss: "SHADOW LORD",
    unit: "knight",
    gravity: 1,
    friction: 1.1,
    terrain: "나무뿌리 반사판 · 움직이는 가지 · 정찰 목표",
    strategy: "정찰 수정을 맞혀 분신 사이의 진짜 군주를 드러내세요.",
    story:
      "GENERAL ALDRIC · 안개 아래에서 병력이 갈라집니다. 양쪽 길을 살피고 진짜 깃발을 찾으십시오.",
  },
  {
    id: "iron",
    name: "철의 산맥",
    english: "IRON MOUNTAINS",
    crest: "⬡",
    color: "#92a2b2",
    x: 430,
    y: 475,
    specialty: "IRON ORE",
    core: "STEEL",
    enemy: "iron",
    boss: "IRON TITAN",
    unit: "guard",
    gravity: 1.1,
    friction: 1,
    terrain: "금속 범퍼 · 광산 회전 장치 · 중력 1.1배",
    strategy: "공성구·투석기로 장갑을 깨고 노출된 코어에 집중하세요.",
    story:
      "GENERAL ALDRIC · 철의 문은 굳건하지만 광산의 심장은 하나입니다. 장갑을 벗기면 길이 열립니다.",
  },
  {
    id: "desert",
    name: "황금 사막",
    english: "GOLDEN DESERT",
    crest: "☀",
    color: "#d9b164",
    x: 645,
    y: 485,
    specialty: "SUNSTONE",
    core: "SUN",
    enemy: "golden",
    boss: "SUN PHARAOH",
    unit: "mage",
    gravity: 1,
    friction: 1.5,
    terrain: "모래 감속 · 오아시스 · 예측 가능한 모래바람",
    strategy: "태양석을 맞혀 보호막을 약화하고 수송대를 보호하세요.",
    story:
      "MERCHANT DARIUS · 오아시스의 길을 지키면 황금의 도시가 열립니다. 태양석은 왕의 보호막과 이어져 있습니다.",
  },
  {
    id: "frost",
    name: "얼어붙은 왕국",
    english: "FROZEN KINGDOM",
    crest: "❄",
    color: "#a0d7e9",
    x: 390,
    y: 235,
    specialty: "FROST CRYSTAL",
    core: "FROST",
    enemy: "iron",
    boss: "FROST QUEEN",
    unit: "mage",
    gravity: 1,
    friction: 0.35,
    terrain: "얼음 가속 · 눈 감속 · 파괴 가능한 얼음",
    strategy: "화염구로 냉기 장벽을 깨고 식량을 비축하세요.",
    story:
      "MAGE LYRA · 서리 아래에도 생명은 남아 있습니다. 얼음은 빠른 길이지만 눈밭에서는 힘을 되찾아야 합니다.",
  },
  {
    id: "volcano",
    name: "화산 제국",
    english: "VOLCANIC EMPIRE",
    crest: "▲",
    color: "#e07e59",
    x: 730,
    y: 270,
    specialty: "MAGMA CORE",
    core: "FLAME",
    enemy: "crimson",
    boss: "MAGMA DRAGON",
    unit: "knight",
    gravity: 1,
    friction: 0.9,
    terrain: "예고되는 열기 분출 · 용암 반사 · 이동 암석",
    strategy: "분출 방향을 보고 얼음구와 공성구로 가슴의 코어를 공략하세요.",
    story:
      "GENERAL ALDRIC · 붉은 하늘이 공격을 예고합니다. 용의 숨결이 잦아들 때 전군을 전진시키십시오.",
  },
  {
    id: "arcane",
    name: "마법 왕국",
    english: "ARCANE REALM",
    crest: "✧",
    color: "#b69ee4",
    x: 160,
    y: 145,
    specialty: "ARCANE ESSENCE",
    core: "ARCANA",
    enemy: "arcane",
    boss: "THE ARCHMAGE",
    unit: "mage",
    gravity: 1,
    friction: 0.8,
    terrain: "안전 출구 포털 · 제한 중력장 · 마법 반사판",
    strategy:
      "보호막 색과 발전기를 확인하세요. 스틸과 병력만으로도 돌파할 수 있습니다.",
    story:
      "MAGE LYRA · 공간의 문은 쌍을 이룹니다. 일곱 번째 파편이 모이면 황제의 장막을 걷을 수 있습니다.",
  },
  {
    id: "dark",
    name: "암흑 제국",
    english: "DARK EMPIRE",
    crest: "♛",
    color: "#ae798d",
    x: 625,
    y: 100,
    specialty: "DARK CORE FRAGMENT",
    core: "DARKNESS",
    enemy: "shadow",
    boss: "DARK EMPEROR",
    unit: "guard",
    gravity: 1,
    friction: 1,
    terrain: "5단계 전장 · 제한된 지역 장치 조합",
    strategy:
      "외곽 방어→군단→속성 혼돈→코어 보호시설→최후의 폭풍. 모든 단계에 기본 공략 경로가 있습니다.",
    story:
      "DARK EMPEROR · 흩어진 왕관을 하나로 만들겠다는 자인가. 마지막 파편이 누구의 것인지 증명하라.",
  },
];
export const region = (id: string) => REGIONS.find((r) => r.id === id)!;
export interface StageConfig {
  id: string;
  region: string;
  index: number;
  name: string;
  mission: MissionKind;
  goal: number;
  seconds: number;
  limit: number;
  resource?: "wood" | "gold" | "stone" | "mana";
  initial: {
    wood: number;
    stone: number;
    gold: number;
    food: number;
    mana: number;
    energy: number;
  };
  rank: number;
  star2: string;
  star3: string;
  challenge: "combo" | "losses" | "magic" | "speed";
  reward: number;
  points: number;
  recommended: number;
}
const names = [
  ["FIRST KINGDOM", "BORDER DEFENSE", "THE CRIMSON BARON"],
  ["INTO THE MIST", "FOREST AMBUSH", "THE SHADOW LORD"],
  ["THE GREAT MINE", "FORTRESS OF STEEL", "THE IRON TITAN"],
  ["OASIS OF WEALTH", "THE GOLDEN TRADE WAR", "THE SUN PHARAOH"],
  ["FROZEN FRONTIER", "THE WINTER SIEGE", "THE FROST QUEEN"],
  ["LAND OF FIRE", "THE BURNING WAR", "THE MAGMA DRAGON"],
  ["THE ARCANE GATE", "WAR OF THE MAGES", "THE ARCHMAGE"],
  ["THE DARK FRONTIER", "THE LAST GREAT WAR", "THE DARK EMPEROR"],
];
const missions: MissionKind[][] = [
  ["development", "defense", "boss"],
  ["rescue", "defense", "boss"],
  ["resource", "siege", "boss"],
  ["resource", "escort", "boss"],
  ["resource", "survival", "boss"],
  ["magic", "conquest", "boss"],
  ["magic", "conquest", "boss"],
  ["siege", "conquest", "boss"],
];
export const STAGES: StageConfig[] = REGIONS.flatMap((r, i) =>
  [0, 1, 2].map((j) => ({
    id: `${i + 1}-${j + 1}`,
    region: r.id,
    index: j,
    name: names[i][j],
    mission: missions[i][j],
    goal:
      j === 2
        ? 1
        : i === 0 && j === 0
          ? 300
          : missions[i][j] === "siege"
            ? 2
            : missions[i][j] === "magic"
              ? 6
              : missions[i][j] === "resource"
                ? 180
                : 1,
    seconds: j === 1 ? 540 : 480,
    limit: j === 2 ? (i === 7 ? 2100 : 1500) : j === 1 ? 1500 : 900,
    resource: (i === 2 || i === 4 ? "stone" : i === 3 ? "gold" : "wood") as
      "wood" | "stone" | "gold",
    initial: {
      wood: 220 + i * 30,
      stone: 180 + i * 30,
      gold: 180 + i * 35,
      food: 180 + i * 30,
      mana: i * 10,
      energy: 100,
    },
    rank: Math.min(5, 1 + Math.floor(i / 2)),
    star2: "왕궁 체력 60% 이상 유지",
    star3: [
      "최대 핀볼 콤보 5 이상",
      "병력 손실 12기 이하",
      "제한 시간의 70% 이내 완료",
    ][j],
    challenge: (["combo", "losses", "speed"] as const)[j],
    reward: j === 2 ? 35 : 20,
    points: j === 2 ? 12 : 8,
    recommended: 300 + i * 500 + j * 250,
  })),
);
export const stage = (id: string) => STAGES.find((s) => s.id === id)!;
export const CAMPAIGN_DIFFICULTIES: Record<
  CampaignDifficulty,
  {
    name: string;
    prep: number;
    enemy: "beginner" | "normal" | "hard" | "legendary";
    initial: number;
  }
> = {
  story: { name: "STORY", prep: 180, enemy: "beginner", initial: 1.25 },
  normal: { name: "NORMAL", prep: 120, enemy: "normal", initial: 1 },
  hard: { name: "HARD", prep: 90, enemy: "hard", initial: 0.9 },
  legendary: { name: "LEGENDARY", prep: 60, enemy: "legendary", initial: 0.8 },
};
export const PRESTIGE_RANKS = [
  "PIONEER",
  "BARON",
  "LORD",
  "DUKE",
  "KING",
  "HIGH KING",
  "EMPEROR",
  "LEGENDARY EMPEROR",
];
export const prestigeRank = (points: number) =>
  Math.min(7, Math.floor(points / 150));
export const MISSION_NAMES: Record<MissionKind, string> = {
  development: "생산 300 + 경제시설 1개 건설",
  defense: "왕궁 방어",
  resource: "지역 자원 확보",
  siege: "적 성벽 2개 파괴",
  escort: "수송대 목적지 호위",
  rescue: "정찰 목표 3회 타격 후 아군 구출",
  survival: "지속 침공 생존",
  conquest: "적 왕궁 파괴",
  magic: "지역 장치 6회 유효 사용",
  boss: "지역 보스 처치",
};
