/** All dimensions are logical pixels; velocities exposed by the game are px/s. */
export const PHYSICS = {
  width: 600,
  height: 900,
  stepMs: 1000 / 240,
  maxFrameMs: 150,
  gravity: 0.00072,
  ballRadius: 10,
  maxSpeed: 1380,
  ballRestitution: 0.64,
  airFriction: 0.00032,
  wallRestitution: 0.62,
  launcher: { x: 554, y: 802, minSpeed: 880, maxSpeed: 1250, chargeMs: 1300 },
  flipper: {
    length: 100,
    radius: 11,
    upSpeed: 17,
    downSpeed: 7,
    restitution: 0.62,
  },
  bumperCooldownMs: 180,
  comboWindowMs: 3000,
  drainY: 884,
  spheres: 5,
} as const;

export const COLLISION = { ball: 1, wall: 2, bumper: 4, gate: 8 } as const;
