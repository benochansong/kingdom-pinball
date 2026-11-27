import { it, expect } from "vitest";
import { GameStateManager } from "../src/core/GameStateManager";
import { GameModeManager } from "../src/modes/GameModeManager";
import { ModeSaveManager } from "../src/modes/ModeSaveManager";
import { defaultModeOptions } from "../src/config/modes";
import { PUZZLES } from "../src/config/puzzles";
type Replay = {
  id: number;
  power: number;
  pattern: number;
  angle: number;
  seconds: number;
};
function run(id: number, power: number, pattern: number, limit = 40) {
  const g = new GameStateManager(),
    m = new GameModeManager(g, new ModeSaveManager(undefined)),
    o = defaultModeOptions();
  o.puzzle = id;
  o.preparation = 0;
  m.start("puzzle", o);
  if (m.puzzle!.board.definition.kind === "builder") m.puzzle!.place(-30);
  g.chargeStart();
  g.charge = power;
  g.chargeRelease();
  if (m.puzzle!.board.definition.kind === "element") g.magic!.activate("fire");
  let seconds = 0;
  for (
    let frame = 0;
    frame < limit * 240 && m.session.status === "playing";
    frame++
  ) {
    seconds = frame / 240;
    g.flipper(
      "left",
      pattern === 0 ||
        (pattern === 1 && Math.floor(seconds * 3) % 2 === 0) ||
        (pattern === 2 && Math.floor(seconds * 4) % 2 === 0),
    );
    g.flipper(
      "right",
      pattern === 0 ||
        (pattern === 1 && Math.floor(seconds * 3) % 2 === 1) ||
        (pattern === 2 && Math.floor(seconds * 4) % 2 === 0),
    );
    g.update(1000 / 240);
    if (!g.physics.launched && frame > 1) break;
  }
  const complete = m.session.status === "complete";
  g.dispose();
  return { complete, seconds };
}
const generating = !!(
  globalThis as unknown as { process?: { env?: Record<string, string> } }
).process?.env?.GENERATE_PUZZLES;
it.skipIf(!generating)(
  "finds physical input replays for every authored puzzle",
  async () => {
    const results: Replay[] = [];
    for (const puzzle of PUZZLES) {
      let found = false;
      for (const power of [
        0.5, 0.8, 1, 0.2, 0, 0.35, 0.65, 0.9, 0.1, 0.45, 0.55, 0.7, 0.75, 0.95,
        0.15, 0.25, 0.3, 0.4, 0.6, 0.85,
      ]) {
        for (let pattern = 0; pattern < 3; pattern++) {
          const r = run(puzzle.id, power, pattern);
          if (r.complete) {
            results.push({
              id: puzzle.id,
              power,
              pattern,
              angle: -30,
              seconds: r.seconds,
            });
            found = true;
            break;
          }
        }
        if (found) break;
      }
      expect(found, `puzzle ${puzzle.id + 1}`).toBe(true);
    }
    const moduleName = "node:fs/promises";
    const fs = await import(moduleName);
    await fs.writeFile(
      "tests/fixtures/puzzle-replays.json",
      JSON.stringify(results, null, 2),
    );
  },
  600000,
);
export { run };
