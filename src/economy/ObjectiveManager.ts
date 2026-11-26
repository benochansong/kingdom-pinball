import type { Cost } from "../config/economy";
import { FACILITIES } from "../config/economy";
import type { EconomyData } from "./types";
import type { ResourceManager } from "./ResourceManager";
export interface Objective {
  id: string;
  name: string;
  target: number;
  progress: (d: EconomyData) => number;
  reward: Cost;
}
const total = (d: EconomyData): number =>
  d.produced.wood +
  d.produced.stone +
  d.produced.gold +
  d.produced.food +
  d.produced.mana;
export const OBJECTIVES: Objective[] = [
  {
    id: "wood100",
    name: "목재 100 생산",
    target: 100,
    progress: (d) => d.produced.wood,
    reward: { gold: 20 },
  },
  {
    id: "stone100",
    name: "석재 100 생산",
    target: 100,
    progress: (d) => d.produced.stone,
    reward: { wood: 30 },
  },
  {
    id: "gold100",
    name: "금화 100 생산",
    target: 100,
    progress: (d) => d.produced.gold,
    reward: { stone: 30 },
  },
  {
    id: "upgrade1",
    name: "생산시설 1개 강화",
    target: 1,
    progress: (d) =>
      Object.values(d.facilities).filter((f) => f.level >= 2).length,
    reward: { gold: 25, energy: 10 },
  },
  {
    id: "trade1",
    name: "시장 거래 1회 완료",
    target: 1,
    progress: (d) => d.tradeCount,
    reward: { wood: 20, stone: 20 },
  },
  {
    id: "combo10",
    name: "생산 콤보 10회",
    target: 10,
    progress: (d) => d.combo.max,
    reward: { mana: 10, energy: 20 },
  },
  {
    id: "three2",
    name: "시설 3개 LEVEL 2",
    target: 3,
    progress: (d) =>
      Object.values(d.facilities).filter((f) => f.level >= 2).length,
    reward: { gold: 60 },
  },
  {
    id: "storage2",
    name: "창고 LEVEL 2",
    target: 2,
    progress: (d) => d.storageLevel,
    reward: { wood: 50, stone: 50 },
  },
  {
    id: "prosperity",
    name: "KINGDOM PROSPERITY 달성",
    target: 1,
    progress: (d) => d.specials.prosperity.achievements,
    reward: { gold: 80, mana: 10 },
  },
  {
    id: "production3000",
    name: "일반 자원 3,000 생산",
    target: 3000,
    progress: total,
    reward: { gold: 150, mana: 20 },
  },
  {
    id: "level5",
    name: "시설 LEVEL 5 달성",
    target: 5,
    progress: (d) =>
      Math.max(...Object.values(d.facilities).map((f) => f.level)),
    reward: { gold: 200, energy: 30 },
  },
  {
    id: "storage4",
    name: "창고 LEVEL 4",
    target: 4,
    progress: (d) => d.storageLevel,
    reward: { wood: 150, stone: 150 },
  },
  {
    id: "all3",
    name: "모든 시설 LEVEL 3",
    target: FACILITIES.length,
    progress: (d) =>
      Object.values(d.facilities).filter((f) => f.level >= 3).length,
    reward: { gold: 250, mana: 30 },
  },
];
export class ObjectiveManager {
  constructor(private resources: ResourceManager) {}
  claim(id: string): { success: boolean; overflow: number } {
    const d = this.resources.data,
      objective = OBJECTIVES.find((o) => o.id === id);
    if (
      !objective ||
      d.claimed.includes(id) ||
      objective.progress(d) < objective.target
    )
      return { success: false, overflow: 0 };
    d.claimed.push(id);
    return { success: true, overflow: this.resources.reward(objective.reward) };
  }
}
