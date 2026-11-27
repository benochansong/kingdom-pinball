import {
  defaultPresentation,
  sanitizePresentation,
  type PresentationSettings,
} from "../presentation/settings";
export interface Settings {
  presentation: PresentationSettings;
  music: number;
  effects: number;
  particles: boolean;
  shake: boolean;
  muted: boolean;
}
export interface RecordEntry {
  score: number;
  combo: number;
  hits: number;
  palaceHits: number;
  seconds: number;
  date: string;
}
export interface SaveData {
  version: 1;
  highScore: number;
  maxCombo: number;
  plays: number;
  totalSeconds: number;
  tutorialDone: boolean;
  recent: RecordEntry[];
  settings: Settings;
}
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const SAVE_KEY = "kingdom-pinball:v1";
const defaults = (): SaveData => ({
  version: 1,
  highScore: 0,
  maxCombo: 0,
  plays: 0,
  totalSeconds: 0,
  tutorialDone: false,
  recent: [],
  settings: {
    presentation: defaultPresentation(),
    music: 0.3,
    effects: 0.65,
    particles: true,
    shake: true,
    muted: false,
  },
});
const number = (
  value: unknown,
  fallback = 0,
  max = Number.MAX_SAFE_INTEGER,
): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(value, max)
    : fallback;
export class SaveManager {
  data = defaults();
  available = true;
  constructor(private storage?: StorageLike) {
    try {
      if (!storage) this.storage = globalThis.localStorage;
      const raw: unknown = JSON.parse(
        this.storage?.getItem(SAVE_KEY) ?? "null",
      );
      if (
        !raw ||
        typeof raw !== "object" ||
        !("version" in raw) ||
        raw.version !== 1
      )
        return;
      const input = raw as Partial<SaveData>;
      const settings: Partial<Settings> = input.settings ?? {};
      this.data = {
        ...defaults(),
        highScore: number(input.highScore),
        maxCombo: number(input.maxCombo),
        plays: number(input.plays),
        totalSeconds: number(input.totalSeconds),
        tutorialDone: input.tutorialDone === true,
        recent: Array.isArray(input.recent)
          ? input.recent
              .filter(
                (r) => r && typeof r === "object" && typeof r.date === "string",
              )
              .slice(0, 10)
              .map((r) => ({
                score: number(r.score),
                combo: number(r.combo),
                hits: number(r.hits),
                palaceHits: number(r.palaceHits),
                seconds: number(r.seconds),
                date: r.date.slice(0, 10),
              }))
          : [],
        settings: {
          presentation: sanitizePresentation(settings.presentation),
          music: number(settings.music, 0.3, 1),
          effects: number(settings.effects, 0.65, 1),
          particles: settings.particles !== false,
          shake: settings.shake !== false,
          muted: settings.muted === true,
        },
      };
    } catch {
      this.available = false;
    }
  }
  persist(): void {
    try {
      this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      this.available = false;
    }
  }
  record(entry: RecordEntry): void {
    this.data.highScore = Math.max(this.data.highScore, entry.score);
    this.data.maxCombo = Math.max(this.data.maxCombo, entry.combo);
    this.data.plays++;
    this.data.totalSeconds += entry.seconds;
    this.data.recent = [entry, ...this.data.recent].slice(0, 10);
    this.persist();
  }
}
