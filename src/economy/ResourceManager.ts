import {
  ECONOMY,
  RESOURCE_IDS,
  RESOURCES,
  type Cost,
  type ResourceId,
} from "../config/economy";
import type { EconomyData } from "./types";

export class ResourceManager {
  constructor(readonly data: EconomyData) {}
  capacity(resource: ResourceId): number {
    return (
      RESOURCES[resource].capacity *
      (resource === "energy"
        ? 1
        : ECONOMY.storageMultipliers[this.data.storageLevel - 1])
    );
  }
  space(resource: ResourceId): number {
    return this.capacity(resource) - this.data.resources[resource];
  }
  canAfford(cost: Cost): boolean {
    return Object.entries(cost).every(
      ([r, n]) =>
        RESOURCE_IDS.includes(r as ResourceId) &&
        Number.isFinite(n) &&
        n >= 0 &&
        Number.isInteger(n) &&
        this.data.resources[r as ResourceId] >= n,
    );
  }
  /** Validate the complete transaction before any write, including receiving capacity. */
  transact(cost: Cost, gain: Cost = {}): boolean {
    if (!this.canAfford(cost)) return false;
    for (const [r, n] of Object.entries(gain)) {
      if (
        !RESOURCE_IDS.includes(r as ResourceId) ||
        !Number.isSafeInteger(n) ||
        n < 0
      )
        return false;
      const id = r as ResourceId;
      if (this.data.resources[id] - (cost[id] ?? 0) + n > this.capacity(id))
        return false;
    }
    for (const r of RESOURCE_IDS) {
      this.data.resources[r] += (gain[r] ?? 0) - (cost[r] ?? 0);
      this.data.spent[r] += cost[r] ?? 0;
    }
    return true;
  }
  grant(
    resource: ResourceId,
    quantity: number,
    source: "production" | "reward" = "reward",
  ): { accepted: number; overflow: number } {
    if (!Number.isFinite(quantity) || quantity <= 0)
      return { accepted: 0, overflow: 0 };
    const amount = Math.min(Number.MAX_SAFE_INTEGER, Math.floor(quantity));
    const accepted = Math.min(amount, this.space(resource));
    const overflow = amount - accepted;
    this.data.resources[resource] += accepted;
    this.data.overflow[resource] += overflow;
    if (source === "production") this.data.produced[resource] += accepted;
    return { accepted, overflow };
  }
  reward(reward: Cost): number {
    let overflow = 0;
    for (const r of RESOURCE_IDS)
      overflow += this.grant(r, reward[r] ?? 0).overflow;
    return overflow;
  }
  get totalProduction(): number {
    return RESOURCE_IDS.filter((r) => r !== "energy").reduce(
      (total, r) => total + this.data.produced[r],
      0,
    );
  }
}
