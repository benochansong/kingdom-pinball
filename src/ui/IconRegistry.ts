import type { ResourceId } from "../config/economy";
const paths: Record<ResourceId, string> = {
  wood: "M12 2 3 14h6v7h6v-7h6Z",
  stone: "m3 8 6-5h9l4 8-7 10H6L2 15Z M9 3l6 8 7 0 M15 11l-9 10",
  gold: "m12 2 10 10-10 10L2 12Z M12 7l5 5-5 5-5-5Z",
  food: "M12 22V3 M12 9C3 9 3 2 3 2c9 0 9 7 9 7 M12 15C3 15 3 9 3 9c9 0 9 6 9 6 M12 11c9 0 9-8 9-8-9 0-9 8-9 8 M12 18c9 0 9-7 9-7-9 0-9 7-9 7",
  mana: "m12 1 8 9-3 10H7L4 10Z M12 1v21 M4 10h16",
  energy: "M14 1 3 14h8l-1 9 11-14h-8Z",
};
export const resourceSVG = (id: ResourceId) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="${paths[id]}"/></svg>`;
export const worldTerrainSVG = () =>
  `<g opacity=".65" aria-hidden="true"><path d="M285 115 Q345 210 270 305 T345 570" fill="none" stroke="#669aaf" stroke-width="8"/><ellipse cx="320" cy="400" rx="32" ry="18" fill="#548598"/>${Array.from({ length: 11 }, (_, i) => `<path d="m${315 + i * 20} ${120 + (i % 3) * 14} 16-38 24 38Z" fill="#80918f" stroke="#bec4a3"/>`).join("")}${Array.from({ length: 18 }, (_, i) => `<path d="m${100 + (i % 6) * 24} ${260 + Math.floor(i / 6) * 28} 9-23 10 23Z" fill="#315e4d" stroke="#73917a"/>`).join("")}<path d="M675 220 715 145 760 230Z" fill="#594849" stroke="#b4997a"/><path d="m705 162 10-17 12 20-10-5Z" fill="#ec9760"/><path d="M555 475q40-35 80 0t80 0M565 500q40-35 80 0t80 0" fill="none" stroke="#d0b583" stroke-width="5"/></g>`;
