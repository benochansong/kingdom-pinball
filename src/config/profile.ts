export const COSMETIC_CATEGORIES = [
  "crest",
  "flag",
  "palace",
  "sphere",
  "flipper",
  "bumper",
  "magic",
  "border",
  "result",
] as const;
export const COSMETICS = COSMETIC_CATEGORIES.flatMap((category) => [
  {
    id: `${category}-royal`,
    category,
    name: "ROYAL GOLD",
    color: 0xd9bc72,
    required: 0,
  },
  {
    id: `${category}-jade`,
    category,
    name: "JADE GUARDIAN",
    color: 0x75c9ad,
    required: 1,
  },
  {
    id: `${category}-ember`,
    category,
    name: "EMBER LEGEND",
    color: 0xe99a7a,
    required: 5,
  },
]);
export const cosmeticColor = (
  equipped: Record<string, string>,
  category: string,
) => COSMETICS.find((c) => c.id === equipped[category])?.color ?? 0xd9bc72;
export const TITLE_GOALS = [
  ["survival-10", "WAVE DEFENDER"],
  ["survival-25", "FORTRESS KEEPER"],
  ["survival-50", "ETERNAL GUARDIAN"],
  ["boss-first", "BOSS HUNTER"],
  ["boss-all", "CROWN BREAKER"],
  ["boss-legendary", "LEGEND SLAYER"],
  ["puzzle-5", "RUNE SEEKER"],
  ["puzzle-15", "PUZZLE SCHOLAR"],
  ["puzzle-90", "PERFECT MIND"],
  ["rogue-first", "PATHFINDER"],
  ["rogue-final", "REALM WALKER"],
  ["creator-first", "TABLE ARCHITECT"],
  ["daily-first", "DAWN CHALLENGER"],
];
