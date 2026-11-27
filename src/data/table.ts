export type TargetKind =
  | "forest"
  | "stone"
  | "gold"
  | "crystal"
  | "palace"
  | "bonus"
  | "farm"
  | "core";
export interface TargetDefinition {
  id: string;
  kind: TargetKind;
  name: string;
  x: number;
  y: number;
  radius: number;
  points: number;
  kick: number;
  color: number;
}
export const TARGETS: TargetDefinition[] = [
  {
    id: "palace",
    kind: "palace",
    name: "왕궁",
    x: 282,
    y: 204,
    radius: 33,
    points: 500,
    kick: 510,
    color: 0xf0cc77,
  },
  {
    id: "forest",
    kind: "forest",
    name: "숲",
    x: 180,
    y: 344,
    radius: 31,
    points: 100,
    kick: 470,
    color: 0x9ac899,
  },
  {
    id: "stone",
    kind: "stone",
    name: "석재 광산",
    x: 384,
    y: 326,
    radius: 30,
    points: 150,
    kick: 590,
    color: 0xbdc7c2,
  },
  {
    id: "gold",
    kind: "gold",
    name: "금광",
    x: 248,
    y: 451,
    radius: 29,
    points: 250,
    kick: 490,
    color: 0xf1c45f,
  },
  {
    id: "crystal",
    kind: "crystal",
    name: "마법 수정",
    x: 402,
    y: 492,
    radius: 30,
    points: 400,
    kick: 650,
    color: 0x91d8e6,
  },
  {
    id: "bonus",
    kind: "bonus",
    name: "왕실 보물",
    x: 103,
    y: 512,
    radius: 20,
    points: 1000,
    kick: 500,
    color: 0xffdf8e,
  },
];

export interface Rail {
  a: [number, number];
  b: [number, number];
  width: number;
  sling?: boolean;
  rescueGate?: "left" | "right";
}
export const RAILS: Rail[] = [
  { a: [43, 766], b: [43, 174], width: 24 },
  { a: [43, 174], b: [84, 86], width: 24 },
  { a: [84, 86], b: [182, 43], width: 24 },
  { a: [182, 43], b: [418, 43], width: 24 },
  { a: [418, 43], b: [521, 82], width: 24 },
  { a: [521, 82], b: [577, 157], width: 24 },
  { a: [577, 157], b: [577, 850], width: 24 },
  { a: [532, 229], b: [532, 850], width: 18 },
  { a: [532, 229], b: [465, 145], width: 16 },
  { a: [43, 766], b: [100, 852], width: 24 },
  { a: [532, 766], b: [474, 852], width: 24 },
  { a: [112, 630], b: [182, 722], width: 18, sling: true },
  { a: [458, 625], b: [394, 722], width: 18, sling: true },
  { a: [86, 675], b: [177, 790], width: 18 },
  { a: [492, 675], b: [399, 790], width: 18 },
  { a: [76, 240], b: [100, 280], width: 18 },
  { a: [496, 372], b: [473, 413], width: 18 },
  { a: [538, 844], b: [572, 844], width: 18 },
];

/** The lower guide is a real shutter: solid normally, open only for a rescue shot. */
export function tableRails(rescue = true): Rail[] {
  if (!rescue) return RAILS;
  return RAILS.flatMap((rail): Rail[] => {
    if (rail.a[1] !== 675 || rail.b[1] !== 790) return [rail];
    const split: [number, number] = [
      rail.a[0] + (rail.b[0] - rail.a[0]) * 0.58,
      rail.a[1] + (rail.b[1] - rail.a[1]) * 0.58,
    ];
    return [
      { ...rail, b: split },
      { ...rail, a: split, rescueGate: rail.a[0] < 300 ? "left" : "right" },
    ];
  });
}

export const TUTORIAL = [
  { title: "첫 번째 출정", text: "Space를 길게 눌러 발사 강도를 충전하세요." },
  {
    title: "코어 스피어 발사",
    text: "Space를 놓으면 발사됩니다. 70% 이상 충전을 추천해요.",
  },
  {
    title: "왕국을 지켜라",
    text: "A와 D를 눌러 양쪽 플리퍼를 움직이세요. 방향키도 사용할 수 있어요.",
  },
  {
    title: "왕국을 깨우는 한 번의 타격",
    text: "숲과 광산, 수정에 공을 맞혀 점수를 획득하세요.",
  },
  {
    title: "왕궁으로 향하라",
    text: "상단 왕궁을 5회 맞히면 ROYAL BONUS +3,000!",
  },
  {
    title: "흐름을 이어가세요",
    text: "3초 안에 연속으로 타격하면 콤보 배율이 올라갑니다.",
  },
];
