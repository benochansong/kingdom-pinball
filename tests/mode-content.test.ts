import { describe, it, expect } from "vitest";
import { GameStateManager } from "../src/core/GameStateManager";
import { GameModeManager } from "../src/modes/GameModeManager";
import { ModeSaveManager } from "../src/modes/ModeSaveManager";
import { defaultModeOptions } from "../src/config/modes";
import { generateRoute } from "../src/modes/RogueRunManager";
import { ROGUE_UPGRADES, RELICS } from "../src/config/roguelike";
import { challenge, isoWeek } from "../src/modes/ChallengeManager";
import {
  newTable,
  validateTable,
  importTable,
  TableCreator,
  tableFingerprint,
} from "../src/modes/TableCreator";
import { applyWarVariant } from "../src/modes/CustomWarManager";
const fixture = () => {
  const rows = new Map<string, string>(),
    storage = {
      getItem: (k: string) => rows.get(k) ?? null,
      setItem: (k: string, v: string) => {
        rows.set(k, v);
      },
    };
  const g = new GameStateManager(),
    m = new GameModeManager(g, new ModeSaveManager(storage));
  return { g, m, rows, storage };
};
describe("Replayable mode content", () => {
  it("generates a connected three-act route with no missing exits for 100 seeds", () => {
    expect(ROGUE_UPGRADES).toHaveLength(24);
    expect(RELICS).toHaveLength(12);
    for (let seed = 0; seed < 100; seed++) {
      const nodes = generateRoute(seed);
      expect(nodes).toEqual(generateRoute(seed));
      for (const n of nodes) {
        expect(n.row === 14 ? n.next.length === 0 : n.next.length > 0).toBe(
          true,
        );
        for (const id of n.next)
          expect(nodes.some((x) => x.id === id && x.row === n.row + 1)).toBe(
            true,
          );
      }
      expect(nodes.filter((n) => n.kind === "boss")).toHaveLength(3);
    }
  });
  it("plays all 15 nodes, persists choices, and settles final boss exactly once", () => {
    const { g, m } = fixture();
    m.start("roguelike", defaultModeOptions());
    for (let row = 0; row < 15; row++) {
      expect(m.session.status).toBe("route");
      const next = m.rogue!.available[0];
      expect(m.rogue!.choose(next)).toBe(true);
      const n = m.rogue!.current!;
      if (["battle", "elite", "boss"].includes(n.kind)) {
        for (const u of g.war!.enemyArmy.living) u.hp = 0;
        m.rogue!.tick();
      } else if (n.kind === "puzzle") {
        for (let i = 0; i < 8; i++) m.rogue!.hit();
        m.rogue!.tick();
      } else m.rogue!.event("skip");
      if (m.session.status === "reward") {
        const id = m.session.rewards[0];
        expect(m.chooseReward(id)).toBe(true);
        expect(m.chooseReward(id)).toBe(false);
      }
    }
    expect(m.session.status).toBe("complete");
    expect(m.bucket.records).toHaveLength(1);
    expect(m.profile.achievements).toContain("rogue-final");
    g.dispose();
  });
  it("freezes economic and battle time when a reward dialog is dismissed", () => {
    const { g, m } = fixture();
    m.start("survival", defaultModeOptions());
    m.offerReward();
    const time = g.time;
    g.resume();
    g.update(150);
    expect(g.time).toBe(time);
    g.dispose();
  });
  it("computes UTC daily and ISO week seeds independent of local timezone", () => {
    expect(isoWeek(new Date("2021-01-01T12:00:00Z"))).toBe("2020-W53");
    expect(challenge("daily", new Date("2026-11-26T15:00:00Z")).id).toContain(
      "2026-11-26",
    );
    expect(challenge("daily", new Date("2026-11-27T00:00:00Z")).seed).not.toBe(
      challenge("daily", new Date("2026-11-26T23:59:59Z")).seed,
    );
    expect(challenge("weekly", new Date("2026-11-23T00:00:00Z")).seed).toBe(
      challenge("weekly", new Date("2026-11-29T23:59:59Z")).seed,
    );
    expect(
      challenge("weekly", new Date("2026-11-23T00:00:00Z")).next.toISOString(),
    ).toBe("2026-11-30T00:00:00.000Z");
  });
  it("validates all seven templates, rejects oversized/scripts/NaN and blocked portals", () => {
    for (const template of [
      "Empty",
      "Classic",
      "Economic",
      "Fortress",
      "Magic",
      "Survival",
      "Puzzle",
    ])
      expect(validateTable(newTable(template)).errors, template).toEqual([]);
    expect(() => importTable("x".repeat(256001))).toThrow();
    const t = newTable("Puzzle");
    const imported = importTable(
      JSON.stringify({
        ...t,
        name: "<script>bad</script>",
        script: "alert(1)",
      }),
    );
    expect(imported).not.toHaveProperty("script");
    expect(imported.name).not.toContain("<");
    t.objects[0].x = NaN;
    expect(validateTable(t).errors.length).toBeGreaterThan(0);
    const portal = {
      ...newTable("Puzzle").objects[0],
      kind: "portal" as const,
      link: "missing",
    };
    expect(
      validateTable({ ...newTable(), objects: [portal] }).errors.some((e) =>
        e.includes("출구"),
      ),
    ).toBe(true);
  });
  it("requires a local actual goal test and invalidates approval after editing/importing", () => {
    const { m, g, storage } = fixture();
    m.creator.selected = newTable("Puzzle");
    expect(m.testTable(true)).toContain("직접");
    m.creator.save();
    expect(m.testTable()).toBeNull();
    g.chargeStart();
    g.charge = 0.8;
    g.chargeRelease();
    for (
      let frame = 0;
      frame < 12000 && m.session.status === "playing";
      frame++
    ) {
      const held = Math.floor((frame / 240) * 4) % 2 === 0;
      g.flipper("left", held);
      g.flipper("right", held);
      g.update(1000 / 240);
    }
    expect(m.session.status).toBe("complete");
    expect(m.creator.isVerified()).toBe(true);
    const old = tableFingerprint(m.creator.selected);
    m.creator.selected.objects[0].x += 10;
    expect(tableFingerprint(m.creator.selected)).not.toBe(old);
    expect(m.creator.isVerified()).toBe(false);
    const c = new TableCreator(storage);
    c.import(m.creator.export());
    expect(c.isVerified()).toBe(false);
    g.dispose();
  });
  it("honors no-magic restrictions without crashing structure damage and starts both AI economies", () => {
    const { m, g } = fixture();
    const options = defaultModeOptions();
    options.variant = "noMagic";
    expect(applyWarVariant(options).magicEnabled).toBe(false);
    m.start("customWar", options);
    expect(g.magic!.locked("fire")).toContain("마법");
    g.time = g.war!.data.time = 61000;
    expect(() =>
      g.war!.damageStructure(g.war!.castle("enemy").id, 10, "sphere", "ally"),
    ).not.toThrow();
    m.start("spectator", defaultModeOptions());
    for (let i = 0; i < 240; i++) g.update(150);
    expect(g.war!.player.resources.totalProduction).toBeGreaterThan(0);
    expect(g.war!.enemy.resources.totalProduction).toBeGreaterThan(0);
    expect(m.session.competitive).toBe(false);
    expect(m.customWar!.allyAI).toBeTruthy();
    g.dispose();
  });
});
