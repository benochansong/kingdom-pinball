import { EnemyAI } from "../war/EnemyAI";
import type { GameModeManager } from "./GameModeManager";
import type { ModeOptions } from "./types";
import { SeededRandom } from "./SeededRandom";
import { freshWar } from "../war/WarManager";
export function applyWarVariant(options: ModeOptions) {
  const o = structuredClone(options);
  switch (o.variant) {
    case "noMagic":
      o.magicEnabled = false;
      break;
    case "allMagic":
      o.magicEnabled = true;
      break;
    case "limitedArmy":
      o.population = 20;
      break;
    case "fortress":
      o.start = "fortress";
      o.castleLevel = 4;
      break;
    case "economy":
      o.start = "economic";
      o.resources = 500;
      break;
    case "rapid":
      o.preparation = 15;
      o.limit = 300;
      break;
    case "long":
      o.limit = 2400;
      break;
    case "oneCore":
      o.magicEnabled = false;
      o.multiEnabled = false;
      break;
    case "random": {
      const r = new SeededRandom(o.seed);
      o.enemy = r.pick(["iron", "crimson", "golden", "arcane", "shadow"]);
      o.start = r.pick([
        "balanced",
        "economic",
        "fortress",
        "military",
        "magic",
      ]);
      o.resources = 200 + r.int(4) * 100;
      break;
    }
  }
  return o;
}
export class CustomWarManager {
  allyAI?: EnemyAI;
  private aiState = freshWar().ai;
  constructor(readonly host: GameModeManager) {
    const g = host.game,
      w = g.war!,
      s = host.session;
    w.objectiveControlled = false;
    w.data.options.limit = s.options.limit;
    if (s.kind === "spectator") {
      const state = this.aiState;
      for (const k of [
        "since",
        "nextThink",
        "nextHarvest",
        "harvestIndex",
        "nextAttack",
        "wave",
        "warningAt",
        "abilityAt",
        "abilityWarning",
      ] as const)
        if (s.flags["ai-" + k] !== undefined) state[k] = s.flags["ai-" + k];
      state.lastStand = !!s.flags["ai-lastStand"];
      this.allyAI = new EnemyAI(w, "ally", {
        state,
        faction: s.options.allyFaction,
        difficulty: s.options.allyDifficulty,
      });
      g.physics.removeBall();
      g.magic!.automatedFaction = s.options.allyFaction;
      g.builder!.placementRule = () => "관전 중 직접 건설할 수 없습니다.";
    }
  }
  initialize() {
    const s = this.host.session,
      w = this.host.game.war!;
    if (s.options.variant === "allMagic") this.host.battle.magicKit(true);
    if (s.kind === "spectator") {
      w.player.data.rank = w.enemy.data.rank = 5;
      for (const side of ["ally", "enemy"] as const) {
        const e = w.economy(side);
        for (const key of ["wood", "stone", "gold", "food"] as const)
          e.data.resources[key] = s.options.resources;
      }
      this.host.battle.spawn("swordsman", s.options.units, "enemy");
    }
  }
  tick() {
    if (!this.allyAI) return;
    const w = this.host.game.war!,
      s = this.host.session;
    this.allyAI.update();
    const state = this.aiState;
    for (const k of [
      "since",
      "nextThink",
      "nextHarvest",
      "harvestIndex",
      "nextAttack",
      "wave",
      "warningAt",
      "abilityAt",
      "abilityWarning",
    ] as const)
      s.flags["ai-" + k] = state[k];
    s.flags["ai-lastStand"] = state.lastStand ? 1 : 0;
    if (state.strategy === "emergency" || state.strategy === "defense")
      w.command("defend");
    else if (w.army.living.some((u) => u.squad === "deployed"))
      w.command(w.protection("enemy") > 0 ? "siege" : "castle");
  }
}
