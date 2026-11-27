import { readFileSync, writeFileSync } from "node:fs";
const before = JSON.parse(readFileSync("docs/pinball-before.json", "utf8"));
const after = JSON.parse(readFileSync("docs/pinball-after.json", "utf8"));
const stats = (a) => {
  const drains = a.filter((t) =>
      ["left", "right", "center"].includes(t.result),
    ),
    side = (k) => a.filter((t) => t.result === k).length;
  const mean = (k) => a.reduce((n, t) => n + t[k], 0) / a.length,
    sorted = a.map((t) => t.seconds).sort((a, b) => a - b);
  const L = side("left"),
    R = side("right");
  return {
    n: a.length,
    drains: drains.length,
    left: L,
    right: R,
    center: side("center"),
    returned: side("returned"),
    censored: side("censored"),
    leftAttemptPct: (100 * L) / a.length,
    rightAttemptPct: (100 * R) / a.length,
    outlaneAttemptPct: (100 * (L + R)) / a.length,
    rightOfDrainsPct: (100 * R) / Math.max(1, drains.length),
    rightOfOutlanesPct: (100 * R) / Math.max(1, L + R),
    early: Object.fromEntries(
      [3, 5, 10, 15].map((s) => [
        s,
        drains.filter((t) => t.seconds <= s).length,
      ]),
    ),
    beforeApproach: drains.filter((t) => t.firstApproach === null).length,
    beforeHit: drains.filter((t) => t.firstHit === null).length,
    meanSeconds: mean("seconds"),
    medianSeconds:
      (sorted[Math.floor((a.length - 1) / 2)] +
        sorted[Math.floor(a.length / 2)]) /
      2,
    maxSeconds: sorted.at(-1),
    meanFlipperHits: mean("hits"),
    meanApproaches: mean("approaches"),
    meanBumpers: mean("bumpers"),
    meanFirstApproach:
      a
        .filter((t) => t.firstApproach !== null)
        .reduce((n, t) => n + t.firstApproach, 0) /
      Math.max(1, a.filter((t) => t.firstApproach !== null).length),
  };
};
const groups = [];
for (const table of ["all", "classic", "kingdom", "war"])
  for (const policy of ["none", "basic", "timed", "mirrored"])
    for (const power of ["all", "50–100%", 0.25, 0.5, 0.75, 1]) {
      const select = (t) =>
        (table === "all" || t.table === table) &&
        t.policy === policy &&
        (power === "all" ||
          (power === "50–100%" && t.power >= 0.5) ||
          t.power === power);
      groups.push({
        table,
        policy,
        power,
        before: stats(before.trials.filter(select)),
        after: stats(after.trials.filter(select)),
      });
    }
writeFileSync(
  "docs/pinball-comparison.json",
  JSON.stringify(
    { baseline: "b0c9be4", date: "2026-11-27", notes: before.notes, groups },
    null,
    2,
  ),
);
const f = (n) => Number(n).toFixed(2),
  pair = (r, k) => `${f(r.before[k])} → ${f(r.after[k])}`;
let md =
  "# PHASE 11.1 — 반복 측정\n\n2026-11-27. 수정 전/후 각 4,800회: 3개 기본 목표물 테이블 × 4개 입력 정책 × 4개 발사 강도 × 100개 시드. BALL SAVE/킥백 모두 꺼짐. Matter.js 실제 엔진 240 Hz, 회당 90초 상한. 건물·지역 장치·군대 없는 기본 목표물 배치 비교이며 사람의 실력 등급을 뜻하지 않는다.\n\n원본: [수정 전](pinball-before.json), [수정 후](pinball-after.json), [전체 분류](pinball-comparison.json). 수정 전 엔진은 `b0c9be4`. `BALANCE_BASELINE=1` 환경 변수는 해당 버전과 같은 authored 물리 프리셋을 사용한다. 원래 수정 전 실행과 재측정 4,800회의 시간·플리퍼 타격·범퍼 타격이 모두 일치했다([대조 기록](pinball-baseline-verification.json)). 실행 명령은 [재현 절차](PHASE11_1.md#재현-명령)를 따른다. 도랑 구분은 실제 가이드 레일 바깥 진입을 추적하며 플리퍼 아래에서 중앙으로 이동해도 도랑 아웃으로 유지한다. 이 분류 기준을 수정 전후에 동일하게 적용했다. 초기 사각 영역 분류 실험값은 최종 비교에서 제외했다.\n\n발사 강도는 ±3%p, 입력 높이는 ±12px의 고정 시드 변동. basic은 하단 745px 이후, timed는 705px 이후 120ms 유지하며, mirrored는 timed의 좌우 트리거 여유 오차 부호를 반전한다. 두 정책은 이번 표본에서 결과가 같았다. 전체 테이블을 좌우 반전한 실험은 아니다. 별도 자동 테스트에서 좌우 플리퍼의 대응 접점·속도 대칭을 검사한다.\n\n**해석 주의:** 평균·중앙값은 발사부터 첫 드레인/회수/90초 종료까지의 관찰 길이이다. 회수 종료와 90초 검열을 포함하므로 완결된 평균 생존 시간이 아니다. 특히 무입력/일찍 올린 플리퍼 정책은 수동 바운스·캐치로 90초에 도달하는 비율이 높다. 오래 머무르는 것만으로 조작감이 좋아졌다고 판정하지 않는다. 90초를 넘는 최장 생존과 사람의 25–40/40–65/70–120초 목표 달성은 미측정이다.\n\n## 전체 발사 강도: 정책별\n\n| 정책 | n | 왼쪽 아웃 | 오른쪽 아웃 | 중앙 아웃 | 회수 | 90초 종료 | 평균 관찰초 | 평균 유효 타격 | 평균 접근 |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n";
for (const r of groups.filter((r) => r.table === "all" && r.power === "all"))
  md += `| ${r.policy} | ${r.before.n} | ${pair(r, "left")} | ${pair(r, "right")} | ${pair(r, "center")} | ${pair(r, "returned")} | ${pair(r, "censored")} | ${pair(r, "meanSeconds")} | ${pair(r, "meanFlipperHits")} | ${pair(r, "meanApproaches")} |\n`;
md +=
  "\n## 기본 입력의 전체 표본과 50–100% 표본\n\n| 테이블 / 강도 | n | 왼쪽/발사 % | 오른쪽/발사 % | 도랑/발사 % | 오른쪽/전체 아웃 % | 오른쪽/도랑 아웃 % | 10초 조기 아웃 건수 | 접근 전 아웃 | 타격 전 아웃 | 평균초 | 중앙초 | 타격/공 |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n";
for (const r of groups.filter(
  (r) => r.policy === "basic" && ["all", "50–100%"].includes(r.power),
))
  md += `| ${r.table} / ${r.power} | ${r.before.n} | ${pair(r, "leftAttemptPct")} | ${pair(r, "rightAttemptPct")} | ${pair(r, "outlaneAttemptPct")} | ${pair(r, "rightOfDrainsPct")} | ${pair(r, "rightOfOutlanesPct")} | ${r.before.early[10]} → ${r.after.early[10]} | ${pair(r, "beforeApproach")} | ${pair(r, "beforeHit")} | ${pair(r, "meanSeconds")} | ${pair(r, "medianSeconds")} | ${pair(r, "meanFlipperHits")} |\n`;
md +=
  "\n## 기본 입력: 발사 강도별\n\n| 강도 | n | 왼쪽 | 오른쪽 | 중앙 | 회수 | 10초 조기 아웃 | 접근 전 아웃 | 평균초 | 타격/공 |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n";
for (const r of groups.filter(
  (r) =>
    r.table === "all" && r.policy === "basic" && typeof r.power === "number",
))
  md += `| ${r.power * 100}% | ${r.before.n} | ${pair(r, "left")} | ${pair(r, "right")} | ${pair(r, "center")} | ${pair(r, "returned")} | ${r.before.early[10]} → ${r.after.early[10]} | ${pair(r, "beforeApproach")} | ${pair(r, "meanSeconds")} | ${pair(r, "meanFlipperHits")} |\n`;
md +=
  "\n## 실제 게임 보호·경제 비교\n\n[원본](pinball-protection.json). 실제 GameStateManager 왕국/전쟁, 각 모드·난이도·보호 유무마다 4강도 × 5시드 = 20회, 전체 240회. 90초 상한, basic 입력. 무료 공은 즉시 재발사하며 첫 유료 손실에서 종료한다. 전쟁은 180초 준비기간이므로 이 측정에서는 전투 AI가 시작하지 않는다. 따라서 전쟁 승률/병력 전략의 장기 밸런스 결과로 해석할 수 없다. 스킬/멀티볼/궁극기는 자동 발동하지 않고 충전만 기록한다.\n\n| 모드 | 난이도 | 평균 전체 관찰초 (보호 없음 → 있음) | 무료 복구 횟수 | 킥백 횟수 | 목재/석재/금화/식량/마력석 평균 생산 (없음 → 있음) |\n|---|---|---:|---:|---:|---|\n";
const p = JSON.parse(readFileSync("docs/pinball-protection.json", "utf8"));
for (const mode of ["kingdom", "war"])
  for (const difficulty of ["beginner", "normal", "expert"]) {
    const a = p.rows.filter(
        (r) => r.mode === mode && r.difficulty === difficulty && !r.protection,
      ),
      b = p.rows.filter(
        (r) => r.mode === mode && r.difficulty === difficulty && r.protection,
      );
    const mean = (a, k) => a.reduce((n, r) => n + r[k], 0) / a.length;
    md += `| ${mode} | ${difficulty} | ${f(mean(a, "seconds"))} → ${f(mean(b, "seconds"))} | ${b.reduce((n, r) => n + r.saves, 0)} | ${b.reduce((n, r) => n + r.kickbacks, 0)} | ${["wood", "stone", "gold", "food", "mana"].map((k) => `${f(a.reduce((n, r) => n + r.produced[k], 0) / a.length)} → ${f(b.reduce((n, r) => n + r.produced[k], 0) / b.length)}`).join(" / ")} |\n`;
  }
writeFileSync("docs/PINBALL_MEASUREMENTS.md", md);
console.log(
  JSON.stringify(
    groups.filter(
      (r) =>
        r.table === "all" &&
        r.policy === "basic" &&
        ["all", "50–100%"].includes(r.power),
    ),
    null,
    2,
  ),
);
