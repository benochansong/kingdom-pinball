import { TRADES } from "../config/economy";
import type { ResourceManager } from "./ResourceManager";
export class MarketSystem {
  constructor(private resources: ResourceManager) {}
  price(id: string): number {
    const t = TRADES.find((t) => t.id === id);
    if (!t) return 0;
    const level = Math.max(
      0,
      ...(this.resources.data.building?.buildings ?? [])
        .filter((b) => b.type === "market")
        .map((b) => b.level),
    );
    return t.from === "gold"
      ? Math.ceil(t.take * (1 - Math.min(0.05, level * 0.01)))
      : t.take;
  }
  max(id: string): number {
    const t = TRADES.find((t) => t.id === id);
    if (!t) return 0;
    return Math.max(
      0,
      Math.min(
        Math.floor(this.resources.data.resources[t.from] / this.price(id)),
        Math.floor(this.resources.space(t.to) / t.give),
      ),
    );
  }
  trade(id: string, batches: number): boolean {
    const t = TRADES.find((t) => t.id === id);
    if (
      !t ||
      !Number.isSafeInteger(batches) ||
      batches < 1 ||
      batches > this.max(id)
    )
      return false;
    if (
      !this.resources.transact(
        { [t.from]: this.price(id) * batches },
        { [t.to]: t.give * batches },
      )
    )
      return false;
    const data = this.resources.data;
    data.sold[t.from] += this.price(id) * batches;
    data.bought[t.to] += t.give * batches;
    data.tradeCount++;
    data.trades.push({ id, batches, time: data.time });
    data.trades = data.trades.slice(-30);
    return true;
  }
}
