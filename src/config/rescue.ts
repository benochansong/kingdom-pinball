export type CannonSide = "left" | "right";
export const RESCUE = {
  rescueShotsPerGame: 2,
  rescueEnabled: true,
  captureAnimationDuration: 100,
  chargeDuration: 300,
  launchCooldown: 2000,
  minimumBallSpeed: 30,
  maximumBallSpeed: 1250,
  eligibleBallTypes: [
    "steel",
    "fire",
    "ice",
    "thunder",
    "cannon",
    "explosion",
    "healing",
    "golden",
    "phantom",
    "chaos",
  ],
  allowPromotedLastBall: true,
  cannons: {
    left: {
      x: 210 - 95 / Math.tan((54 * Math.PI) / 180),
      y: 817,
      exit: { x: 210, y: 722 },
      direction: {
        x: Math.cos((54 * Math.PI) / 180),
        y: -Math.sin((54 * Math.PI) / 180),
      },
      speed: 1000,
      zone: { minX: 65, maxX: 154, minY: 750, maxY: 829 },
    },
    right: {
      x: 366 + 95 / Math.tan((54 * Math.PI) / 180),
      y: 817,
      exit: { x: 366, y: 722 },
      direction: {
        x: -Math.cos((54 * Math.PI) / 180),
        y: -Math.sin((54 * Math.PI) / 180),
      },
      speed: 1000,
      zone: { minX: 422, maxX: 518, minY: 750, maxY: 829 },
    },
  },
};
