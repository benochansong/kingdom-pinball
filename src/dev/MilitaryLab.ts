import { GameStateManager } from "../core/GameStateManager";
import { SaveManager, type StorageLike } from "../systems/SaveManager";
import {
  EconomySaveManager,
  freshEconomy,
} from "../economy/EconomySaveManager";
import { freshBuildings, freshProduction } from "../building/types";
import { UNITS } from "../config/army";
import type { UIManager } from "../ui/UIManager";
import type Phaser from "phaser";

/** DEV-only, explicitly visible QA fixtures. Never reads or writes real progress. */
const storage: StorageLike = {
  getItem: (key) => sessionStorage.getItem(`military-lab:${key}`),
  setItem: (key, value) => sessionStorage.setItem(`military-lab:${key}`, value),
};
export function createLabModel() {
  return new GameStateManager(
    new SaveManager(storage),
    new EconomySaveManager(storage),
  );
}
export function mountMilitaryLab(
  model: GameStateManager,
  ui: UIManager,
  game: Phaser.Game,
) {
  const bar = document.createElement("aside");
  bar.className = "military-lab";
  bar.innerHTML =
    '<b>DEV 군사 검증실</b> · 별도 세션 저장 · 정상 해금 과정을 생략한 시험 데이터 <label>시험 시설 <select aria-label="시험 시설"><option value="barracks">병영</option><option value="archery">궁수 훈련장</option><option value="stable">마구간</option><option value="magicSchool">마법학교</option><option value="temple">신전</option><option value="siegeWorkshop">공성 작업장</option><option value="smith">대장간</option></select></label> <button data-count="0">생산 시험 초기화</button> <button data-count="20">20기</button> <button data-count="50">50기</button> <button data-count="100">100기</button> <output aria-label="렌더 성능">측정 중</output>';
  document.body.prepend(bar);
  const reset = (count: number) => {
    ui.close(false);
    model.menu();
    const d = freshEconomy();
    d.rank = 5;
    d.storageLevel = 5;
    d.tutorialDone = true;
    d.resources = {
      wood: 4000,
      stone: 4000,
      gold: 8000,
      food: 4000,
      mana: 500,
      energy: 100,
    };
    d.building = freshBuildings();
    d.building.territories = ["central", "west", "east", "north", "outer"];
    d.building.tutorialDone = true;
    d.building.buildings = [
      {
        id: "building-1",
        type: bar.querySelector("select")!.value,
        x: 300,
        y: 340,
        angle: 0,
        level: 1,
        paid: {},
        production: freshProduction(),
        charge: 0,
        lastHit: -10000,
        readyAt: 0,
      },
    ];
    d.building.nextId = 2;
    model.economySave.save(d);
    model.startKingdom(false);
    const army = model.army!;
    for (let i = 0; i < count; i++) {
      const p = army.navigation.closest({
        x: 150 + (i % 16) * 18,
        y: 610 + Math.floor(i / 16) * 16,
      });
      if (p)
        army.data.units.push(
          army.createUnit(UNITS[i % UNITS.length].id, "ally", p),
        );
    }
    model.checkpoint();
    ui.render(true);
  };
  bar.addEventListener("click", (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-count]",
    );
    if (button) reset(Number(button.dataset.count));
  });
  let frames: number[] = [],
    last = performance.now(),
    start = last;
  const frame = () => {
    const now = performance.now();
    if (!document.hidden && model.state === "playing") frames.push(now - last);
    last = now;
    if (now - start >= 2000 && frames.length) {
      const sorted = frames.slice().sort((a, b) => a - b);
      bar.querySelector("output")!.textContent =
        `${Math.round(1000 / (frames.reduce((a, b) => a + b, 0) / frames.length))} FPS · P95 ${sorted[Math.floor(sorted.length * 0.95)].toFixed(1)}ms · ${model.army?.combat.units.filter((u) => u.hp > 0).length ?? 0}기`;
      frames = [];
      start = now;
    }
  };
  game.events.on("postrender", frame);
  if (model.economySave.load()) model.startKingdom(false);
  else reset(0);
  return () => {
    game.events.off("postrender", frame);
    bar.remove();
  };
}
