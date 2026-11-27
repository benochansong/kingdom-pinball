import { mountVisualLab } from "./dev/VisualLab";
import { ModeSaveManager } from "./modes/ModeSaveManager";
import { PresentationUI } from "./ui/PresentationUI";
import { canonicalKey } from "./presentation/settings";
import { TableCreatorUI } from "./ui/TableCreatorUI";
import { GameModeManager } from "./modes/GameModeManager";
import { ModeUI } from "./ui/ModeUI";
import "./modes.css";
import {
  createCampaignLab,
  createCampaignLabSave,
  mountCampaignLab,
} from "./dev/CampaignLab";
import { CampaignManager } from "./campaign/CampaignManager";
import { CampaignUI } from "./ui/CampaignUI";
import "./campaign.css";
import { MagicUI } from "./ui/MagicUI";
import "./magic.css";
import Phaser from "phaser";
import { createWarLab, mountWarLab } from "./dev/WarLab";
import "./style.css";
import "./economy.css";
import "./building.css";
import "./army.css";
import "./war.css";
import "./presentation.css";
import { WarUI } from "./ui/WarUI";
import { WAR_KEY } from "./war/WarSaveManager";
import { ArmyUI } from "./ui/ArmyUI";
import { BuildUI } from "./ui/BuildUI";
import { GameStateManager } from "./core/GameStateManager";
import { AudioManager } from "./audio/AudioManager";
import { UIManager } from "./ui/UIManager";
import { PinballScene } from "./scenes/PinballScene";
import { EconomyUI } from "./ui/EconomyUI";
import { ECONOMY_KEY } from "./economy/EconomySaveManager";
import { createLabModel, mountMilitaryLab } from "./dev/MilitaryLab";

const lab =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get("military-lab") === "1";
const warLab =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get("war-lab") === "1";
const campaignLab =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get("campaign-lab") === "1";
const visualLab =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get("visual-lab") === "1";
const model = visualLab
  ? createCampaignLab()
  : campaignLab
    ? createCampaignLab()
    : warLab
      ? createWarLab()
      : lab
        ? createLabModel()
        : new GameStateManager();
const audio = new AudioManager(model);
const ui = new UIManager(model, audio);
const economyUI = new EconomyUI(ui, model);
const buildUI = new BuildUI(ui, model);
const armyUI = new ArmyUI(ui, model);
const warUI = new WarUI(ui, model);
const magicUI = new MagicUI(ui, model);
const campaign = new CampaignManager(
  model,
  campaignLab ? createCampaignLabSave() : undefined,
);
const campaignUI = new CampaignUI(ui, campaign);
const modes = new GameModeManager(
  model,
  visualLab
    ? new ModeSaveManager({
        getItem: (k) => sessionStorage.getItem("visual-lab:" + k),
        setItem: (k, v) => sessionStorage.setItem("visual-lab:" + k, v),
      })
    : undefined,
);
const modeUI = new ModeUI(ui, modes);
const creatorUI = new TableCreatorUI(ui, modes);
const presentationUI = new PresentationUI(ui, modes);
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
  scene: [new PinballScene(model, audio, () => ui.render(), campaign, modes)],
});
const disposeVisualLab = visualLab
  ? mountVisualLab(modes, ui, game)
  : undefined;
const disposeLab = campaignLab
  ? mountCampaignLab(campaign, ui, game)
  : warLab
    ? mountWarLab(model, ui, game)
    : lab
      ? mountMilitaryLab(model, ui, game)
      : undefined;
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
  (nativeEvent) => {
    const event = {
      code: canonicalKey(
        nativeEvent.code,
        model.save.data.settings.presentation,
      ),
      key: nativeEvent.key,
      target: nativeEvent.target,
      repeat: nativeEvent.repeat,
      shiftKey: nativeEvent.shiftKey,
      ctrlKey: nativeEvent.ctrlKey,
      altKey: nativeEvent.altKey,
      metaKey: nativeEvent.metaKey,
      preventDefault: () => nativeEvent.preventDefault(),
    } as KeyboardEvent;
    if (
      modes.active &&
      modes.session.kind === "spectator" &&
      !["Escape", "KeyM"].includes(event.code)
    )
      return;
    if (magicUI.handleKey(event)) return;
    if (warUI.handleKey(event)) return;
    if (buildUI.handleKey(event)) return;
    if (armyUI.handleKey(event)) return;
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
  (nativeEvent) => {
    const event = {
      code: canonicalKey(
        nativeEvent.code,
        model.save.data.settings.presentation,
      ),
    };
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
document.addEventListener(
  "fullscreenchange",
  () => {
    keys.clear();
    model.flipper("left", false);
    model.flipper("right", false);
    model.charging = false;
    if (!document.fullscreenElement) ui.autoPause();
  },
  { signal: abort.signal },
);
window.addEventListener("pagehide", () => model.checkpoint(), {
  signal: abort.signal,
});
window.addEventListener(
  "storage",
  (event) => {
    if (model.sandboxKind) return;
    if (campaign.handleStorageConflict(event.key)) {
      ui.open(
        "캠페인 저장 충돌",
        `<p>다른 창에서 저장한 진행을 보호하기 위해 현재 창의 저장을 중단했습니다. 슬롯을 다시 불러온 뒤 계속하세요.</p><button data-action="campaign:load:${campaign.slot}">최신 슬롯 불러오기</button>`,
        false,
      );
      return;
    }
    if (modes.active) {
      if (event.key && modes.saves.conflict(event.key)) {
        model.pause();
        ui.message(
          "다른 창에서 저장한 모드를 보호합니다. 다시 불러오세요.",
          "gold",
        );
      }
      return;
    }
    if (campaign.active) return;
    if (
      model.mode === "kingdom" &&
      event.key === (model.war ? WAR_KEY : ECONOMY_KEY)
    ) {
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
    armyUI.dispose();
    campaignUI.dispose();
    modeUI.dispose();
    creatorUI.dispose();
    presentationUI.dispose();
    magicUI.dispose();
    warUI.dispose();
    disposeLab?.();
    disposeVisualLab?.();
    ui.dispose();
    audio.dispose();
    model.dispose();
    game.destroy(true);
  });
