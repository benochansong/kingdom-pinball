export const QUALITIES = ["low", "medium", "high", "ultra"] as const;
export type Quality = (typeof QUALITIES)[number];
export const KEY_DEFAULTS = {
  left: "KeyA",
  right: "KeyD",
  launch: "Space",
  nudge: "KeyW",
  build: "KeyB",
  army: "KeyU",
  formation: "KeyF",
  war: "KeyL",
  magic: "Tab",
  multi: "KeyJ",
  storm: "KeyK",
};
export interface PresentationSettings {
  language: "bilingual" | "ko" | "en";
  quality: Quality;
  autoQuality: boolean;
  shakeAmount: number;
  reduceFlash: boolean;
  particleAmount: number;
  weather: boolean;
  lighting: "cycle" | "day" | "night" | "sunset";
  outline: boolean;
  contrast: boolean;
  symbols: boolean;
  uiScale: number;
  textScale: number;
  ui: "simple" | "advanced";
  cinematics: boolean;
  debug: boolean;
  master: number;
  pinball: number;
  combat: number;
  magic: number;
  ambience: number;
  uiSound: number;
  keys: typeof KEY_DEFAULTS;
}
export const defaultPresentation = (): PresentationSettings => ({
  language: "bilingual",
  quality: "high",
  autoQuality: true,
  shakeAmount: 0.35,
  reduceFlash: true,
  particleAmount: 1,
  weather: true,
  lighting: "cycle",
  outline: true,
  contrast: false,
  symbols: true,
  uiScale: 1,
  textScale: 1,
  ui: "simple",
  cinematics: true,
  debug: false,
  master: 0.8,
  pinball: 1,
  combat: 0.6,
  magic: 0.7,
  ambience: 0.22,
  uiSound: 0.35,
  keys: { ...KEY_DEFAULTS },
});
export function sanitizePresentation(raw: unknown): PresentationSettings {
  const d = defaultPresentation();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  for (const k of [
    "autoQuality",
    "reduceFlash",
    "weather",
    "outline",
    "contrast",
    "symbols",
    "cinematics",
    "debug",
  ] as const)
    if (typeof r[k] === "boolean") d[k] = r[k];
  for (const k of [
    "shakeAmount",
    "particleAmount",
    "master",
    "pinball",
    "combat",
    "magic",
    "ambience",
    "uiSound",
    "uiScale",
    "textScale",
  ] as const)
    if (typeof r[k] === "number" && Number.isFinite(r[k]))
      d[k] = Math.max(
        k === "uiScale" || k === "textScale" ? 0.85 : 0,
        Math.min(k === "uiScale" || k === "textScale" ? 1.4 : 1, r[k]),
      );
  if (QUALITIES.includes(r.quality as Quality))
    d.quality = r.quality as Quality;
  if (["cycle", "day", "night", "sunset"].includes(String(r.lighting)))
    d.lighting = r.lighting as PresentationSettings["lighting"];
  if (r.ui === "advanced") d.ui = "advanced";
  if (r.language === "ko" || r.language === "en") d.language = r.language;
  const keys = r.keys as Record<string, unknown> | undefined;
  if (keys && typeof keys === "object") {
    const candidate = { ...d.keys };
    for (const k of Object.keys(candidate) as (keyof typeof candidate)[]) {
      const value = keys[k];
      if (
        typeof value === "string" &&
        /^(Key[A-Z]|Space|Tab|ShiftLeft|ShiftRight|ControlLeft|ControlRight|Digit[0-9])$/.test(
          value,
        ) &&
        !["KeyM", "KeyR", "KeyZ", "KeyX", "KeyC", "KeyV"].includes(value)
      )
        candidate[k] = value;
    }
    if (
      new Set(Object.values(candidate)).size === Object.keys(candidate).length
    )
      d.keys = candidate;
  }
  return d;
}
export function canonicalKey(code: string, settings: PresentationSettings) {
  const action = (
    Object.keys(KEY_DEFAULTS) as (keyof typeof KEY_DEFAULTS)[]
  ).find((k) => settings.keys[k] === code);
  return action
    ? KEY_DEFAULTS[action]
    : Object.values(KEY_DEFAULTS).includes(code)
      ? "Unbound"
      : code;
}
export const QUALITY_BUDGET = {
  low: { particles: 32, decorations: 8, interval: 100, shadow: 0.18 },
  medium: { particles: 70, decorations: 18, interval: 66, shadow: 0.3 },
  high: { particles: 120, decorations: 30, interval: 33, shadow: 0.45 },
  ultra: { particles: 160, decorations: 48, interval: 16, shadow: 0.55 },
};
