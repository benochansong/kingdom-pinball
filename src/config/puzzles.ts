export type PuzzleKind =
  | "target"
  | "sequence"
  | "ricochet"
  | "builder"
  | "portal"
  | "element"
  | "rescue"
  | "oneball";
export interface PuzzleDefinition {
  id: number;
  name: string;
  tier: string;
  kind: PuzzleKind;
  x: number;
  y: number;
  radius: number;
  seconds: number;
  balls: number;
  hits: number;
  hints: string[];
}
const names = [
  "첫 타격",
  "왕실 순서",
  "벽의 각도",
  "반사판 설계",
  "비전 통로",
  "화염의 인장",
  "포로 구출",
  "단 하나의 코어",
  "정밀 조준",
  "세 번의 울림",
];
const kinds: PuzzleKind[] = [
  "target",
  "sequence",
  "ricochet",
  "builder",
  "portal",
  "element",
  "rescue",
  "oneball",
  "target",
  "sequence",
];
const points = [
  [280, 205],
  [385, 320],
  [180, 344],
  [248, 450],
  [300, 400],
  [402, 490],
  [105, 510],
  [300, 260],
  [430, 260],
  [230, 330],
];
export const PUZZLES: PuzzleDefinition[] = Array.from(
  { length: 30 },
  (_, id) => {
    const tier = Math.floor(id / 10),
      i = id % 10;
    return {
      id,
      name: names[i] + (tier ? " " + (tier + 1) : ""),
      tier: ["BEGINNER", "ADVANCED", "MASTER"][tier],
      kind: kinds[i],
      x: points[i][0],
      y: points[i][1],
      radius: 30 - tier * 5,
      seconds: [180, 120, 90][tier],
      balls: tier === 2 || kinds[i] === "oneball" ? 1 : 3,
      hits: kinds[i] === "sequence" ? tier + 2 : 1,
      hints: [
        kinds[i] === "builder"
          ? "발사 전에 반사판을 배치하세요. 공이 반사판에 실제로 닿은 뒤 목표를 맞혀야 합니다."
          : kinds[i] === "element"
            ? "마법 패널에서 화염구로 전환한 후 목표를 맞히세요."
            : kinds[i] === "portal"
              ? "보라색 입구는 왼쪽 출구로 공을 이동시킵니다."
              : kinds[i] === "rescue"
                ? "감옥을 맞히면 포로가 아래 안전 지대로 이동합니다."
                : "발사 세기와 플리퍼 타이밍을 바꾸어 궤적을 살펴보세요.",
        "너무 강한 발사만이 정답은 아닙니다. 양쪽 플리퍼로 공을 다시 올리세요.",
        "목표 아래에서 상승하는 공의 방향을 확인하고, 필요하면 초기화하여 다시 시도하세요.",
      ],
    };
  },
);
