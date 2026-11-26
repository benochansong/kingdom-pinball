import Phaser from "phaser";
import "./style.css";
import "./economy.css";
import "./building.css";
import { BuildUI } from "./ui/BuildUI";
import { GameStateManager } from "./core/GameStateManager";
import { AudioManager } from "./audio/AudioManager";
import { UIManager } from "./ui/UIManager";
import { PinballScene } from "./scenes/PinballScene";
import { EconomyUI } from "./ui/EconomyUI";
import { ECONOMY_KEY } from "./economy/EconomySaveManager";

const model = new GameStateManager();
const audio = new AudioManager(model);
const ui = new UIManager(model, audio);
const economyUI = new EconomyUI(ui, model);
const buildUI = new BuildUI(ui, model);
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-canvas",
  width: 600,
  height: 900,
  backgroundColor: "#183b30",
  antialias: true,
  banner: false,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  fps: { target: 60 },
  scene: [new PinballScene(model, audio, () => ui.render())],
});
const abort = new AbortController();
const keys = new Set<string>();
const controlCodes = [
  "KeyA",
  "KeyD",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "KeyW",
  "Escape",
  "KeyR",
  "KeyM",
];
window.addEventListener(
  "keydown",
  (event) => {
    if (buildUI.handleKey(event)) return;
    if (!controlCodes.includes(event.code)) return;
    if (
      (event.target as HTMLElement).matches("input, select, textarea") ||
      (ui.dialog.open && event.code !== "Escape" && event.code !== "KeyM")
    )
      return;
    if (
      event.code === "Space" &&
      (event.target as HTMLElement).matches("button") &&
      model.state !== "playing" &&
      !model.testBall
    )
      return;
    event.preventDefault();
    if (event.repeat) return;
    audio.unlock();
    keys.add(event.code);
    switch (event.code) {
      case "KeyA":
      case "ArrowLeft":
        model.flipper("left", true);
        break;
      case "KeyD":
      case "ArrowRight":
        model.flipper("right", true);
        break;
      case "Space":
        model.chargeStart();
        break;
      case "KeyW":
        model.nudge();
        break;
      case "Escape":
        if (ui.dialog.open) ui.close();
        else ui.pause();
        break;
      case "KeyR":
        ui.confirmRestart();
        break;
      case "KeyM":
        ui.action("sound");
        break;
    }
  },
  { signal: abort.signal },
);
window.addEventListener(
  "keyup",
  (event) => {
    keys.delete(event.code);
    if (event.code === "KeyA" || event.code === "ArrowLeft")
      model.flipper("left", keys.has("KeyA") || keys.has("ArrowLeft"));
    if (event.code === "KeyD" || event.code === "ArrowRight")
      model.flipper("right", keys.has("KeyD") || keys.has("ArrowRight"));
    if (event.code === "Space") model.chargeRelease();
  },
  { signal: abort.signal },
);
window.addEventListener(
  "blur",
  () => {
    keys.clear();
    if (model.testBall) {
      model.testBall.paused = true;
      model.testBall.physics.left.held = false;
      model.testBall.physics.right.held = false;
      model.testBall.charging = false;
      model.testBall.notice =
        "창이 비활성화되어 멈췄습니다. R로 테스트를 재개하세요.";
    }
    ui.autoPause();
  },
  { signal: abort.signal },
);
document.addEventListener(
  "visibilitychange",
  () => {
    if (document.hidden) {
      keys.clear();
      ui.autoPause();
    }
  },
  { signal: abort.signal },
);
model.events.on("state", () => keys.clear());
window.addEventListener("pagehide", () => model.checkpoint(), {
  signal: abort.signal,
});
window.addEventListener(
  "storage",
  (event) => {
    if (event.key === ECONOMY_KEY && model.mode === "kingdom") {
      model.invalidateEconomy();
      if (model.state !== "menu") economyUI.showSaveConflict();
    }
  },
  { signal: abort.signal },
);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    model.checkpoint();
    abort.abort();
    economyUI.dispose();
    buildUI.dispose();
    ui.dispose();
    audio.dispose();
    model.dispose();
    game.destroy(true);
  });
