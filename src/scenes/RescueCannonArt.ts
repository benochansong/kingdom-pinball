import { RESCUE } from "../config/rescue";
import { tableRails } from "../data/table";
import type { RescueData } from "../systems/RescueCannon";
/** Same shared renderer for the local table and server-authoritative online tables. */
export function drawRescueCannons(
  c: CanvasRenderingContext2D,
  data?: RescueData,
  pulse = 0,
  reduceFlash = false,
) {
  for (const rail of tableRails().filter((r) => r.rescueGate)) {
    const open = data?.gates?.[rail.rescueGate!] ?? false;
    c.save();
    c.lineCap = "butt";
    if (!open) {
      c.strokeStyle = "#283d40";
      c.lineWidth = rail.width;
      c.beginPath();
      c.moveTo(...rail.a);
      c.lineTo(...rail.b);
      c.stroke();
      c.strokeStyle = "#a3b6b5";
      c.lineWidth = rail.width - 6;
      c.stroke();
      c.strokeStyle = "#c9a45e";
      c.lineWidth = 3;
      c.stroke();
    }
    for (const p of [rail.a, rail.b]) {
      c.fillStyle = open ? "#d9e5bd" : "#a08a58";
      c.beginPath();
      c.arc(p[0], p[1], 5, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }
  for (const side of ["left", "right"] as const) {
    const p = RESCUE.cannons[side],
      ready = !data || data.used < data.total;
    const active = data?.side === side && !!data.pending;
    const firing = data?.side === side && data.phase === "RESCUE_LAUNCHING";
    const gold = ready ? "#eac36a" : "#72694f",
      steel = ready ? "#9eafb1" : "#4a5655";
    c.save();
    // Intake and catch bed sit inside the outlane, outside the flipper pivot.
    c.fillStyle = "#071a1e";
    c.strokeStyle = gold;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(p.x - 27, p.y - 36);
    c.lineTo(p.x - 26, p.y + 20);
    c.quadraticCurveTo(p.x, p.y + 34, p.x + 26, p.y + 20);
    c.lineTo(p.x + 27, p.y - 36);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = "#66462f";
    c.fillRect(p.x - 25, p.y + 7, 50, 17);
    c.strokeRect(p.x - 25, p.y + 7, 50, 17);
    c.fillStyle = "#b99257";
    for (const x of [-20, 20]) {
      c.beginPath();
      c.arc(p.x + x, p.y + 16, 3, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = active ? "#f1c864" : "#12242b";
    c.beginPath();
    c.ellipse(p.x, p.y - 27, 23, 11, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.strokeStyle = active ? "#fff1b0" : steel;
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(p.x - 24, p.y - 29);
    c.lineTo(p.x - 18, p.y - 12);
    c.moveTo(p.x + 24, p.y - 29);
    c.lineTo(p.x + 18, p.y - 12);
    c.stroke();
    // Short, flared steel barrel with a dark open muzzle and two brass bands.
    c.save();
    c.translate(p.x, p.y);
    c.rotate(Math.atan2(p.direction.y, p.direction.x));
    if (firing) c.translate(-4, 0);
    const metal = c.createLinearGradient(0, -14, 0, 14);
    metal.addColorStop(0, "#283d44");
    metal.addColorStop(0.35, steel);
    metal.addColorStop(0.55, "#e2e5cc");
    metal.addColorStop(1, "#283d44");
    c.fillStyle = metal;
    c.strokeStyle = gold;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-12, -15);
    c.quadraticCurveTo(-22, 0, -12, 15);
    c.lineTo(41, 12);
    c.lineTo(41, -12);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = gold;
    c.fillRect(3, -15, 6, 30);
    c.fillRect(27, -14, 6, 28);
    c.fillStyle = "#0a171d";
    c.lineWidth = 5;
    c.beginPath();
    c.ellipse(43, 0, 8, 17, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.strokeStyle = steel;
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(44, 0, 4, 11, 0, 0, Math.PI * 2);
    c.stroke();
    if (firing) {
      c.globalAlpha = reduceFlash ? 0.25 : 0.75;
      c.fillStyle = "#ffe9a2";
      c.beginPath();
      c.ellipse(58, 0, 16, 12, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    // Royal crown on the wooden bed, not a directional arrow.
    c.fillStyle = gold;
    c.beginPath();
    c.moveTo(p.x - 9, p.y + 8);
    c.lineTo(p.x - 5, p.y + 12);
    c.lineTo(p.x, p.y + 5);
    c.lineTo(p.x + 5, p.y + 12);
    c.lineTo(p.x + 9, p.y + 8);
    c.lineTo(p.x + 7, p.y + 20);
    c.lineTo(p.x - 7, p.y + 20);
    c.closePath();
    c.fill();
    if (active) {
      c.globalAlpha = reduceFlash ? 0.2 : 0.3 + 0.15 * Math.sin(pulse);
      c.fillStyle = "#ffda68";
      c.beginPath();
      c.ellipse(p.x, p.y - 17, 27, 32, 0, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    }
    c.fillStyle = ready ? "#f0d68c" : "#6c7772";
    c.font = "bold 10px Georgia";
    c.textAlign = "center";
    c.fillText(ready ? "RESCUE" : "EMPTY", p.x, p.y + 44);
    c.restore();
  }
}
