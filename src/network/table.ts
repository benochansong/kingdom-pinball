import { WAR_TARGETS } from "../config/war";
import type { TargetDefinition } from "../data/table";
export const ONLINE_TARGETS: TargetDefinition[] = [
  ...WAR_TARGETS,
  {
    id: "online-arrow",
    kind: "stone",
    name: "전장 지원",
    x: 160,
    y: 450,
    radius: 20,
    points: 100,
    kick: 150,
    color: 0xe9c26d,
  },
  {
    id: "online-siege",
    kind: "stone",
    name: "공성 지원",
    x: 300,
    y: 240,
    radius: 22,
    points: 150,
    kick: 160,
    color: 0xff9670,
  },
  {
    id: "online-heal",
    kind: "forest",
    name: "치유 지원",
    x: 430,
    y: 450,
    radius: 20,
    points: 100,
    kick: 150,
    color: 0x7bf2bd,
  },
];
