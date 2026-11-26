import type { UnitEntity } from "./types";

/** Broad-phase buckets for nearby AI and separation; never participates in Matter. */
export class SpatialGrid {
  private cells = new Map<string, UnitEntity[]>();
  private size = 80;
  rebuild(units: UnitEntity[]) {
    this.cells.clear();
    for (const u of units) {
      const key = `${Math.floor(u.x / this.size)},${Math.floor(u.y / this.size)}`;
      const bucket = this.cells.get(key) ?? [];
      bucket.push(u);
      this.cells.set(key, bucket);
    }
  }
  near(x: number, y: number, radius: number) {
    const found: UnitEntity[] = [];
    for (
      let row = Math.floor((y - radius) / this.size);
      row <= Math.floor((y + radius) / this.size);
      row++
    )
      for (
        let col = Math.floor((x - radius) / this.size);
        col <= Math.floor((x + radius) / this.size);
        col++
      )
        for (const u of this.cells.get(`${col},${row}`) ?? [])
          if (Math.abs(u.x - x) <= radius && Math.abs(u.y - y) <= radius)
            found.push(u);
    return found;
  }
}
