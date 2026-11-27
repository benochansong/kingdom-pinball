import { describe, it, expect } from "vitest";
import { PUZZLES } from "../src/config/puzzles";
import replays from "./fixtures/puzzle-replays.json";
import { GameStateManager } from "../src/core/GameStateManager";
import { GameModeManager } from "../src/modes/GameModeManager";
import { ModeSaveManager } from "../src/modes/ModeSaveManager";
import { defaultModeOptions } from "../src/config/modes";
describe("Authored puzzle input replay", () => {
  for (const replay of replays)
    it(`solves ${replay.id + 1}: ${PUZZLES[replay.id].kind} using the live game rules`, () => {
      const g = new GameStateManager(),
        m = new GameModeManager(g, new ModeSaveManager(undefined)),
        o = defaultModeOptions();
      o.puzzle = replay.id;
      o.preparation = 0;
      m.start("puzzle", o);
      if (m.puzzle!.board.definition.kind === "builder")
        expect(m.puzzle!.place(replay.angle)).toBe(true);
      g.chargeStart();
      g.charge = replay.power;
      g.chargeRelease();
      if (m.puzzle!.board.definition.kind === "element")
        expect(g.magic!.activate("fire")).toBeNull();
      const p = replay.pattern;
      for (
        let frame = 0;
        frame < PUZZLES[replay.id].seconds * 240 &&
        m.session.status === "playing";
        frame++
      ) {
        const seconds = frame / 240;
        g.flipper(
          "left",
          p === 0 ||
            (p === 1 && Math.floor(seconds * 3) % 2 === 0) ||
            (p === 2 && Math.floor(seconds * 4) % 2 === 0),
        );
        g.flipper(
          "right",
          p === 0 ||
            (p === 1 && Math.floor(seconds * 3) % 2 === 1) ||
            (p === 2 && Math.floor(seconds * 4) % 2 === 0),
        );
        g.update(1000 / 240);
      }
      expect({
        status: m.session.status,
        time: m.session.time,
        gtime: g.time,
        state: g.state,
        hits: m.puzzle!.board.hits,
        reason: m.session.reason,
        balls: m.session.stats.balls,
        targets: g.score.hits,
        active: m.active,
      }).toMatchObject({ status: "complete" });
      expect(m.session.flags.stars).toBe(3);
      g.dispose();
    });
});
