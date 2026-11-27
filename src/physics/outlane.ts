export type DrainLane = "left" | "right" | "center";
export function inFlipperApproach(x: number, y: number) {
  if (y < 705 || y > 815 || x < 160 || x > 416) return false;
  if (y >= 790) return x > 181 && x < 395;
  return (
    x > 86 + ((y - 675) * 91) / 115 + 19 &&
    x < 492 - ((y - 675) * 93) / 115 - 19
  );
}
/** Below-pivot crossings do not turn an outlane loss into a center drain. */
export function trackOutlane(
  previous: DrainLane,
  x: number,
  y: number,
): DrainLane {
  if (y < 675 && x > 110 && x < 466) return "center";
  if (y <= 705 || y >= 790) return previous;
  const leftGuide = 86 + ((y - 675) * 91) / 115;
  const rightGuide = 492 - ((y - 675) * 93) / 115;
  if (x < leftGuide - 8) return "left";
  if (x > rightGuide + 8 && x < 530) return "right";
  if (y < 786 && x > leftGuide + 19 && x < rightGuide - 19) return "center";
  return previous;
}
