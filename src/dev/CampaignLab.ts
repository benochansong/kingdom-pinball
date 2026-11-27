import type Phaser from "phaser";
import { GameStateManager } from "../core/GameStateManager";
import { SaveManager } from "../systems/SaveManager";
import { EconomySaveManager } from "../economy/EconomySaveManager";
import { WarSaveManager } from "../war/WarSaveManager";
import { CampaignSaveManager } from "../campaign/CampaignSaveManager";
import type { CampaignManager } from "../campaign/CampaignManager";
import type { UIManager } from "../ui/UIManager";
import { REGIONS, STAGES } from "../config/campaign";
import { UNITS } from "../config/army";
// DEV only, isolated from all real campaign and legacy storage keys.
const storage = {
  getItem: (k: string) => sessionStorage.getItem("campaign-lab:" + k),
  setItem: (k: string, v: string) =>
    sessionStorage.setItem("campaign-lab:" + k, v),
};
export const createCampaignLab = () =>
  new GameStateManager(
    new SaveManager(storage),
    new EconomySaveManager(storage),
    new WarSaveManager(storage),
  );
export const createCampaignLabSave = () => new CampaignSaveManager(storage);
export function mountCampaignLab(
  c: CampaignManager,
  ui: UIManager,
  game: Phaser.Game,
) {
  const bar = document.createElement("aside");
  bar.className = "military-lab campaign-lab";
  bar.innerHTML = `<b>DEV CAMPAIGN · 별도 세션 저장</b><select aria-label="검증 스테이지">${STAGES.map((s) => `<option value="${s.id}">${s.id} ${s.name}</option>`).join("")}</select><button data-campaign-lab="stage">선택 전투</button><button data-campaign-lab="benchmark">8지역 성능 측정</button><button data-campaign-lab="damage">보스 체력 −22%</button><output aria-label="캠페인 렌더 성능">준비</output><pre hidden aria-label="캠페인 성능 결과"></pre>`;
  document.body.prepend(bar);
  const g = c.game;
  let desired = 1,
    until = 0,
    index = -1,
    last = performance.now(),
    frames: number[] = [];
  const cases = [
    { stage: "1-1", units: 0, balls: 1 },
    { stage: "1-2", units: 50, balls: 3 },
    ...REGIONS.map((_, i) => ({ stage: `${i + 1}-3`, units: 150, balls: 10 })),
  ];
  const results: object[] = [];
  let cpu: Record<string, number> = {};
  const measure = (target: any, key: string, label: string) => {
    const original = target[key].bind(target);
    target[key] = (...args: any[]) => {
      const start = performance.now();
      try {
        return original(...args);
      } finally {
        cpu[label] = (cpu[label] ?? 0) + performance.now() - start;
      }
    };
  };
  measure(g, "update", "model");
  measure(ui, "render", "ui");
  function reset(stage: string, count = 0, balls = 1) {
    ui.close(false);
    c.leave();
    c.create(0, "CAMPAIGN LAB", "normal", true);
    const p = c.profile!;
    p.cores = REGIONS.map((r) => r.id);
    for (const r of REGIONS)
      p.territories[r.id] = { level: 1, facilities: { administration: 1 } };
    for (const s of STAGES)
      p.records[s.id] = {
        wins: 1,
        attempts: 1,
        stars: 1,
        bestSeconds: 100,
        difficulty: {},
        lastReason: "DEV fixture",
      };
    c.begin(stage);
    const w = g.war!;
    g.time = w.data.time = 121000;
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? "ally" : "enemy",
        a = w.troops(side),
        position = a.navigation.closest({
          x: 110 + (i % 17) * 22,
          y:
            side === "ally"
              ? 510 + Math.floor(i / 17) * 15
              : 360 - Math.floor(i / 17) * 15,
        });
      if (!position) continue;
      const u = a.createUnit(UNITS[i % 8].id, side, position);
      u.squad = "deployed";
      a.data.units.push(u);
    }
    w.command("frontline");
    measure(g.physics, "step", "physics");
    measure(w.army.combat, "update", "combat");
    measure(w.army.navigation, "path", "path");
    measure(g.magic!, "tick", "magic");
    measure(g.enemyMagic!, "tick", "enemyMagic");
    cpu = {};
    desired = balls;
    g.physics.launch(0.8);
    w.player.data.launchState = "inflight";
    g.magic!.data.charge = 100;
    frames = [];
    last = performance.now();
  }
  function next() {
    index++;
    if (index >= cases.length) {
      index = -1;
      until = 0;
      g.pause();
      bar.querySelector("pre")!.hidden = false;
      bar.querySelector("pre")!.textContent = JSON.stringify(results, null, 2);
      bar.querySelector("output")!.textContent =
        "측정 완료 · 아래 실제 렌더 프레임 결과";
      return;
    }
    const x = cases[index];
    reset(x.stage, x.units, x.balls);
    until = performance.now() + 4500;
  }
  bar.addEventListener("click", (e) => {
    const action = (e.target as HTMLElement).closest<HTMLButtonElement>(
      "button",
    )?.dataset.campaignLab;
    if (action === "stage") {
      index = -1;
      until = 0;
      reset(bar.querySelector("select")!.value);
    }
    if (action === "benchmark") {
      bar.querySelector("pre")!.hidden = true;
      bar.querySelector("output")!.textContent = "측정 중";
      results.length = 0;
      index = -1;
      next();
    }
    if (action === "damage" && c.boss) {
      const b = c.boss;
      g.war!.army.combat.hurt(b.unit!, b.state.maxHp * 0.44, undefined, true);
    }
  });
  const frame = () => {
    const now = performance.now();
    if (g.state === "playing" && !document.hidden) {
      frames.push(now - last);
      if (g.physics.launched) {
        for (let i = g.physics.balls.length; i < desired; i++)
          g.magic!.balls!.create("steel", g.time + 30000, "storm", i);
      } else if (g.economy?.data.launchState === "ready") {
        g.physics.launch(0.8);
        g.economy.data.launchState = "inflight";
      } else if (g.economy?.data.launchState === "awaiting") {
        g.economy.data.resources.energy = 100;
        g.relaunch();
      }
    }
    last = now;
    if (until && now >= until && frames.length) {
      const sorted = frames.slice().sort((a, b) => a - b),
        x = cases[index],
        measurement = {
          ...x,
          endingBalls: g.physics.balls.length,
          livingUnits: g.army!.combat.units.filter((u) => u.hp > 0).length,
          cpuMs: Object.fromEntries(
            Object.entries(cpu).map(([key, value]) => [key, Math.round(value)]),
          ),
          frames: frames.length,
          fps: Math.round(
            1000 / (frames.reduce((a, b) => a + b, 0) / frames.length),
          ),
          p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10,
        };
      results.push(measurement);
      bar.querySelector("output")!.textContent = JSON.stringify(measurement);
      next();
    }
  };
  game.events.on("postrender", frame);
  reset("1-1");
  return () => {
    game.events.off("postrender", frame);
    bar.remove();
  };
}
