import type Phaser from "phaser";
import { GameStateManager } from "../core/GameStateManager";
import { SaveManager } from "../systems/SaveManager";
import { EconomySaveManager } from "../economy/EconomySaveManager";
import { WarSaveManager } from "../war/WarSaveManager";
import type { UIManager } from "../ui/UIManager";
import { UNITS } from "../config/army";
const storage = {
  getItem: (k: string) => sessionStorage.getItem(`war-lab:${k}`),
  setItem: (k: string, v: string) => sessionStorage.setItem(`war-lab:${k}`, v),
};
export const createWarLab = () =>
  new GameStateManager(
    new SaveManager(storage),
    new EconomySaveManager(storage),
    new WarSaveManager(storage),
  );
export function mountWarLab(
  model: GameStateManager,
  ui: UIManager,
  game: Phaser.Game,
) {
  const bar = document.createElement("aside");
  bar.className = "military-lab";
  bar.innerHTML =
    "<b>DEV 전쟁 검증실 · 독립 세션 저장</b> " +
    [0, 20, 50, 100, 150]
      .map((n) => `<button data-war-count="${n}">${n}기 전쟁</button>`)
      .join("") +
    ' <button data-lab-action="damaged">왕궁 위기</button> <button data-lab-action="energy">공 손실</button> <button data-lab-action="victory">승리 판정</button> <output aria-label="전쟁 렌더 성능">측정 중</output>';
  document.body.prepend(bar);
  const reset = (count: number) => {
    ui.close(false);
    model.startWar({ type: "siege", preparation: 60, tutorial: false });
    const w = model.war!;
    model.time = w.data.time = 61000;
    w.army.data.units = [];
    w.enemyArmy.data.units = [];
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? "ally" : "enemy",
        a = w.troops(side),
        p = a.navigation.closest({
          x: 110 + (i % 17) * 22,
          y:
            side === "ally"
              ? 510 + Math.floor(i / 17) * 15
              : 360 - Math.floor(i / 17) * 15,
        })!;
      const u = a.createUnit(UNITS[i % 8].id, side, p);
      u.squad = "deployed";
      a.data.units.push(u);
    }
    w.command("frontline");
    model.checkpoint();
  };
  bar.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!b) return;
    if (b.dataset.warCount !== undefined) {
      reset(Number(b.dataset.warCount));
      return;
    }
    const w = model.war;
    if (!w) return;
    ui.close(false);
    if (b.dataset.labAction === "damaged") {
      w.damageStructure(w.castle("ally").id, 4000, "unit", "enemy");
      model.checkpoint();
    }
    if (b.dataset.labAction === "energy") {
      w.player.data.launchState = "awaiting";
      w.player.data.resources.energy = 0;
      model.checkpoint();
      model.startWar();
    }
    if (b.dataset.labAction === "victory") {
      w.damageStructure(w.castle("enemy").id, 1e6, "sphere", "ally");
      w.tick(0.05, w.now + 50);
    }
  });
  let last = performance.now(),
    start = last,
    frames: number[] = [];
  const frame = () => {
    const now = performance.now();
    if (model.state === "playing" && !document.hidden) frames.push(now - last);
    last = now;
    if (now - start > 2000 && frames.length) {
      const sorted = frames.slice().sort((a, b) => a - b);
      bar.querySelector("output")!.textContent =
        `${Math.round(1000 / (frames.reduce((a, b) => a + b, 0) / frames.length))} FPS · P95 ${sorted[Math.floor(sorted.length * 0.95)].toFixed(1)}ms · ${model.army?.combat.units.filter((u) => u.hp > 0).length}기`;
      frames = [];
      start = now;
    }
  };
  game.events.on("postrender", frame);
  if (model.warSave.exists()) model.startWar();
  else reset(0);
  return () => {
    bar.remove();
    game.events.off("postrender", frame);
  };
}
