import { it, expect, vi } from "vitest";
import { AudioManager } from "../src/audio/AudioManager";
import { GameStateManager } from "../src/core/GameStateManager";
import { SaveManager } from "../src/systems/SaveManager";
import { EconomySaveManager } from "../src/economy/EconomySaveManager";
import { WarSaveManager } from "../src/war/WarSaveManager";
class Parameter {
  value = 0;
  setValueAtTime(v: number) {
    this.value = v;
  }
  setTargetAtTime(v: number) {
    this.value = v;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
  }
  exponentialRampToValueAtTime(v: number) {
    this.value = v;
  }
}
class Node {
  gain = new Parameter();
  frequency = new Parameter();
  threshold = new Parameter();
  knee = new Parameter();
  ratio = new Parameter();
  attack = new Parameter();
  release = new Parameter();
  type = "";
  onended?: () => void;
  connect() {}
  disconnect() {}
  start() {}
  stop() {}
}
class Context {
  state = "running";
  currentTime = 0;
  destination = new Node();
  createGain() {
    return new Node();
  }
  createOscillator() {
    return new Node();
  }
  createDynamicsCompressor() {
    return new Node();
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}
it("bounds repeated effects, stops voices on pause/menu and permits UI while paused", () => {
  vi.stubGlobal("AudioContext", Context);
  const storage = { getItem: () => null, setItem: () => {} };
  const g = new GameStateManager(
    new SaveManager(storage),
    new EconomySaveManager(storage),
    new WarSaveManager(storage),
  );
  const a = new AudioManager(g);
  a.unlock();
  g.start();
  for (let i = 0; i < 200; i++) g.events.emit("launch", { power: 1 });
  expect(a.activeVoices).toBeLessThanOrEqual(10);
  expect(a.activeVoices).toBeGreaterThan(0);
  g.pause();
  expect(a.activeVoices).toBe(0);
  g.events.emit("flipper", { side: "left" });
  expect(a.activeVoices).toBe(0);
  a.uiClick();
  expect(a.activeVoices).toBe(1);
  g.menu();
  expect(a.activeVoices).toBe(0);
  g.startWar({ preparation: 180 });
  a.update();
  expect(a.activeVoices).toBeGreaterThan(0);
  g.war!.finish("defeat", "test");
  const resultVoices = a.activeVoices;
  expect(resultVoices).toBe(3);
  a.update();
  expect(a.activeVoices).toBe(resultVoices);
  a.dispose();
  g.dispose();
  vi.unstubAllGlobals();
});
