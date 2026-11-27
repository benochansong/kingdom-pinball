import Matter from "matter-js";
import type { GameStateManager } from "../core/GameStateManager";
import type { UIManager } from "../ui/UIManager";
import type { GameModeManager } from "../modes/GameModeManager";
import { defaultModeOptions } from "../config/modes";
/** Explicit DEV-only fault injection. All saves are isolated by main.ts. */
export function mountReleaseLab(
  g: GameStateManager,
  ui: UIManager,
  modes: GameModeManager,
) {
  const panel = document.createElement("aside");
  panel.className = "release-lab";
  panel.innerHTML =
    '<details><summary>DEV · 공 생명주기 검증</summary><button data-release="classic">검사 클래식</button><button data-release="kingdom">검사 왕국</button><button data-release="war">검사 전쟁</button><button data-release="sandbox">검사 샌드박스</button><button data-release="drain">실제 공 하단 이동</button><button data-release="missing">물리 공 제거</button><button data-release="zero">에너지 0</button><pre aria-label="공 생명주기 로그"></pre></details>';
  document.body.append(panel);
  panel
    .querySelector("details")!
    .insertAdjacentHTML(
      "beforeend",
      '<button data-release="launch25">실제 25% 발사 · 4초 진행</button><button data-release="step">1초 진행</button><button data-release="restore">왕국 저장 복원</button><button data-release="rescue-left">좌측 구조 포착</button><button data-release="rescue-right">우측 구조 포착</button><button data-release="rescue-step">구조 0.5초 진행</button><button data-release="rescue-play">구조 후 플레이</button>',
    );
  panel.style.cssText =
    "position:fixed;bottom:0;left:0;z-index:10000;background:#10251e;color:#fff;max-width:95vw;font-size:12px;max-height:45vh;overflow:auto";
  const abort = new AbortController();
  panel.addEventListener(
    "click",
    (e) => {
      const action = (e.target as Element).closest<HTMLElement>(
        "[data-release]",
      )?.dataset.release;
      if (!action) return;
      if (["classic", "kingdom", "war", "sandbox"].includes(action)) {
        ui.close(false);
        modes.leave();
        if (action === "classic") g.start(false);
        if (action === "kingdom") g.startKingdom(true);
        if (action === "war") g.startWar({ preparation: 180 });
        if (action === "sandbox") modes.start("sandbox", defaultModeOptions());
      }
      if (action.startsWith("rescue-")) {
        if (action === "rescue-left" || action === "rescue-right") {
          if (g.state === "paused") g.resume();
          if (!g.physics.launched) {
            g.chargeStart();
            g.charge = 0.8;
            g.chargeRelease();
          }
          const b = g.physics.ball!;
          Matter.Body.setPosition(b, { x: 288, y: 600 });
          g.time += 2500;
          g.updateRescue();
          const left = action === "rescue-left";
          Matter.Body.setPosition(b, { x: left ? 110 : 466, y: 775 });
          Matter.Body.setVelocity(b, { x: left ? -1 : 1, y: 6 });
          g.updateRescue();
          g.pause();
        } else {
          g.resume();
          if (action === "rescue-step") {
            for (let i = 0; i < 120; i++) g.update(1000 / 240);
            g.pause();
          }
        }
      }
      if (action === "drain")
        for (const b of g.physics.balls)
          Matter.Body.setPosition(b, { x: 290, y: 890 });
      if (action === "missing") g.physics.removeBall();
      if (action === "launch25") {
        g.chargeStart();
        g.charge = 0.25;
        g.chargeRelease();
        for (let i = 0; i < 240; i++) g.update(1000 / 60);
      }
      if (action === "step") for (let i = 0; i < 60; i++) g.update(1000 / 60);
      if (action === "restore") g.startKingdom(false);
      if (action === "zero" && g.economy) g.economy.data.resources.energy = 0;
    },
    { signal: abort.signal },
  );
  const timer = setInterval(() => {
    panel.querySelector("pre")!.textContent = JSON.stringify(
      {
        mode: modes.active ? modes.session.kind : g.war ? "war" : g.mode,
        state: g.state,
        ballState: g.ballStatus,
        balls: g.physics.balls.length,
        id: g.physics.ball?.id,
        launched: g.physics.launched,
        remaining: g.remaining,
        energy: g.economy?.data.resources.energy,
        losses: g.economy?.data.losses,
        gameMs: g.time,
        rescue: g.rescue,
        position: g.physics.ball?.position,
        velocity: g.physics.ball?.velocity,
        held: [...g.physics.heldBalls],
        protection: g.protection.data,
        statistics: g.physics.telemetry.summary(),
        bodies: Matter.Composite.allBodies(g.physics.engine.world).length,
        events: g.ballLog.slice(-8),
      },
      null,
      2,
    );
  }, 200);
  return () => {
    clearInterval(timer);
    abort.abort();
    panel.remove();
  };
}
