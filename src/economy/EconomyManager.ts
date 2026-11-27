import {
  ECONOMY,
  FACILITIES,
  SPECIALS,
  PRODUCTION_EVENTS,
  RANKS,
  type ResourceId,
  type Cost,
  type FacilityConfig,
} from "../config/economy";
import { ResourceManager } from "./ResourceManager";
import { MarketSystem } from "./MarketSystem";
import { ObjectiveManager } from "./ObjectiveManager";
import { EconomySaveManager, freshEconomy } from "./EconomySaveManager";
import type { EconomyData, FacilityStatus } from "./types";
import { buildingConfig } from "../config/buildings";
import { buildingProductionBonus } from "../building/BuildingManager";

export interface ProductionResult {
  facility: FacilityConfig;
  amount: number;
  overflow: number;
  multiplier: number;
  strength: number;
}
export class EconomyManager {
  facilityFactor: (target: string) => number = () => 1;
  readonly resources: ResourceManager;
  readonly market: MarketSystem;
  readonly objectives: ObjectiveManager;
  onNotice: (text: string) => void = () => {};
  constructor(
    readonly data: EconomyData,
    readonly save: EconomySaveManager,
  ) {
    this.resources = new ResourceManager(data);
    this.market = new MarketSystem(this.resources);
    this.objectives = new ObjectiveManager(this.resources);
  }
  static create(save: EconomySaveManager): EconomyManager {
    const e = new EconomyManager(freshEconomy(), save);
    e.checkpoint();
    return e;
  }
  checkpoint(): void {
    this.save.save(this.data);
  }
  get multiplier(): number {
    const n = this.data.combo.count;
    return n >= 20 ? 3 : n >= 10 ? 2 : n >= 5 ? 1.5 : n >= 3 ? 1.2 : 1;
  }
  tick(now: number): void {
    this.data.time = now;
    if (now - this.data.combo.last >= ECONOMY.comboWindowMs)
      this.data.combo.count = 0;
    if (this.data.event && now >= this.data.event.until) this.data.event = null;
    for (const id of ["harvest", "prosperity"]) this.trimSpecial(id);
  }
  status(id: string): FacilityStatus {
    const f = this.data.facilities[id];
    if (!f) return "READY";
    const remaining = f.overloadedUntil - this.data.time;
    if (remaining > 0) return remaining > 2500 ? "OVERLOADED" : "RECOVERING";
    const facility = FACILITIES.find((item) => item.id === id)!;
    if (this.productionBonus(facility.resource) > 1) return "BONUS";
    return this.data.time - f.lastHit < 450 ? "ACTIVE" : "READY";
  }
  harvest(
    target: string,
    normalSpeed: number,
    valid: boolean,
    rewardFactor=1,
  ): ProductionResult | undefined {
    const d = this.data;
    const built = d.building?.buildings.find((b) => b.id === target);
    const config = built
      ? FACILITIES.find((f) => f.id === buildingConfig(built.type)?.production)
      : FACILITIES.find((f) => f.target === target);
    if (
      !valid ||
      built?.disabled ||
      this.facilityFactor(target) <= 0 ||
      !config ||
      d.launchState !== "inflight" ||
      !Number.isFinite(normalSpeed) ||
      normalSpeed <= 40
    )
      return;
    const f = built?.production ?? d.facilities[config.id];
    if (
      d.time - f.lastHit <
      ECONOMY.cooldownMs * (built ? 1 - (f.level - 1) * 0.05 : 1)
    )
      return;
    f.lastHit = d.time;
    f.hits++;
    d.validHits++;
    f.recent = f.recent.filter((t) => d.time - t < ECONOMY.overloadWindowMs);
    f.recent.push(d.time);
    if (
      f.recent.length >= ECONOMY.overloadHits + (f.level >= 4 ? 3 : 0) &&
      f.overloadedUntil <= d.time
    ) {
      f.overloadedUntil =
        d.time + ECONOMY.overloadDurationMs * (f.level >= 3 ? 0.8 : 1);
      f.recent = [];
      this.onNotice(
        `${config.name} 과부하 · 생산량 25%, 다른 시설을 조준하세요`,
      );
    }
    if (d.time - d.combo.last >= ECONOMY.comboWindowMs) d.combo.count = 0;
    d.combo.count++;
    d.combo.max = Math.max(d.combo.max, d.combo.count);
    d.combo.last = d.time;
    const strength =
      normalSpeed < 180
        ? 0.5
        : normalSpeed < 420
          ? 1
          : normalSpeed < 700
            ? 1.25
            : normalSpeed < 1000
              ? 1.5
              : 2;
    const overload =
      f.overloadedUntil > d.time ? ECONOMY.overloadMultiplier : 1;
    const multiplier = Math.min(
      ECONOMY.maxMultiplier,
      strength *
        ECONOMY.levelMultipliers[f.level - 1] *
        this.multiplier *
        this.productionBonus(config.resource) *
        buildingProductionBonus(d, config.resource) *
        overload,
    );
    const result = this.resources.grant(
      config.resource,
      Math.max(
        1,
        Math.floor(
          config.base * multiplier * Math.min(2, this.facilityFactor(target))*Math.max(0,Math.min(2,rewardFactor)),
        ),
      ),
      "production",
    );
    f.yielded += result.accepted;
    this.specialHit(config.id);
    if (d.validHits - d.lastEventHit >= ECONOMY.eventEveryHits)
      this.triggerEvent();
    this.progress();
    this.advanceTutorial(config.resource);
    this.checkpoint();
    return {
      facility: config,
      amount: result.accepted,
      overflow: result.overflow,
      multiplier,
      strength,
    };
  }
  productionBonus(resource: ResourceId): number {
    const d = this.data;
    let value = d.royalUntil > d.time ? ECONOMY.royalMultiplier : 1;
    if (d.event && d.event.until > d.time) {
      const event = PRODUCTION_EVENTS[d.event.index];
      if (
        event.resource === resource ||
        (!event.resource && resource !== "energy")
      )
        value *= event.multiplier;
    }
    return value;
  }
  private trimSpecial(id: string): void {
    const s = this.data.specials[id],
      now = this.data.time;
    if (id === "harvest") {
      s.timestamps = s.timestamps.filter(
        (t) => now - t <= ECONOMY.harvestWindowMs,
      );
      s.count = s.timestamps.length;
    }
    if (id === "prosperity") {
      for (const [key, time] of Object.entries(s.seen))
        if (now - time > ECONOMY.prosperityWindowMs) delete s.seen[key];
      s.count = Object.keys(s.seen).length;
    }
  }
  private specialHit(id: string): void {
    const d = this.data;
    for (const config of SPECIALS) {
      const s = d.specials[config.id];
      if (d.time < s.readyAt) continue;
      if (config.id === "forest" && id === "lumber") s.count++;
      if (config.id === "mining") {
        if (id === "quarry" || id === "mine") {
          s.count = s.last && s.last !== id ? s.count + 1 : 1;
          s.last = id;
        } else {
          s.count = 0;
          s.last = "";
        }
      }
      if (config.id === "harvest" && id === "farm") {
        s.timestamps.push(d.time);
        this.trimSpecial("harvest");
      }
      if (config.id === "magic" && (id === "tower" || id === "sanctuary")) {
        s.seen[id] = Math.min(2, (s.seen[id] ?? 0) + 1);
        s.count = (s.seen.tower ?? 0) + (s.seen.sanctuary ?? 0);
      }
      if (config.id === "prosperity") {
        s.seen[id] = d.time;
        this.trimSpecial("prosperity");
      }
      if (s.count >= config.goal) {
        const overflow = this.resources.reward(config.reward);
        s.count = 0;
        s.last = "";
        s.timestamps = [];
        s.seen = {};
        s.readyAt = d.time + ECONOMY.specialCooldownMs;
        s.achievements++;
        this.onNotice(
          `${config.name}!${overflow ? ` · 저장 초과 ${overflow}` : ""}`,
        );
        if (d.tutorialStep === 8) d.tutorialStep = 9;
        this.triggerEvent();
      }
    }
  }
  triggerEvent(): void {
    const d = this.data;
    if (d.event && d.event.until > d.time) return;
    const index = d.nextEvent % PRODUCTION_EVENTS.length;
    d.nextEvent++;
    d.lastEventHit = d.validHits;
    d.event = { index, until: d.time + PRODUCTION_EVENTS[index].duration };
    this.onNotice(
      `${PRODUCTION_EVENTS[index].name} · ${PRODUCTION_EVENTS[index].hint}`,
    );
  }
  royal(): void {
    const d = this.data;
    d.royalCount++;
    d.royalUntil = d.time + ECONOMY.royalDurationMs;
    const overflow = this.resources.reward(ECONOMY.royalReward);
    this.onNotice(
      `ROYAL PROSPERITY · 15초간 생산 +20%${overflow ? ` · 저장 초과 ${overflow}` : ""}`,
    );
    this.checkpoint();
  }
  upgrade(id: string): boolean {
    const f = this.data.facilities[id];
    if (!f || f.level >= 5) return false;
    if (!this.resources.transact(ECONOMY.upgradeCosts[f.level - 1]))
      return false;
    f.level++;
    if (this.data.tutorialStep === 4) this.data.tutorialStep = 5;
    this.progress();
    this.checkpoint();
    return true;
  }
  upgradeStorage(): boolean {
    const d = this.data;
    if (
      d.storageLevel >= 5 ||
      !this.resources.transact(ECONOMY.storageCosts[d.storageLevel - 1])
    )
      return false;
    d.storageLevel++;
    this.progress();
    this.checkpoint();
    return true;
  }
  trade(id: string, batches: number): boolean {
    if (!this.market.trade(id, batches)) return false;
    if (this.data.tutorialStep === 5) this.data.tutorialStep = 6;
    this.checkpoint();
    return true;
  }
  claim(id: string): boolean {
    const result = this.objectives.claim(id);
    if (!result.success) return false;
    this.onNotice(
      `목표 보상을 받았습니다${result.overflow ? ` · 저장 초과 ${result.overflow}` : ""}`,
    );
    this.triggerEvent();
    this.checkpoint();
    return true;
  }
  progress(): void {
    const d = this.data,
      production = this.resources.totalProduction;
    const atLeast = (level: number): number =>
      Object.values(d.facilities).filter((f) => f.level >= level).length;
    const met = [
      true,
      production >= 300 && atLeast(2) >= 1,
      production >= 1000 && atLeast(2) >= 3 && d.storageLevel >= 2,
      production >= 3000 && atLeast(3) >= 3 && d.storageLevel >= 3,
      production >= 7000 && atLeast(4) >= 5 && d.storageLevel >= 4,
    ];
    while (d.rank < 5 && met[d.rank]) {
      d.rank++;
      this.resources.reward({ gold: ECONOMY.rankRewardGold[d.rank - 1] });
      this.onNotice(`${RANKS[d.rank - 1]} · 왕국 발전!`);
    }
  }
  beginLaunch(): boolean {
    if (this.data.launchState !== "ready") return false;
    this.data.launchState = "inflight";
    this.data.launchedAt = this.data.time;
    if (this.data.tutorialStep === 0) this.data.tutorialStep = 1;
    // Persist before launching: reloading an active ball cannot provide a free replacement.
    this.checkpoint();
    return true;
  }
  loseBall(): void {
    if (this.data.launchState !== "inflight") return;
    this.data.launchState = "awaiting";
    this.data.losses++;
    this.data.survivalMs += Math.max(0, this.data.time - this.data.launchedAt);
    this.data.combo.count = 0;
    this.checkpoint();
  }
  resumeCheckpoint(): void {
    if (this.data.launchState === "inflight") this.loseBall();
    this.data.combo.count = 0;
  }
  payRelaunch(): boolean {
    if (
      this.data.launchState !== "awaiting" ||
      !this.resources.transact({ energy: ECONOMY.relaunchCost })
    )
      return false;
    this.data.launchState = "ready";
    this.checkpoint();
    return true;
  }
  recoverEnergy(resource: "gold" | "mana"): boolean {
    if (
      this.data.launchState !== "awaiting" ||
      this.data.resources.energy >= ECONOMY.relaunchCost
    )
      return false;
    const cost: Cost =
      resource === "gold"
        ? { gold: ECONOMY.goldRecoveryCost }
        : { mana: ECONOMY.manaRecoveryCost };
    if (!this.resources.transact(cost, { energy: ECONOMY.recoveryEnergy }))
      return false;
    if (this.data.tutorialStep === 7) this.data.tutorialStep = 8;
    this.checkpoint();
    return true;
  }
  canContinue(): boolean {
    const r = this.data.resources;
    return (
      r.energy >= ECONOMY.relaunchCost ||
      r.gold >= ECONOMY.goldRecoveryCost ||
      r.mana >= ECONOMY.manaRecoveryCost
    );
  }
  end(): void {
    if (this.data.launchState === "inflight") this.loseBall();
    this.data.launchState = "ended";
    this.checkpoint();
    this.save.archive(this.data);
  }
  advanceTutorial(resource: ResourceId): void {
    const step = this.data.tutorialStep;
    if (
      (step === 1 && resource === "wood") ||
      (step === 2 && resource === "stone") ||
      (step === 3 && resource === "gold") ||
      (step === 7 && resource === "energy")
    )
      this.data.tutorialStep++;
  }
  tutorialNext(): void {
    if (++this.data.tutorialStep >= 10) {
      this.data.tutorialStep = -1;
      this.data.tutorialDone = true;
    }
    this.checkpoint();
  }
  get style(): string {
    const d = this.data;
    if (d.validHits < 12) return "분류를 위한 생산 기록이 더 필요합니다";
    if (d.combo.max >= 20) return "COMBO SPECIALIST";
    const totals = Object.entries(d.produced)
      .filter(([r]) => r !== "energy")
      .sort((a, b) => b[1] - a[1]);
    if (totals[0][1] < this.resources.totalProduction * 0.35)
      return "BALANCED RULER";
    if (d.tradeCount >= 10 || totals[0][0] === "gold") return "GOLD MERCHANT";
    return (
      (
        {
          wood: "FOREST PIONEER",
          stone: "MASTER MINER",
          food: "HARVEST LORD",
          mana: "ARCANE MASTER",
        } as Record<string, string>
      )[totals[0][0]] ?? "BALANCED RULER"
    );
  }
}
