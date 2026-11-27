import { writeFileSync } from "node:fs";
import { GameStateManager } from "../src/core/GameStateManager";
import { SaveManager } from "../src/systems/SaveManager";
import { EconomySaveManager } from "../src/economy/EconomySaveManager";
import { WarSaveManager } from "../src/war/WarSaveManager";
import { PINBALL_DIFFICULTIES } from "../src/config/pinball";
const rows: Record<string, unknown>[] = [],
  cap = 90,
  count = Number(process.env.BALANCE_TRIALS ?? 10);
for (const mode of ["kingdom", "war"])
  for (const difficulty of PINBALL_DIFFICULTIES)
    for (const protection of [false, true]) {
      for (const power of [0.25, 0.5, 0.75, 1])
        for (let seed = 1; seed <= count; seed++) {
          const storage = { getItem: () => null, setItem: () => {} },
            g = new GameStateManager(
              new SaveManager(storage),
              new EconomySaveManager(storage),
              new WarSaveManager(storage),
            );
          g.save.data.settings.presentation.pinballDifficulty = difficulty;
          if (mode === "war") g.startWar({ preparation: 180 });
          else g.startKingdom(true);
          g.sessionExtension = {
            ballProtection: protection,
            beforeStep: () => {},
            afterStep: () => {},
            dispose: () => {},
          };
          let rng = seed * 761 + Math.round(power * 1000),
            left = 0,
            right = 0;
          const random = () => {
            rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
            return rng / 4294967296;
          };
          const charge = Math.min(
              1,
              Math.max(0, power + (random() - 0.5) * 0.06),
            ),
            timing = (random() - 0.5) * 24;
          for (let frame = 0; frame < cap * 60; frame++) {
            if (
              !g.physics.launched &&
              g.physics.ball &&
              g.state === "playing"
            ) {
              g.chargeStart();
              g.charge = charge;
              g.chargeRelease();
            }
            const b = g.physics.ball;
            if (
              b &&
              b.velocity.y > 0 &&
              b.position.y > 745 + timing &&
              b.position.y < 805
            ) {
              if (b.position.x > 125 && b.position.x < 288) left = g.time + 120;
              if (b.position.x >= 288 && b.position.x < 450)
                right = g.time + 120;
            }
            g.flipper("left", g.time < left);
            g.flipper("right", g.time < right);
            g.update(1000 / 60);
            if (g.economy!.data.losses > 0) break;
          }
          rows.push({
            mode,
            difficulty,
            protection,
            power,
            seed,
            seconds: g.time / 1000,
            censored: g.economy!.data.losses === 0,
            raw: g.physics.telemetry.records,
            saves: g.protection.data.saves,
            kickbacks: g.protection.data.kickbacks,
            produced: g.economy!.data.produced,
            magic: g.magic!.data.charge,
            multi: g.magic!.data.multiCharge,
            storm: g.magic!.data.stormCharge,
          });
          g.dispose();
        }
      const a = rows.filter(
        (r) =>
          r.mode === mode &&
          r.difficulty === difficulty &&
          r.protection === protection,
      );
      console.log(
        mode,
        difficulty,
        protection,
        JSON.stringify({
          n: a.length,
          meanSeconds: a.reduce((n, r) => n + Number(r.seconds), 0) / a.length,
          censored: a.filter((r) => r.censored).length,
          saves: a.reduce((n, r) => n + Number(r.saves), 0),
          kickbacks: a.reduce((n, r) => n + Number(r.kickbacks), 0),
          meanProduction: Object.fromEntries(
            ["wood", "stone", "gold", "food", "mana", "energy"].map((k) => [
              k,
              a.reduce(
                (n, r) => n + (r.produced as Record<string, number>)[k],
                0,
              ) / a.length,
            ]),
          ),
        }),
      );
    }
writeFileSync(
  "docs/pinball-protection.json",
  JSON.stringify(
    {
      date: "2026-11-27",
      count,
      capSeconds: cap,
      notes:
        "Actual GameStateManager economy/war; basic scripted input, immediate free-ball relaunch. War preparation is 180s, no battlefield AI combat before cap. Capped durations are not complete human survival estimates. Raw records exclude launcher waits; run duration includes saves and returns. No automatic magic activations.",
      rows,
    },
    null,
    2,
  ),
);
