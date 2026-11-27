# KINGDOM PINBALL asset register

No commercial game art, music, samples or characters are copied. No externally hosted font or image is required to play.

| Asset | Source / author | License / attribution | Actual path |
| --- | --- | --- | --- |
| Table, castle, terrain, metallic sphere | Original code authored for this project | Project-authored; no third-party asset attribution | `src/scenes/TableArt.ts`, `src/scenes/PinballScene.ts` |
| Building silhouettes, level ornaments, flags, workers | Original procedural Canvas/Phaser graphics | Project-authored; no external asset license | `src/presentation/BuildingVisuals.ts` |
| Eight regional decorations, lighting, weather | Original procedural graphics | Project-authored; no external asset license | `src/presentation/WorldPresentation.ts`, `src/campaign/CampaignRenderer.ts` |
| Eight soldier silhouettes and pose textures | Original procedural Phaser graphics | Project-authored; no external asset license | `src/army/ArmyRenderer.ts` |
| Spell glyphs, particles, trails and HUD | Original code / system text glyphs | No downloaded icon pack; system glyphs are rendered, not redistributed | `src/magic/MagicRenderer.ts`, `src/effects/EffectsManager.ts`, `src/ui/` |
| Resource icons and world map terrain | Original SVG paths | Project-authored; no external asset license | `src/ui/IconRegistry.ts`, `public/crest.svg` |
| Music, regional ambience, impact and combat effects | Original Web Audio oscillator compositions | No external recordings or samples; no third-party attribution | `src/audio/AudioManager.ts`, `src/audio/MusicDirector.ts` |
| Fonts | User operating system font stack: Malgun Gothic, Apple SD Gothic Neo, Georgia, system sans-serif | Fonts are not included or redistributed | CSS font stacks |
| Phaser / Matter.js | Their respective npm packages and upstream authors | MIT; retain package license notices | `node_modules/phaser`, `node_modules/matter-js` |
| ws WebSocket runtime | ws npm package and contributors | MIT; retained verbatim in distribution notices | `node_modules/ws/LICENSE` |
| Online board and menu controls | Original Canvas / HTML / CSS | Project-authored; no downloaded art | `src/network/MultiplayerUI.ts`, `src/ui/ReleaseUI.ts` |

The runtime package license texts are included verbatim in `public/THIRD_PARTY_NOTICES.txt` and copied into `dist/THIRD_PARTY_NOTICES.txt` by Vite. Server distributors must retain the ws notice with the server package. The development toolchain is recorded in `package-lock.json`; its packages keep their own license files when installed.

The project does not currently include recorded orchestral/choral music or photorealistic assets. `MUSIC_TRACKS` lists synthesized moods with `path: null`, so missing files are never requested. Future recorded tracks require their own source, permission and attribution entries before inclusion. This register documents asset provenance; it does not assign a new license to the entire repository.
