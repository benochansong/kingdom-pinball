import Phaser from 'phaser';
import './style.css';
import { GameStateManager } from './core/GameStateManager';
import { AudioManager } from './audio/AudioManager';
import { UIManager } from './ui/UIManager';
import { PinballScene } from './scenes/PinballScene';

const model = new GameStateManager();
const audio = new AudioManager(model);
const ui = new UIManager(model, audio);
const game = new Phaser.Game({
  type: Phaser.AUTO, parent: 'game-canvas', width: 600, height: 900,
  backgroundColor: '#183b30', antialias: true, banner: false,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  fps: { target: 60 }, scene: [new PinballScene(model, audio, () => ui.render())],
});
const abort = new AbortController();
const keys = new Set<string>();
const controlCodes = ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'Escape', 'KeyR', 'KeyM'];
window.addEventListener('keydown', event => {
  if (!controlCodes.includes(event.code)) return;
  if ((event.target as HTMLElement).matches('input, select, textarea') || ui.dialog.open && event.code !== 'Escape' && event.code !== 'KeyM') return;
  if (event.code === 'Space' && (event.target as HTMLElement).matches('button') && model.state !== 'playing') return;
  event.preventDefault(); if (event.repeat) return;
  audio.unlock(); keys.add(event.code);
  switch (event.code) {
    case 'KeyA': case 'ArrowLeft': model.flipper('left', true); break;
    case 'KeyD': case 'ArrowRight': model.flipper('right', true); break;
    case 'Space': model.chargeStart(); break;
    case 'KeyW': model.nudge(); break;
    case 'Escape': if (ui.dialog.open) ui.close(); else ui.pause(); break;
    case 'KeyR': ui.confirmRestart(); break;
    case 'KeyM': ui.action('sound'); break;
  }
}, { signal: abort.signal });
window.addEventListener('keyup', event => {
  keys.delete(event.code);
  if (event.code === 'KeyA' || event.code === 'ArrowLeft') model.flipper('left', keys.has('KeyA') || keys.has('ArrowLeft'));
  if (event.code === 'KeyD' || event.code === 'ArrowRight') model.flipper('right', keys.has('KeyD') || keys.has('ArrowRight'));
  if (event.code === 'Space') model.chargeRelease();
}, { signal: abort.signal });
window.addEventListener('blur', () => { keys.clear(); ui.autoPause(); }, { signal: abort.signal });
document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); ui.autoPause(); } }, { signal: abort.signal });
model.events.on('state', () => keys.clear());
if (import.meta.hot) import.meta.hot.dispose(() => { abort.abort(); ui.dispose(); audio.dispose(); model.dispose(); game.destroy(true); });
