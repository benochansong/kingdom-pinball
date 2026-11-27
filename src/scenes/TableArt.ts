import {
  RAILS,
  tableRails,
  TARGETS,
  type TargetDefinition,
} from "../data/table";
export { drawRescueCannons } from "./RescueCannonArt";
type Ctx = CanvasRenderingContext2D;
const polygon = (
  c: Ctx,
  points: number[][],
  fill: string,
  stroke?: string,
): void => {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 1;
    c.stroke();
  }
};
function tree(c: Ctx, x: number, y: number, scale = 1, shade = 0): void {
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  c.fillStyle = "#10241c80";
  c.beginPath();
  c.ellipse(4, 6, 14, 6, -0.3, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#6c5840";
  c.fillRect(-2, -9, 4, 16);
  for (let i = 0; i < 3; i++)
    polygon(
      c,
      [
        [0, -40 + i * 10],
        [-14 + i * 2, -13 + i * 10],
        [14 - i * 2, -13 + i * 10],
      ],
      shade ? "#244c3e" : "#2e5c45",
      "#547653",
    );
  polygon(
    c,
    [
      [0, -40],
      [-3, -16],
      [11, -13],
    ],
    "#477450",
  );
  c.restore();
}
function stoneTower(c: Ctx, x: number, y: number, height: number): void {
  c.fillStyle = "#182d2a70";
  c.fillRect(x - 15, y - height + 10, 42, height + 8);
  c.fillStyle = "#b4b6a0";
  c.fillRect(x - 17, y - height, 34, height);
  c.fillStyle = "#747f74";
  c.fillRect(x + 5, y - height, 12, height);
  c.strokeStyle = "#6d80716b";
  c.lineWidth = 1;
  for (let row = 0; row < height / 9; row++) {
    const yy = y - row * 9;
    c.beginPath();
    c.moveTo(x - 17, yy);
    c.lineTo(x + 17, yy);
    c.stroke();
    for (let xx = x - 17 + (row % 2) * 9; xx < x + 17; xx += 17) {
      c.beginPath();
      c.moveTo(xx, yy);
      c.lineTo(xx, yy - 9);
      c.stroke();
    }
  }
  c.fillStyle = "#d0c9ac";
  c.fillRect(x - 20, y - height - 3, 40, 7);
  for (let i = 0; i < 4; i++)
    c.fillRect(x - 20 + i * 11, y - height - 11, 7, 10);
  c.fillStyle = "#263e39";
  c.beginPath();
  c.roundRect(x - 4, y - height + 15, 8, 15, [4, 4, 0, 0]);
  c.fill();
}
export function drawCastle(c: Ctx, x: number, y: number): void {
  c.save();
  c.translate(x, y);
  c.fillStyle = "#11262080";
  c.beginPath();
  c.ellipse(10, 12, 95, 22, 0, 0, Math.PI * 2);
  c.fill();
  polygon(
    c,
    [
      [-79, 0],
      [-66, -41],
      [61, -41],
      [78, 0],
    ],
    "#818d76",
    "#b8bc99",
  );
  c.fillStyle = "#9ba68e";
  c.fillRect(-60, -71, 120, 66);
  c.fillStyle = "#657766";
  c.fillRect(34, -71, 26, 66);
  c.strokeStyle = "#607762";
  for (let y2 = -67; y2 < 0; y2 += 10) {
    c.beginPath();
    c.moveTo(-60, y2);
    c.lineTo(60, y2);
    c.stroke();
  }
  stoneTower(c, -65, 0, 73);
  stoneTower(c, 65, 0, 78);
  stoneTower(c, -26, -40, 69);
  stoneTower(c, 27, -40, 80);
  polygon(
    c,
    [
      [-51, -109],
      [-26, -150],
      [-1, -109],
    ],
    "#41696a",
    "#83a19a",
  );
  polygon(
    c,
    [
      [2, -120],
      [27, -160],
      [52, -120],
    ],
    "#345558",
    "#83a19a",
  );
  polygon(
    c,
    [
      [-26, -150],
      [-26, -111],
      [-1, -109],
    ],
    "#284849",
  );
  c.fillStyle = "#23392e";
  c.beginPath();
  c.roundRect(-17, -41, 34, 39, [17, 17, 0, 0]);
  c.fill();
  c.strokeStyle = "#d1b56e";
  c.lineWidth = 3;
  c.stroke();
  c.fillStyle = "#d7be77";
  c.fillRect(-5, -59, 10, 9);
  c.strokeStyle = "#d6be7d";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(27, -160);
  c.lineTo(27, -185);
  c.stroke();
  polygon(
    c,
    [
      [28, -184],
      [60, -179],
      [53, -171],
      [28, -175],
    ],
    "#ccb16b",
  );
  c.restore();
}
export function drawTarget(c: Ctx, t: TargetDefinition): void {
  const { x, y, radius: r } = t;
  c.save();
  c.translate(x, y);
  c.fillStyle = "#0c1e1d80";
  c.beginPath();
  c.ellipse(5, 12, r + 8, r * 0.8, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#5f6855";
  c.beginPath();
  c.ellipse(0, 6, r + 4, r, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#263e35";
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#c9ac6a";
  c.lineWidth = 3;
  c.stroke();
  c.strokeStyle = "#68856a";
  c.lineWidth = 1;
  c.beginPath();
  c.arc(0, 0, r - 6, 0, Math.PI * 2);
  c.stroke();
  switch (t.kind) {
    case "forest":
      tree(c, -11, 2, 0.82);
      tree(c, 11, 6, 0.67);
      tree(c, 2, -9, 0.77);
      c.strokeStyle = "#b7a37a";
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(-17, 13);
      c.lineTo(13, 20);
      c.stroke();
      break;
    case "stone":
      polygon(
        c,
        [
          [-23, 14],
          [-24, -5],
          [-7, -28],
          [13, -22],
          [26, 13],
        ],
        "#8f9e93",
        "#b9c3ad",
      );
      polygon(
        c,
        [
          [-7, -28],
          [1, 13],
          [26, 13],
          [13, -22],
        ],
        "#657a72",
      );
      c.fillStyle = "#1b302a";
      c.beginPath();
      c.roundRect(-8, -3, 19, 23, [8, 8, 0, 0]);
      c.fill();
      c.strokeStyle = "#ae9870";
      c.lineWidth = 3;
      c.stroke();
      break;
    case "gold":
      polygon(
        c,
        [
          [-23, 16],
          [-21, -12],
          [-5, -25],
          [21, -10],
          [24, 16],
        ],
        "#796e49",
        "#bb9c53",
      );
      for (const [xx, yy] of [
        [-10, -10],
        [12, -5],
        [-1, -20],
        [5, 4],
      ])
        polygon(
          c,
          [
            [xx, yy - 5],
            [xx + 6, yy],
            [xx + 2, yy + 7],
            [xx - 5, yy + 3],
          ],
          "#efd17b",
          "#f6e4a7",
        );
      c.fillStyle = "#523f2c";
      c.fillRect(-9, 8, 25, 12);
      c.strokeStyle = "#b29d6b";
      c.strokeRect(-9, 8, 25, 12);
      break;
    case "crystal":
      c.fillStyle = "#6ca8b233";
      c.beginPath();
      c.arc(0, 0, r - 3, 0, Math.PI * 2);
      c.fill();
      polygon(
        c,
        [
          [-11, 9],
          [-15, -18],
          [0, -37],
          [14, -18],
          [11, 9],
          [0, 20],
        ],
        t.color === 0xc39ce4 ? "#b99ae1" : "#8cd2dd",
        "#d2f5e9",
      );
      polygon(
        c,
        [
          [0, -37],
          [14, -18],
          [11, 9],
          [0, 20],
        ],
        t.color === 0xc39ce4 ? "#725799" : "#3d869e",
      );
      polygon(
        c,
        [
          [0, -37],
          [-5, -13],
          [0, 20],
          [-11, 9],
          [-15, -18],
        ],
        "#e0d7ec",
      );
      break;
    case "farm":
      c.strokeStyle = "#bea85a";
      c.lineWidth = 2;
      for (let i = -20; i <= 20; i += 5) {
        c.beginPath();
        c.moveTo(i, 14);
        c.lineTo(i, -8);
        c.stroke();
        c.fillStyle = "#dbc47a";
        c.fillRect(i - 1, -12, 3, 8);
      }
      polygon(
        c,
        [
          [-8, 16],
          [-5, -17],
          [8, -17],
          [12, 16],
        ],
        "#b8b092",
        "#ded3a3",
      );
      polygon(
        c,
        [
          [-10, -16],
          [1, -29],
          [13, -16],
        ],
        "#735c42",
      );
      break;
    case "core":
      c.fillStyle = "#688d96";
      c.fillRect(-16, 6, 32, 8);
      c.fillStyle = "#a8c2bd";
      c.fillRect(-12, 2, 24, 5);
      polygon(
        c,
        [
          [0, -30],
          [11, -13],
          [0, 3],
          [-11, -13],
        ],
        "#8dd8ef",
        "#d0f4ff",
      );
      polygon(
        c,
        [
          [0, -30],
          [11, -13],
          [0, 3],
        ],
        "#418ba9",
      );
      c.strokeStyle = "#6dd7e3";
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(0, -9, 20, 7, -0.4, 0, Math.PI * 2);
      c.stroke();
      break;
    case "palace":
      c.fillStyle = "#d7bc76";
      c.font = "bold 31px Georgia";
      c.textAlign = "center";
      c.fillText("♛", 0, 10);
      break;
    case "bonus":
      c.fillStyle = "#8a6638";
      c.fillRect(-13, -9, 26, 21);
      c.strokeStyle = "#d8b66b";
      c.lineWidth = 2;
      c.strokeRect(-13, -9, 26, 21);
      c.fillStyle = "#d8b66b";
      c.fillRect(-3, -5, 6, 11);
      break;
  }
  c.restore();
}

/** Hand-drawn, seeded Canvas art, rendered once at double resolution. */
export function createTableArt(
  targets = TARGETS,
  levels: Record<string, number> = {},
  rank = 1,
  war = false,
  guards = true,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1800;
  const c = canvas.getContext("2d")!;
  c.scale(2, 2);
  const bg = c.createLinearGradient(0, 0, 600, 900);
  bg.addColorStop(0, "#486444");
  bg.addColorStop(0.5, "#294d3d");
  bg.addColorStop(1, "#17372e");
  c.fillStyle = bg;
  c.fillRect(0, 0, 600, 900);
  let seed = 7823;
  const random = (): number => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 2600; i++) {
    c.fillStyle = random() > 0.5 ? "#a8b8790e" : "#092d2115";
    c.beginPath();
    c.ellipse(
      random() * 600,
      random() * 900,
      2 + random() * 12,
      1 + random() * 5,
      0,
      0,
      Math.PI * 2,
    );
    c.fill();
  }
  // Old royal road and river; the ball travels on the same flat playfield.
  c.strokeStyle = "#9d996344";
  c.lineWidth = 47;
  c.beginPath();
  c.moveTo(285, 794);
  c.bezierCurveTo(405, 619, 123, 486, 282, 210);
  c.stroke();
  c.strokeStyle = "#b4ab6c22";
  c.lineWidth = 35;
  c.stroke();
  c.strokeStyle = "#427e7955";
  c.lineWidth = 24;
  c.beginPath();
  c.moveTo(50, 553);
  c.bezierCurveTo(225, 604, 378, 278, 530, 281);
  c.stroke();
  c.strokeStyle = "#9dbbb536";
  c.lineWidth = 1;
  c.stroke();
  for (let i = 0; i < 70; i++) {
    const side = i % 2;
    const x = side ? 475 + random() * 40 : 59 + random() * 47;
    const y = 220 + random() * 420;
    tree(c, x, y, 0.35 + random() * 0.45, i % 3);
  }
  for (let i = 0; i < 12; i++)
    tree(c, 121 + i * 28, 104 + random() * 18, 0.45 + random() * 0.3);
  c.save();
  c.setLineDash([3, 8]);
  c.lineWidth = 2;
  c.strokeStyle = "#c5ba7860";
  c.beginPath();
  c.moveTo(119, 291);
  c.bezierCurveTo(98, 167, 167, 100, 281, 97);
  c.bezierCurveTo(406, 96, 464, 154, 470, 266);
  c.stroke();
  c.restore();
  c.fillStyle = "#102a27";
  c.fillRect(540, 241, 28, 595);
  c.strokeStyle = "#77948c";
  c.lineWidth = 1;
  c.strokeRect(541, 242, 26, 590);
  for (let y = 300; y < 750; y += 50)
    polygon(
      c,
      [
        [549, y + 5],
        [554, y],
        [559, y + 5],
      ],
      "#bdc3a344",
    );
  for (const rail of tableRails(guards)) {
    if (rail.sling || rail.rescueGate) continue;
    const angle = Math.atan2(rail.b[1] - rail.a[1], rail.b[0] - rail.a[0]);
    const ax = rail.a[0] - Math.cos(angle) * 4,
      ay = rail.a[1] - Math.sin(angle) * 4;
    const bx = rail.b[0] + Math.cos(angle) * 4,
      by = rail.b[1] + Math.sin(angle) * 4;
    c.lineCap = "butt";
    c.strokeStyle = "#071b1a88";
    c.lineWidth = rail.width + 10;
    c.beginPath();
    c.moveTo(ax + 4, ay + 7);
    c.lineTo(bx + 4, by + 7);
    c.stroke();
    c.strokeStyle = "#46594d";
    c.lineWidth = rail.width;
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(bx, by);
    c.stroke();
    c.strokeStyle = "#a7ab87";
    c.lineWidth = rail.width - 7;
    c.stroke();
    c.strokeStyle = "#d6c795";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(ax - 3, ay - 3);
    c.lineTo(bx - 3, by - 3);
    c.stroke();
    const n = Math.floor(Math.hypot(bx - ax, by - ay) / 20);
    for (let i = 0; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n,
        y = ay + ((by - ay) * i) / n;
      c.save();
      c.translate(x, y);
      c.rotate(Math.atan2(by - ay, bx - ax));
      c.fillStyle = "#46594d";
      c.fillRect(-1, -rail.width / 2 + 2, 2, rail.width - 4);
      c.restore();
    }
  }

  // Brass-lined, carved slingshots.
  for (const mirrored of [false, true]) {
    c.save();
    if (mirrored) {
      c.translate(576, 0);
      c.scale(-1, 1);
    }
    polygon(
      c,
      [
        [111, 630],
        [182, 723],
        [128, 708],
      ],
      "#152e29",
      "#c2ad6a",
    );
    polygon(
      c,
      [
        [125, 657],
        [166, 713],
        [138, 703],
      ],
      "#66836a",
      "#9fa779",
    );
    c.strokeStyle = "#e0d19a";
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(112, 630);
    c.lineTo(182, 722);
    c.stroke();
    c.restore();
  }
  // The active rubber edges use the exact rectangles used by Matter, including asymmetric slings.
  for (const rail of RAILS.filter((r) => r.sling)) {
    const a = Math.atan2(rail.b[1] - rail.a[1], rail.b[0] - rail.a[0]);
    c.lineCap = "butt";
    c.lineWidth = rail.width;
    c.strokeStyle = "#b8ad77";
    c.beginPath();
    c.moveTo(rail.a[0] - Math.cos(a) * 4, rail.a[1] - Math.sin(a) * 4);
    c.lineTo(rail.b[0] + Math.cos(a) * 4, rail.b[1] + Math.sin(a) * 4);
    c.stroke();
    c.lineWidth = 3;
    c.strokeStyle = "#eee0ac";
    c.stroke();
  }
  if (!war) drawCastle(c, 282, 193);
  targets.forEach((t) => drawTarget(c, t));
  for (const t of targets) {
    const level = levels[t.id] ?? 1;
    if (level <= 1) continue;
    c.save();
    c.translate(t.x, t.y);
    for (let i = 0; i < level - 1; i++) {
      const xx = -22 + i * 13;
      if (t.kind === "forest") {
        c.strokeStyle = "#b09667";
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(xx, 22);
        c.lineTo(xx + 9, 25);
        c.stroke();
      } else if (t.kind === "farm") {
        c.fillStyle = "#d6c17d";
        c.fillRect(xx, 18, 4, 9);
      } else if (t.kind === "stone")
        polygon(
          c,
          [
            [xx, 21],
            [xx + 3, 12],
            [xx + 10, 16],
            [xx + 11, 24],
          ],
          "#b6c2b4",
          "#687d70",
        );
      else if (t.kind === "gold") {
        c.fillStyle = "#e6bf63";
        c.fillRect(xx, 17, 9, 6);
      } else
        polygon(
          c,
          [
            [xx, 19],
            [xx + 4, 11],
            [xx + 8, 19],
            [xx + 4, 26],
          ],
          t.kind === "core" ? "#8cdaec" : "#c3a6eb",
        );
    }
    if (level >= 3) {
      c.strokeStyle = "#e0cb8d";
      c.lineWidth = 1;
      c.beginPath();
      c.arc(0, 0, t.radius + 4, 0, Math.PI * 2);
      c.stroke();
    }
    if (level === 5) {
      c.fillStyle = "#f2d78d";
      c.font = "15px Georgia";
      c.textAlign = "center";
      c.fillText("♛", 0, -t.radius - 9);
    }
    c.restore();
  }
  for (let i = 1; i < rank; i++) {
    const x = 202 + i * 32;
    c.strokeStyle = "#d1b771";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x, 155);
    c.lineTo(x, 128);
    c.stroke();
    polygon(
      c,
      [
        [x, 128],
        [x + 15, 131],
        [x + 10, 141],
        [x, 138],
      ],
      rank >= 4 ? "#d9b76d" : "#7ba6a0",
    );
  }
  if (targets.some((t) => t.kind === "farm")) {
    c.fillStyle = "#a59a71";
    c.fillRect(68, 812, 34, 23);
    polygon(
      c,
      [
        [63, 812],
        [85, 798],
        [107, 812],
      ],
      "#73613c",
      "#c2af77",
    );
    c.fillStyle = "#e4d2a0";
    c.font = "9px Georgia";
    c.textAlign = "center";
    c.fillText("STORAGE", 85, 846);
  }
  c.textAlign = "center";
  c.fillStyle = "#d9d0a0";
  c.font = "11px Georgia";
  c.letterSpacing = "2px";
  c.fillText(
    war ? "K I N G D O M   W A R" : "G R E E N W O O D",
    285,
    targets.length > 6 ? 670 : 592,
  );
  c.font = "9px Georgia";
  c.fillStyle = "#b1c2a080";
  c.fillText("K I N G D O M", 285, targets.length > 6 ? 686 : 609);
  c.strokeStyle = "#b8ab7055";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(223, 626);
  c.lineTo(349, 626);
  c.stroke();
  c.fillStyle = "#152b26";
  c.fillRect(216, 866, 146, 34);
  c.fillStyle = "#a5aa8160";
  c.font = "10px Georgia";
  c.fillText("THE GATE OF RETURN", 289, 887);
  c.strokeStyle = "#d5be7755";
  c.lineWidth = 2;
  c.strokeRect(15, 15, 570, 870);
  return canvas;
}
