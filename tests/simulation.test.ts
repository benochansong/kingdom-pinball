import { it, expect } from "vitest";
import { GameStateManager } from "../src/core/GameStateManager";
import { SaveManager } from "../src/systems/SaveManager";
import { EconomySaveManager } from "../src/economy/EconomySaveManager";
import { PHYSICS } from "../src/config/physics";
import { FACILITIES, RESOURCE_IDS } from "../src/config/economy";

it("survives ten minutes of simulated input in both modes with reachable facilities", () => {
  const counts = new Map<string, number>();
  for (const mode of ["classic", "kingdom"]) {
    const map = new Map<string, string>(),
      store = {
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => {
          map.set(key, value);
        },
      };
    const g = new GameStateManager(
      new SaveManager(store),
      new EconomySaveManager(store),
    );
    const start = () =>
      mode === "classic" ? g.start(false) : g.startKingdom(true);
    start();
    g.events.on("hit", (hit) =>
      counts.set(
        `${mode}:${hit.id}`,
        (counts.get(`${mode}:${hit.id}`) ?? 0) + 1,
      ),
    );
    for (let frame = 0; frame < 36000; frame++) {
      if (g.state === "over") start();
      if (g.state === "relaunch") {
        if (!g.relaunch()) {
          g.endKingdom();
          start();
        }
      }
      if (!g.physics.launched && g.physics.ball) {
        if (!g.charging) g.chargeStart();
        if (g.charge > 0.65 + (frame % 23) / 100) g.chargeRelease();
      }
      const y = g.physics.ball?.position.y ?? 0;
      g.flipper("left", y > 690 && frame % 31 > 5);
      g.flipper("right", y > 690 && frame % 29 > 5);
      g.update(frame % 200 === 0 ? 100 : 1000 / 60);
      const ball = g.physics.ball;
      if (ball) {
        expect(Number.isFinite(ball.position.x + ball.position.y)).toBe(true);
        expect(ball.speed * 60).toBeLessThanOrEqual(PHYSICS.maxSpeed + 0.001);
      }
      if (g.economy)
        for (const r of RESOURCE_IDS) {
          expect(g.economy.data.resources[r]).toBeGreaterThanOrEqual(0);
          expect(g.economy.data.resources[r]).toBeLessThanOrEqual(
            g.economy.resources.capacity(r),
          );
        }
    }
    g.dispose();
  }
  for (const f of FACILITIES)
    expect(
      counts.get(`kingdom:${f.target}`) ?? 0,
      `${f.name} reachable`,
    ).toBeGreaterThan(0);
}, 30000);
