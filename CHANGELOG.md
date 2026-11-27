# Changelog

## 0.11.0-beta.1 — 2026-11-27

- Fixed paid kingdom/war ball loss getting stuck waiting for manual relaunch. A real replacement body now appears after 800ms of active game time, with exactly one energy payment. Insufficient energy follows the existing recovery/end rules.
- Fixed sandbox/roguelike saved balls retaining an in-flight economy state and rejecting their next launch.
- Preserved the surviving multiball when primary drain and multiball expiry happen in the same step; added bounded missing-body recovery and development diagnostics.
- Applied the same 800ms replacement delay and missing-body accounting to both authoritative online tables.
- Reorganized the main menu into play, modes, records and help groups. Added content-sized shared controls, responsive bilingual labels, keyboard-accessible sections and Korean/partial-English preferences.
- Added launch/recovery guidance, stopped ambient/combat audio at game over, and skipped distant units before precise sphere-hit calculations.
- Added lifecycle/server regressions, distribution license notices, nine render benchmark scenarios and a detailed release assessment in `docs/PHASE11.md`.
- This is a beta. Full English content, exhaustive manual campaign balancing, sustained high-load render targets and public online operations are not certified.

## 0.10.0 — 2026-11-27

Initial authoritative online PvP, cooperative survival/Iron Titan, guest rooms, reconnection, validated commands, SQLite results and private table sharing. See `docs/PHASE10.md` for supported scope and limitations.

## 0.9.0 — 2026-11-27

Regional procedural graphics, synthesized audio, presentation/accessibility settings and measured visual performance. See `docs/PHASE9.md`.

## Phases 1–8

Pinball physics, economy, building, armies, war, magic, campaign and offline modes. Their historical implementation and validation records are in `docs/PHASE*.md` and `docs/VALIDATION.md`; this changelog does not retroactively certify every requested feature.
