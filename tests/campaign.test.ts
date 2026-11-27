import { describe, it, expect } from "vitest";
import { GameStateManager } from "../src/core/GameStateManager";
import { SaveManager } from "../src/systems/SaveManager";
import { EconomySaveManager } from "../src/economy/EconomySaveManager";
import { WarSaveManager } from "../src/war/WarSaveManager";
import { CampaignManager } from "../src/campaign/CampaignManager";
import { CampaignSaveManager } from "../src/campaign/CampaignSaveManager";
import { regionLocked } from "../src/campaign/CampaignProgression";
function fixture() {
  const rows = new Map<string, string>(),
    storage = {
      getItem: (k: string) => rows.get(k) ?? null,
      setItem: (k: string, v: string) => {
        rows.set(k, v);
      },
    };
  const g = new GameStateManager(
    new SaveManager(storage),
    new EconomySaveManager(storage),
    new WarSaveManager(storage),
  );
  return {
    g,
    c: new CampaignManager(g, new CampaignSaveManager(storage)),
    rows,
  };
}
describe("Campaign first region", () => {
  it("completes development, defense and a real boss before awarding the first core", () => {
    const { g, c, rows } = fixture();
    expect(c.create(0, "ASTERION", "story")).toBeNull();
    expect(c.begin("1-2")).toBeTruthy();
    expect(c.begin("1-1")).toBeNull();
    const w = g.war!;
    g.enterBuild();
    let error: string | null = "no site";
    for (const p of [
      { x: 110, y: 430 },
      { x: 470, y: 470 },
      { x: 110, y: 540 },
      { x: 340, y: 480 },
    ]) {
      error = g.builder!.build({ type: "lumber", ...p, angle: 0, level: 1 });
      if (!error) break;
    }
    expect(error).toBeNull();
    expect(g.leaveBuild()).toBeNull();
    g.physics.launch(0.8);
    g.economy!.data.launchState = "inflight";
    for (let i = 0; i < 60; i++) {
      g.time += 4000;
      w.player.tick(g.time);
      w.player.harvest("forest", 700, true);
    }
    g.time = 250000;
    w.data.time = g.time;
    g.sessionExtension!.afterStep(0.05);
    expect(w.data.result?.outcome).toBe("victory");
    expect(c.profile!.records["1-1"].stars).toBeGreaterThan(0);
    const first = c.profile!.specialties.greenwood;
    w.onEnd();
    expect(c.profile!.specialties.greenwood).toBe(first);
    c.leave();
    expect(c.begin("1-2")).toBeNull();
    g.time = g.war!.data.time = 180000 + 540000;
    g.sessionExtension!.afterStep(0.05);
    expect(g.war!.data.result?.outcome).toBe("victory");
    c.leave();
    expect(c.begin("1-3")).toBeNull();
    g.time = g.war!.data.time = 181000;
    const boss = c.session!.mission.boss!,
      u = g.war!.enemyArmy.data.units.find((u) => u.id === boss.unitId)!;
    g.army!.combat.hurt(u, 99999, undefined, true);
    g.sessionExtension!.afterStep(0.05);
    expect(c.profile!.cores).toEqual(["greenwood"]);
    expect(regionLocked(c.profile!, "shadow")).toBeNull();
    expect(regionLocked(c.profile!, "iron")).toBeNull();
    expect(regionLocked(c.profile!, "dark")).toBeTruthy();
    expect(rows.has("kingdom-pinball:war:v1")).toBe(false);
    c.leave();
    expect(c.load(0)).toBe(true);
    expect(c.progress.stages).toBe(3);
    expect(c.profile!.cores).toEqual(["greenwood"]);
    g.dispose();
  });
  it("keeps occupied slots and permanent progression when a battle fails", () => {
    const { g, c } = fixture();
    c.create(0, "One", "normal");
    const id = c.profile!.id;
    expect(c.create(0, "Two", "hard")).toBeTruthy();
    expect(c.profile!.id).toBe(id);
    c.begin("1-1");
    g.war!.finish("defeat", "test defeat");
    expect(c.profile!.session!.settled).toBe(true);
    expect(c.profile!.records["1-1"].wins).toBe(0);
    c.leave();
    c.load(0);
    expect(c.profile!.id).toBe(id);
    expect(c.profile!.session!.war.result!.outcome).toBe("defeat");
    g.dispose();
  });
  it("restores an ongoing paid battle checkpoint separately from free war", () => {
    const { g, c, rows } = fixture();
    g.startWar({ type: "conquest" });
    g.checkpoint();
    const free = rows.get("kingdom-pinball:war:v1");
    c.create(1, "Checkpoint", "normal");
    c.begin("1-1");
    g.economy!.data.resources.gold = 17;
    g.time = 50000;
    g.checkpoint();
    c.leave();
    c.load(1);
    expect(c.resume()).toBe(true);
    expect(g.economy!.data.resources.gold).toBe(17);
    expect(g.time).toBe(50000);
    expect(rows.get("kingdom-pinball:war:v1")).toBe(free);
    g.dispose();
  });
});
