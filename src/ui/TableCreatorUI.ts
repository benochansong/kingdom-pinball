import type { UIManager } from "./UIManager";
import type { GameModeManager } from "../modes/GameModeManager";
import {
  newTable,
  validateTable,
  OBJECT_KINDS,
  type TableObject,
} from "../modes/TableCreator";
import { REGIONS } from "../config/campaign";
import { BUILDINGS } from "../config/buildings";
import { UNITS } from "../config/army";
const esc = (v: unknown) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const btn = (a: string, t: string) =>
  `<button data-action="creator:${a}">${t}</button>`;
export class TableCreatorUI {
  selected = "";
  private abort = new AbortController();
  private dragging = false;
  constructor(
    readonly ui: UIManager,
    readonly modes: GameModeManager,
  ) {
    const previous = ui.onAction;
    ui.onAction = (a) => this.action(a) || previous?.(a) || false;
    ui.dialog.addEventListener(
      "keydown",
      (e) => {
        const item = (e.target as Element).closest<SVGElement>("[data-object]");
        if (item && ["Enter", " "].includes(e.key)) {
          e.preventDefault();
          this.selected = item.dataset.object!;
          this.open();
        }
      },
      { signal: this.abort.signal },
    );
    ui.dialog.addEventListener(
      "pointerdown",
      (e) => {
        const item = (e.target as Element).closest<SVGElement>("[data-object]");
        if (item) {
          this.selected = item.dataset.object!;
          this.dragging = true;
          item.setPointerCapture?.(e.pointerId);
        }
      },
      { signal: this.abort.signal },
    );
    ui.dialog.addEventListener(
      "pointerup",
      (e) => {
        if (!this.dragging) return;
        this.dragging = false;
        const svg = ui.dialog.querySelector<SVGSVGElement>("#creator-grid"),
          o = this.object;
        if (svg && o) {
          const r = svg.getBoundingClientRect();
          o.x = Math.max(
            65,
            Math.min(
              510,
              Math.round(((e.clientX - r.left) * 600) / r.width / 10) * 10,
            ),
          );
          o.y = Math.max(
            110,
            Math.min(
              710,
              Math.round(((e.clientY - r.top) * 900) / r.height / 10) * 10,
            ),
          );
        }
        this.open();
      },
      { signal: this.abort.signal },
    );
  }
  get creator() {
    return this.modes.creator;
  }
  get object() {
    return this.creator.selected.objects.find((o) => o.id === this.selected);
  }
  private val(id: string) {
    return (
      (this.ui.dialog.querySelector("#creator-" + id) as HTMLInputElement)
        ?.value ?? ""
    );
  }
  action(a: string) {
    if (!a.startsWith("creator:")) return false;
    const [, cmd, arg] = a.split(":");
    try {
      switch (cmd) {
        case "open":
          this.open();
          break;
        case "new":
          this.creator.selected = newTable(this.val("template"));
          this.selected = "";
          this.open();
          break;
        case "load": {
          const t = this.creator.tables.find((t) => t.id === this.val("saved"));
          if (t) this.creator.selected = structuredClone(t);
          this.selected = "";
          this.open();
          break;
        }
        case "add": {
          const kind = this.val("kind") as TableObject["kind"],
            id = "object-" + Date.now().toString(36);
          this.creator.selected.objects.push({
            id,
            kind,
            name: kind.toUpperCase(),
            x: 300,
            y: 400,
            angle: 0,
            width: kind === "wall" || kind === "reflector" ? 90 : 40,
            height: kind === "wall" || kind === "reflector" ? 12 : 40,
            value: 100,
            type:
              kind === "building"
                ? "wall"
                : kind === "unit"
                  ? "swordsman"
                  : kind === "boss"
                    ? "greenwood"
                    : kind === "decoration"
                      ? "goal"
                      : "gold",
            side: "enemy",
            link: "",
          });
          this.selected = id;
          this.open();
          break;
        }
        case "select":
          this.selected = arg;
          this.open();
          break;
        case "apply":
          this.apply();
          this.open();
          break;
        case "rotate":
          if (this.object)
            this.object.angle = ((this.object.angle + 15 + 180) % 360) - 180;
          this.open();
          break;
        case "remove":
          this.creator.selected.objects = this.creator.selected.objects.filter(
            (o) => o.id !== this.selected,
          );
          this.selected = "";
          this.open();
          break;
        case "save":
          this.apply();
          this.creator.save();
          this.open();
          break;
        case "validate":
          this.apply();
          this.creator.message = this.report();
          this.open();
          break;
        case "test":
        case "play": {
          this.apply();
          const error = this.modes.testTable(cmd === "play");
          if (error) {
            this.creator.message = error;
            this.open();
          } else this.ui.close(false);
          break;
        }
        case "export":
          this.apply();
          {
            const validation = validateTable(this.creator.selected);
            if (validation.errors.length)
              throw Error(validation.errors.join(" · "));
            this.download();
          }
          break;
        case "import":
          this.ui.open(
            "IMPORT TABLE",
            `<p>최대 256KB JSON · 스크립트·HTML은 실행하지 않습니다. 가져온 파일의 검증 표시는 신뢰하지 않고 다시 테스트합니다.</p><textarea id="creator-json" rows="12" maxlength="256000" aria-label="테이블 JSON"></textarea>${btn("read", "가져오기")}`,
          );
          break;
        case "read":
          this.creator.import(this.val("json"));
          this.selected = "";
          this.open();
          break;
        default:
          return false;
      }
    } catch (e) {
      this.creator.message = (e as Error).message;
      this.open();
    }
    return true;
  }
  private apply() {
    const t = this.creator.selected;
    if (!this.ui.dialog.querySelector("#creator-name")) return;
    t.name = this.val("name").slice(0, 60);
    t.region = this.val("region");
    t.rule = this.val("rule") as any;
    t.goal = this.val("goal") as any;
    t.amount = +this.val("amount");
    t.seconds = +this.val("seconds");
    t.balls = +this.val("balls");
    t.preset = this.val("preset") as any;
    const o = this.object;
    if (o) {
      o.name = this.val("objectName").slice(0, 60);
      for (const k of ["x", "y", "width", "height", "angle", "value"] as const)
        o[k] = +this.val(k);
      o.type = this.val("type");
      o.link = this.val("link");
      o.side = this.val("side") as any;
    }
  }
  private report() {
    const v = validateTable(this.creator.selected);
    return [
      ...v.errors.map((e) => "오류: " + e),
      ...v.warnings,
      ...(!v.errors.length ? ["안전 검사 통과"] : []),
    ].join("\n");
  }
  private download() {
    const blob = new Blob([this.creator.export()], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download =
      (this.creator.selected.name.replace(/[^\w가-힣-]/g, "_") || "table") +
      ".kingdompinball.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  open() {
    const c = this.creator,
      t = c.selected,
      o = this.object;
    const select = (
        id: string,
        items: { id: string; name: string }[],
        value = "",
      ) =>
        `<select id="creator-${id}">${items.map((x) => `<option value="${esc(x.id)}" ${x.id === value ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>`,
      choices = (ids: string[]) => ids.map((id) => ({ id, name: id })),
      input = (id: string, n: number, min: number, max: number) =>
        `<input id="creator-${id}" type="number" value="${n}" min="${min}" max="${max}">`;
    this.ui.open(
      "TABLE CREATOR",
      `<p>600×900 안전 테이블 · 발사대/플리퍼/드레인 고정 · 10px 배치 그리드</p><p class="creator-notice">${esc(c.message)}</p><div class="mode-links">${select("template", choices(["Empty", "Classic", "Economic", "Fortress", "Magic", "Survival", "Puzzle"]))}${btn("new", "New")}${select(
        "saved",
        c.tables.map((x) => ({ id: x.id, name: x.name })),
        t.id,
      )}${btn("load", "Open")}${btn("save", "Save")}${btn("validate", "Validate")}${btn("test", "Test Table")}${btn("play", "Play")}${btn("export", "Export JSON")}${btn("import", "Import JSON")}</div><p>${c.isVerified(t) ? "✓ 직접 플레이 목표 달성 확인" : "검증 전 · Test Table에서 목표를 달성하면 Play가 해제됩니다."}</p><div class="creator-layout"><svg id="creator-grid" viewBox="0 0 600 900" role="img" aria-label="테이블 편집 그리드"><defs><pattern id="tablegrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#476156" stroke-width=".5"/></pattern></defs><rect width="600" height="900" fill="#102a30"/><rect x="65" y="110" width="460" height="610" fill="url(#tablegrid)" stroke="#d8bd7a"/><path d="M180 770L280 805M420 770L320 805M554 820L554 180" stroke="#bdc8a9" stroke-width="14"/><text x="260" y="860" fill="#99aaa2">DRAIN</text>${t.objects.map((x) => `<g data-object="${x.id}" role="button" tabindex="0" aria-label="${esc(x.name)} 선택" transform="translate(${x.x} ${x.y}) rotate(${x.angle})"><rect x="${-x.width / 2}" y="${-x.height / 2}" width="${x.width}" height="${x.height}" rx="${["target", "bumper", "portal"].includes(x.kind) ? Math.min(x.width, x.height) / 2 : 3}" fill="${x.id === this.selected ? "#e8cb7b" : "#569d95"}" fill-opacity=".5" stroke="#e8cb7b" stroke-width="2"/><text text-anchor="middle" y="4" font-size="12" fill="#fff">${esc(x.kind)}</text></g>`).join("")}</svg><div><label>도구 ${select("kind", choices([...OBJECT_KINDS]))}</label>${btn("add", "오브젝트 추가")}<div class="mode-form"><label>이름<input id="creator-name" maxlength="60" value="${esc(t.name)}"></label><label>지역 ${select("region", REGIONS, t.region)}</label><label>배경 ${select("preset", choices(["classic", "kingdom", "magic"]), t.preset)}</label><label>규칙 ${select("rule", choices(["classicScore", "resource", "war", "survival", "boss", "puzzle"]), t.rule)}</label><label>승리 목표 ${select("goal", choices(["score", "resources", "time", "hits", "kills", "boss", "zone"]), t.goal)}</label><label>목표 수치 ${input("amount", t.amount, 1, 1000000)}</label><label>시간(초) ${input("seconds", t.seconds, 10, 3600)}</label><label>공 개수 ${input("balls", t.balls, 1, 10)}</label></div>${btn("apply", "규칙 적용")}<details open><summary>선택 오브젝트</summary>${t.objects.map((x) => btn("select:" + x.id, esc(x.name))).join("")}${o ? `<div class="mode-form"><label>이름<input id="creator-objectName" value="${esc(o.name)}"></label>${(["x", "y", "width", "height", "angle", "value"] as const).map((k) => `<label>${k}${input(k, o[k], k === "angle" ? -180 : 0, k === "value" ? 10000 : k === "angle" ? 180 : 900)}</label>`).join("")}<label>유형 ${["building", "unit", "boss"].includes(o.kind) ? select("type", o.kind === "building" ? BUILDINGS : o.kind === "unit" ? UNITS : REGIONS, o.type) : `<input id="creator-type" value="${esc(o.type)}" placeholder="gold / goal">`}</label><label>진영 ${select("side", choices(["ally", "enemy"]), o.side)}</label><label>포털 출구 ${select("link", [{ id: "", name: "없음" }, ...t.objects.filter((x) => x.kind === "portal" && x.id !== o.id).map((x) => ({ id: x.id, name: x.name }))], o.link)}</label></div>${btn("apply", "속성 적용")}${btn("rotate", "15° 회전")}${btn("remove", "오브젝트 제거")}` : "그리드에서 오브젝트를 선택하고 끌어서 배치하세요."}</details></div></div>`,
      true,
    );
  }
  dispose() {
    this.abort.abort();
  }
}
