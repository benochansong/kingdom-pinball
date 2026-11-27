import { REGIONS, STAGES, stage } from "../config/campaign";
import type { CampaignProfile } from "./types";
export function regionLocked(p: CampaignProfile, id: string): string | null {
  if (id === "greenwood" || p.cores.includes(id)) return null;
  if (["shadow", "iron"].includes(id))
    return p.cores.includes("greenwood") ? null : "초록 평원 정복 필요";
  if (["desert", "frost"].includes(id))
    return p.cores.some((id) => ["shadow", "iron"].includes(id))
      ? null
      : "검은 숲 또는 철의 산맥 정복 필요";
  if (["volcano", "arcane"].includes(id))
    return p.cores.length >= 4 ? null : "앞선 지역 4곳 정복 필요";
  return REGIONS.slice(0, 7).every((r) => p.cores.includes(r.id))
    ? null
    : "앞선 일곱 WORLD CORE 파편 필요";
}
export function stageLocked(p: CampaignProfile, id: string) {
  const s = stage(id);
  if (!s) return "존재하지 않는 스테이지입니다.";
  return (
    regionLocked(p, s.region) ??
    (s.index && !p.records[`${id.split("-")[0]}-${s.index}`]?.wins
      ? "앞선 스테이지 완료 필요"
      : null)
  );
}
export function campaignAchievements(p: CampaignProfile) {
  const awards = [
    "FIRST TERRITORY",
    "FOREST CONQUEROR",
    "MOUNTAIN KING",
    "DESERT EMPEROR",
    "FROST BREAKER",
    "DRAGON SLAYER",
    "MASTER OF ARCANA",
    "DARKNESS FALLS",
  ];
  REGIONS.forEach((r, i) => {
    if (p.cores.includes(r.id) && !p.achievements.includes(awards[i]))
      p.achievements.push(awards[i]);
  });
  if (p.cores.length === 8)
    for (const id of ["WORLD CORE RESTORED", "UNITED CONTINENT"])
      if (!p.achievements.includes(id)) p.achievements.push(id);
  if (
    STAGES.every((s) => p.records[s.id]?.stars === 3) &&
    !p.achievements.includes("PERFECT CAMPAIGN")
  )
    p.achievements.push("PERFECT CAMPAIGN");
  if (
    REGIONS.every(
      (_, i) => p.records[`${i + 1}-3`]?.difficulty.legendary?.stars,
    ) &&
    !p.achievements.includes("LEGENDARY EMPEROR")
  )
    p.achievements.push("LEGENDARY EMPEROR");
}
