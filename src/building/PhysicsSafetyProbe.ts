import { TestBallSimulator } from "./TestBallSimulator";
import type { BuildingEntity } from "./types";
const verified = new Set<string>();
/** Sample real Matter trajectories after static topology checks; this is not a proof of every future shot. */
export function probeLayout(buildings: BuildingEntity[]): string | null {
  if (!buildings.length) return null;
  const signature = JSON.stringify(
    buildings.map(({ type, x, y, angle, level }) => [type, x, y, angle, level]),
  );
  if (verified.has(signature)) return null;
  for (const power of [0.65, 0.85, 1]) {
    const test = new TestBallSimulator(buildings);
    test.physics.launch(power);
    try {
      for (let i = 0; i < 360; i++) {
        test.physics.left.held = i % 48 < 13;
        test.physics.right.held = (i + 19) % 54 < 15;
        test.update(1000 / 60);
        const ball = test.physics.ball;
        if (
          ball &&
          (!Number.isFinite(ball.position.x) ||
            !Number.isFinite(ball.position.y) ||
            ball.position.x < 10 ||
            ball.position.x > 590 ||
            ball.position.y < 10)
        )
          return "물리 시험에서 테이블 이탈을 감지했습니다. 배치를 수정하세요.";
        if (test.notice.startsWith("끼임"))
          return "표본 물리 시험에서 끼임이 발생했습니다. 배치를 수정하세요.";
      }
    } finally {
      test.dispose();
    }
  }
  if (verified.size >= 64) verified.delete(verified.values().next().value!);
  verified.add(signature);
  return null;
}
