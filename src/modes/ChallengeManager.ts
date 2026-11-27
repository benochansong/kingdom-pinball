import { SeededRandom } from "./SeededRandom";
import { MODE_VERSION, defaultModeOptions } from "../config/modes";
import { REGIONS } from "../config/campaign";
export function isoWeek(date: Date) {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear(),
    first = new Date(Date.UTC(year, 0, 1));
  return `${year}-W${String(Math.ceil(((+d - +first) / 86400000 + 1) / 7)).padStart(2, "0")}`;
}
export function challenge(kind: "daily" | "weekly", now = new Date()) {
  const period =
      kind === "daily" ? now.toISOString().slice(0, 10) : isoWeek(now),
    id = `${kind}:${period}:${MODE_VERSION}`,
    rng = new SeededRandom(SeededRandom.hash(id)),
    options = defaultModeOptions();
  options.seed = SeededRandom.hash(id);
  options.region = rng.pick(REGIONS).id;
  options.difficulty = "normal";
  options.preparation = 30;
  options.limit = kind === "daily" ? 600 : 1800;
  const template = rng.pick([
    "fortress",
    "magic",
    "economy",
    "siege",
    "multiball",
    "boss",
  ]);
  options.variant = template;
  options.start =
    template === "economy"
      ? "economic"
      : template === "fortress"
        ? "fortress"
        : ["magic", "multiball"].includes(template)
          ? "magic"
          : "balanced";
  const goal =
    template === "economy"
      ? kind === "daily"
        ? 800
        : 2500
      : template === "magic"
        ? kind === "daily"
          ? 2
          : 6
        : template === "multiball"
          ? kind === "daily"
            ? 1
            : 3
          : template === "boss"
            ? 1
            : template === "fortress"
              ? kind === "daily"
                ? 300
                : 900
              : kind === "daily"
                ? 2
                : 5;
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  if (kind === "weekly")
    next.setUTCDate(next.getUTCDate() + ((7 - next.getUTCDay() + 1) % 7));
  return {
    id,
    period,
    seed: options.seed,
    options,
    template,
    goal,
    next,
    description:
      template === "economy"
        ? `자원 ${goal} 생산`
        : template === "magic"
          ? `주문 ${goal}회 시전`
          : template === "multiball"
            ? `멀티볼 ${goal}회 발동`
            : template === "boss"
              ? "지역 보스 1기 격파"
              : template === "fortress"
                ? `왕궁 ${goal}초 방어`
                : `적 시설 ${goal}개 파괴`,
  };
}
