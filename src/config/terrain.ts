export type DeviceKind =
  | "wind"
  | "sand"
  | "ice"
  | "snow"
  | "heat"
  | "portal"
  | "gravity"
  | "rotate"
  | "breakable"
  | "gate"
  | "bumper"
  | "scout";
export interface TerrainDevice {
  id: string;
  kind: DeviceKind;
  x: number;
  y: number;
  radius: number;
  to?: { x: number; y: number };
  direction?: number;
}
const d = (
  id: string,
  kind: DeviceKind,
  x: number,
  y: number,
  radius: number,
  extra: Partial<TerrainDevice> = {},
): TerrainDevice => ({ id: `env-${id}`, kind, x, y, radius, ...extra });
export const TERRAIN: Record<string, TerrainDevice[]> = {
  greenwood: [d("timber", "scout", 470, 410, 14)],
  shadow: [
    d("scout", "scout", 470, 410, 17),
    d("root", "rotate", 120, 450, 28),
    d("mist", "sand", 300, 385, 60),
  ],
  iron: [
    d("metal", "bumper", 470, 410, 18),
    d("wheel", "rotate", 120, 450, 28),
    d("ore", "scout", 320, 405, 15),
  ],
  desert: [
    d("sun", "scout", 470, 410, 17),
    d("sand", "sand", 160, 450, 72),
    d("wind", "wind", 350, 395, 80, { direction: 0 }),
    d("oasis", "ice", 330, 550, 55),
  ],
  frost: [
    d("ice", "ice", 170, 450, 80),
    d("snow", "snow", 330, 550, 60),
    d("icewall", "breakable", 470, 410, 19),
  ],
  volcano: [
    d("vent", "heat", 140, 425, 55, { direction: -Math.PI / 2 }),
    d("lava", "heat", 450, 430, 55, { direction: -2 }),
    d("rock", "rotate", 320, 405, 24),
  ],
  arcane: [
    d("portal-in", "portal", 120, 420, 24, { to: { x: 465, y: 450 } }),
    d("portal-out", "portal", 465, 450, 24, { to: { x: 120, y: 420 } }),
    d("gravity", "gravity", 310, 390, 65, { direction: -Math.PI / 2 }),
    d("rune", "scout", 320, 530, 16),
  ],
  dark: [
    d("gate", "gate", 120, 420, 19),
    d("crystal", "breakable", 470, 410, 19),
    d("portal-in", "portal", 160, 510, 24, { to: { x: 465, y: 450 } }),
    d("portal-out", "portal", 465, 450, 24, { to: { x: 160, y: 510 } }),
    d("heat", "heat", 330, 420, 60, { direction: -Math.PI / 2 }),
    d("gravity", "gravity", 330, 420, 65, { direction: Math.PI }),
  ],
};
