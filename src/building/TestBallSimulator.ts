import { PinballPhysics } from "../physics/PinballPhysics";
import { ECONOMY_TARGETS } from "../config/economy";
import { PHYSICS } from "../config/physics";
import { BallRecoverySystem } from "../systems/BallRecoverySystem";
import { applyBuildings, buildingImpulse } from "./BuildingPhysicsAdapter";
import type { BuildingEntity } from "./types";
export class TestBallSimulator {
  readonly physics = new PinballPhysics(ECONOMY_TARGETS);
  readonly recovery = new BallRecoverySystem();
  paused = false;
  time = 0;
  charge = 0;
  charging = false;
  collisions = 0;
  notice = "무료 테스트 · 실제 자원·점수·에너지 변화 없음";
  private accumulator = 0;
  constructor(buildings: BuildingEntity[]) {
    const copy = structuredClone(buildings);
    applyBuildings(this.physics, copy);
    this.physics.onHit = ({ target }) => {
      this.physics.kick(target);
      this.collisions++;
    };
    this.physics.onBuildingHit = (id) => {
      const b = copy.find((b) => b.id === id);
      if (b && this.time - b.lastHit >= 420) {
        b.lastHit = this.time;
        buildingImpulse(this.physics, b);
        this.collisions++;
      }
    };
    this.physics.spawn();
  }
  update(ms: number) {
    if (this.paused) return;
    this.accumulator += Math.min(150, Math.max(0, ms));
    while (this.accumulator >= PHYSICS.stepMs) {
      this.accumulator -= PHYSICS.stepMs;
      this.time += PHYSICS.stepMs;
      if (this.charging)
        this.charge = Math.min(
          1,
          this.charge + PHYSICS.stepMs / PHYSICS.launcher.chargeMs,
        );
      this.physics.step(PHYSICS.stepMs / 1000);
      const recovered = this.recovery.update(
        this.physics,
        PHYSICS.stepMs / 1000,
        this.time,
      );
      if (recovered) {
        const p = this.physics.ball?.position;
        this.notice = `끼임 감지 (${Math.round(p?.x ?? 0)}, ${Math.round(p?.y ?? 0)}) · 배치를 수정하세요.`;
        if (recovered === "return") this.physics.spawn();
      }
      if ((this.physics.ball?.position.y ?? 0) > PHYSICS.drainY) this.reset();
    }
  }
  reset() {
    this.physics.spawn();
    this.recovery.reset();
    this.charging = false;
    this.charge = 0;
  }
  release() {
    if (this.charging) {
      this.physics.launch(this.charge);
      this.charging = false;
      this.charge = 0;
    }
  }
  dispose() {
    this.physics.dispose();
  }
}
