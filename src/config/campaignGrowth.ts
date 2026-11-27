export interface CampaignResearchConfig {
  id: string;
  branch: string;
  name: string;
  region: string;
  effect: string;
  max: number;
  points: number;
  specialty: number;
}
const tree = (branch: string, rows: string[][]): CampaignResearchConfig[] =>
  rows.map(([id, name, region, effect]) => ({
    id,
    branch,
    name,
    region,
    effect,
    max: 3,
    points: 3,
    specialty: 8,
  }));
export const CAMPAIGN_RESEARCH: CampaignResearchConfig[] = [
  ...tree("ECONOMY", [
    ["wood", "목재 비축", "greenwood", "단계당 시작 목재 +30"],
    ["stone", "석재 비축", "iron", "단계당 시작 석재 +30"],
    ["gold", "왕실 금고", "desert", "단계당 시작 금화 +30"],
    ["production", "개량 농업", "greenwood", "단계당 생산 +5%"],
    ["storage", "창고 설계", "shadow", "단계당 일반 자원 용량 +10%"],
    ["trade", "교역 협약", "desert", "단계당 교역 수령량 +10%"],
  ]),
  ...tree("MILITARY", [
    ["infantry", "보병 교범", "greenwood", "단계당 검병·창병 피해 +5%"],
    ["cavalry", "기동 전술", "shadow", "단계당 기병 이동 +5%"],
    ["siege", "공성 공학", "iron", "단계당 투석기 피해 +8%"],
    ["formation", "진형 교범", "greenwood", "단계당 아군 피해 감소 2%"],
    ["recruitment", "신병 양성", "desert", "단계당 병력 생산 +5%"],
    ["command", "지휘 체계", "volcano", "단계당 시작 사기 +3"],
  ]),
  ...tree("DEFENSE", [
    ["palace", "왕궁 기초", "greenwood", "단계당 왕궁 최대 체력 +5%"],
    ["wall", "강철 성벽", "iron", "단계당 방어시설 피해 감소 4%"],
    ["repair", "복구 교범", "frost", "단계당 일반 수리 비용 -5%"],
    ["defense", "북부 방어", "frost", "단계당 아군 병력 피해 감소 2%"],
    ["emergency", "긴급 복구", "volcano", "단계당 긴급 수리 비용 -5%"],
    ["resistance", "마법 방어", "arcane", "시작 속성 저항 연구 단계 제공"],
  ]),
  ...tree("PINBALL", [
    [
      "launcher",
      "왕실 발사대",
      "greenwood",
      "단계당 발사 속도 +3% (상한 유지)",
    ],
    ["reflector", "그림자 반사판", "shadow", "단계당 물리시설 건설 비용 -5%"],
    ["bumper", "금속 범퍼", "iron", "단계당 범퍼 타격 추진 +3% (상한 유지)"],
    ["energy", "에너지 순환", "frost", "재발사 지불 후 단계당 에너지 1 회수"],
    ["loss", "스피어 수호", "desert", "전투당 단계 수만큼 마지막 공 무료 구제"],
    ["combo", "비전 공명", "arcane", "콤보 3 이상 유효 타격에 단계당 충전 +1"],
  ]),
  ...tree("MAGIC", [
    ["fire", "태양의 불꽃", "desert", "시작 화염구 연구 단계 제공"],
    ["ice", "서리 마법", "frost", "시작 얼음구 연구 단계 제공"],
    ["thunder", "비전 번개", "arcane", "시작 번개구 연구 단계 제공"],
    ["phantom", "그림자 마법", "shadow", "시작 유령구 연구 단계 제공"],
    ["multiball", "코어 분열", "arcane", "시작 멀티볼 연구 단계 제공"],
    ["storm", "세계 코어 폭풍", "arcane", "시작 CORE STORM 연구 단계 제공"],
  ]),
];
export const GENERALS = [
  {
    id: "guardian",
    name: "THE GUARDIAN",
    region: "greenwood",
    effect: "방어시설 받는 피해 -10% · 수리 비용 -10%",
  },
  {
    id: "conqueror",
    name: "THE CONQUEROR",
    region: "iron",
    effect: "병력 생산 +10% · 적 시설 피해 +5%",
  },
  {
    id: "merchant",
    name: "THE MERCHANT",
    region: "desert",
    effect: "시작 금화 +60 / 목재 +40 · 생산 +5%",
  },
  {
    id: "archmage",
    name: "THE ARCHMAGE",
    region: "arcane",
    effect: "마법 충전 +10% · 시작 마력석 +10",
  },
  {
    id: "engineer",
    name: "THE ENGINEER",
    region: "shadow",
    effect: "물리시설 건설 비용 -15% · 발사 속도 +5%",
  },
  {
    id: "tactician",
    name: "THE TACTICIAN",
    region: "frost",
    effect: "병력 상성 우위 피해 +8% · 시작 사기 +5",
  },
];
export const EQUIPMENT = [
  {
    id: "ironShell",
    slot: "shell",
    name: "IRON SHELL",
    region: "iron",
    effect: "공성구 시설 피해 +10%",
  },
  {
    id: "frostGem",
    slot: "gem",
    name: "FROST GEM",
    region: "frost",
    effect: "얼음구 직접 피해 +10%",
  },
  {
    id: "sunEmblem",
    slot: "emblem",
    name: "SUNSTONE EMBLEM",
    region: "desert",
    effect: "생산 +5%",
  },
  {
    id: "magmaModule",
    slot: "module",
    name: "MAGMA CORE MODULE",
    region: "volcano",
    effect: "화염·폭발구 직접 피해 +10%",
  },
  {
    id: "arcaneCrystal",
    slot: "gem",
    name: "ARCANE CRYSTAL",
    region: "arcane",
    effect: "마법 충전 +10%",
  },
  {
    id: "shadowEssence",
    slot: "module",
    name: "SHADOW ESSENCE",
    region: "shadow",
    effect: "유령구 직접 피해 +10%",
  },
];
export const TERRITORY_FACILITIES = {
  administration: "지역 행정청",
  production: "특산물 생산시설",
  garrison: "군사 주둔지",
  trade: "교역소",
  research: "지역 연구시설",
};
export const REGION_MAGIC: Record<string, string[]> = {
  greenwood: ["fire", "ice", "holyLight"],
  shadow: ["phantom"],
  iron: ["cannon", "earthquake"],
  desert: ["golden", "fireStorm"],
  frost: ["healing", "frostField", "royalShield"],
  volcano: ["explosion"],
  arcane: ["thunder", "chaos", "chainLightning", "multiball", "storm"],
  dark: [],
};
