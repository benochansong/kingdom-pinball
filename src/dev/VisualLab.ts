import type Phaser from "phaser";
import type { GameModeManager } from "../modes/GameModeManager";
import type { UIManager } from "../ui/UIManager";
import { defaultModeOptions } from "../config/modes";
import { REGIONS } from "../config/campaign";
import { UNITS } from "../config/army";
/** Opt-in DEV harness. Uses session-prefixed storage; it never writes a real save. */
export function mountVisualLab(
  m: GameModeManager,
  ui: UIManager,
  phaser: Phaser.Game,
) {
  const bar = document.createElement("aside");
  bar.className = "military-lab";
  bar.innerHTML = `<b>VISUAL LAB · 격리 저장</b><select aria-label="시각 검사 지역">${REGIONS.map((r) => `<option value="${r.id}">${r.name}</option>`).join("")}</select><button data-case="0">A · 1공</button><button data-case="1">B · 50기</button><button data-case="2">C · 120기</button><button data-case="3">D · 7공</button><button data-case="4">E · STORM 10공</button><button data-case="5">F · 150기+STORM</button><button data-case="6">G · 연속 파괴</button><button data-case="7">H · 생존</button><button data-case="8">I · 3공</button><button data-bench>9종 측정</button><output aria-label="실측 렌더 성능">준비</output><details class="visual-results"><summary>측정 결과</summary><pre aria-label="시각 성능 결과"></pre></details>`;
  document.body.prepend(bar);
  const g = m.game;
  const abort = new AbortController();
  let last = performance.now(),
    frames: number[] = [],
    start = 0,
    index = -1,
    auto = false;
  let peakBalls = 0,
    peakUnits = 0;
  const results: unknown[] = [];
  function setup(i: number) {
    m.leave();
    const o = defaultModeOptions();
    o.region = bar.querySelector("select")!.value;
    o.preparation = 0;
    o.sandbox.allyInvincible = true;
    o.sandbox.enemyInvincible = true;
    o.sandbox.castleDamage = false;
    o.sandbox.ai = false;
    m.start(i === 7 ? "survival" : "sandbox", o);
    ui.close(false);
    g.time =
      g.war!.data.time =
      g.war!.player.data.time =
      g.war!.enemy.data.time =
        61000;
    g.war!.army.data.command = "attack";
    g.war!.enemyArmy.data.command = "attack";
    g.save.data.settings.presentation.debug = true;
    if (g.state === "paused") g.resume();
    g.chargeStart();
    g.charge = 0.85;
    g.chargeRelease();
    if (i !== 7) {
      g.war!.army.data.units = [];
      g.war!.enemyArmy.data.units = [];
      const n = [0, 50, 120, 0, 0, 150, 40, 0, 0][i];
      for (let j = 0; j < n; j++)
        m.battle.spawn(
          n >= 120 ? "swordsman" : UNITS[j % 8].id,
          1,
          n === 150 ? (j < 90 ? "ally" : "enemy") : j % 2 ? "enemy" : "ally",
          1,
        );
      if (i === 8) {
        g.physics.addSphere();
        g.physics.addSphere();
      }
      if (i === 4 || i === 5) {
        g.magic!.multiball(true);
      } else if (i === 3) g.magic!.multiball(false);
      if (i === 6) {
        m.sandbox!.settings.allyInvincible = false;
        m.sandbox!.settings.enemyInvincible = false;
        for (const s of g
          .war!.data.structures.filter((s) => !s.castle)
          .slice(0, 8))
          s.hp = 1;
      }
    }
    index = i;
    peakBalls = peakUnits = 0;
    frames = [];
    last = start = performance.now();
  }
  bar.addEventListener(
    "click",
    (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>("button");
      if (!b) return;
      if (b.dataset.case !== undefined) {
        auto = false;
        setup(+b.dataset.case);
      } else if (b.hasAttribute("data-bench")) {
        auto = true;
        results.length = 0;
        setup(0);
      }
    },
    { signal: abort.signal },
  );
  const update = () => {
    const now = performance.now(),
      dt = now - last;
    last = now;
    if (index < 0) return;
    peakBalls = Math.max(peakBalls, g.physics.balls.length);
    peakUnits = Math.max(
      peakUnits,
      g.army!.combat.units.filter((u) => u.hp > 0).length,
    );
    if (dt > 0) frames.push(dt);
    if (index === 6 && g.time % 1000 < 100) {
      const s = g.war!.data.structures.find((s) => s.hp === 1 && !s.castle);
      if (s)
        g.war!.damageStructure(
          s.id,
          10000,
          "unit",
          s.side === "ally" ? "enemy" : "ally",
        );
    }
    if (now - start < 8000) return;
    const sorted = [...frames].sort((a, b) => a - b),
      sum = frames.reduce((a, b) => a + b, 0),
      p = (q: number) =>
        sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
    const result = {
      case: "ABCDEFGHI"[index],
      region: m.session.options.region,
      frames: frames.length,
      wallMs: now - start,
      fps: (frames.length * 1000) / sum,
      p50: p(0.5),
      p95: p(0.95),
      p99: p(0.99),
      balls: g.physics.balls.length,
      peakBalls,
      peakUnits,
      destroyed: g.war!.data.structures.filter((s) => s.hp <= 0).length,
      units: g.army!.combat.units.filter((u) => u.hp > 0).length,
      bodies: g.physics.engine.world.bodies.length,
      hidden: document.hidden,
    };
    results.push(result);
    bar.querySelector("output")!.textContent =
      `${result.case}: ${result.fps.toFixed(1)} FPS · p95 ${result.p95.toFixed(1)}ms`;
    bar.querySelector("pre")!.textContent = JSON.stringify(results, null, 2);
    if (auto && index < 8) setup(index + 1);
    else index = -1;
  };
  phaser.events.on("poststep", update);
  return () => {
    abort.abort();
    phaser.events.off("poststep", update);
    bar.remove();
  };
}
