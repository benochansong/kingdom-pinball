import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { MatchResult, OnlineProfile } from "../src/network/protocol";
import { importTable, validateTable } from "../src/modes/TableCreator";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
/** One process owns SQLite. Unique Match IDs make settlement retry-safe. */
export class OnlineStore {
  readonly db: DatabaseSync;
  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,name TEXT NOT NULL,rating INTEGER NOT NULL DEFAULT 1000,wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,draws INTEGER NOT NULL DEFAULT 0,games INTEGER NOT NULL DEFAULT 0,wave INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,player TEXT NOT NULL REFERENCES profiles(id),expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY,a TEXT NOT NULL,b TEXT NOT NULL,result TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,author TEXT NOT NULL,target TEXT NOT NULL,reason TEXT NOT NULL,created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS tables(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,body TEXT NOT NULL,created INTEGER NOT NULL,deleted INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,start INTEGER NOT NULL,end INTEGER NOT NULL,seed TEXT NOT NULL,version TEXT NOT NULL,verified INTEGER NOT NULL DEFAULT 0);`);
  }
  guest(name: unknown) {
    if (
      typeof name !== "string" ||
      name.trim().length < 2 ||
      name.trim().length > 20 ||
      /[<>\u0000-\u001f]/.test(name)
    )
      throw Error("닉네임은 안전한 문자 2~20자로 입력하세요.");
    const id = randomUUID(),
      token = randomBytes(32).toString("base64url");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT INTO profiles(id,name) VALUES (?,?)")
        .run(id, name.trim());
      this.db
        .prepare("INSERT INTO sessions VALUES (?,?,?)")
        .run(digest(token), id, Date.now() + 30 * 86400000);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return { token, profile: this.profile(id) };
  }
  authenticate(token: unknown) {
    if (typeof token !== "string" || token.length !== 43)
      throw Error("유효한 세션이 필요합니다.");
    const row = this.db
      .prepare("SELECT player FROM sessions WHERE hash=? AND expires>?")
      .get(digest(token), Date.now());
    if (!row) throw Error("세션이 만료되었거나 올바르지 않습니다.");
    return this.profile(String(row.player));
  }
  profile(id: string): OnlineProfile {
    const r = this.db.prepare("SELECT * FROM profiles WHERE id=?").get(id);
    if (!r) throw Error("플레이어를 찾을 수 없습니다.");
    return r as unknown as OnlineProfile;
  }
  settle(ids: string[], result: MatchResult) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const added = this.db
        .prepare("INSERT OR IGNORE INTO matches VALUES(?,?,?,?)")
        .run(result.id, ids[0], ids[1], JSON.stringify(result));
      if (added.changes)
        for (let i = 0; i < 2; i++) {
          const draw = result.winner === null,
            win =
              !draw &&
              (result.mode === "duel"
                ? result.winner === i
                : result.winner === 0);
          this.db
            .prepare(
              "UPDATE profiles SET games=games+1,wins=wins+?,losses=losses+?,draws=draws+?,wave=MAX(wave,?) WHERE id=?",
            )
            .run(
              +win,
              +(!draw && !win),
              +draw,
              result.mode === "survival" ? result.wave : 0,
              ids[i],
            );
        }
      this.db.exec("COMMIT");
      return !!added.changes;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  history(id: string): MatchResult[] {
    return this.db
      .prepare(
        "SELECT result FROM matches WHERE a=? OR b=? ORDER BY rowid DESC LIMIT 30",
      )
      .all(id, id)
      .map((r) => JSON.parse(String(r.result)));
  }
  leaderboard(): OnlineProfile[] {
    return this.db
      .prepare(
        "SELECT * FROM profiles WHERE games>0 ORDER BY wins DESC,games ASC LIMIT 50",
      )
      .all() as unknown as OnlineProfile[];
  }
  report(author: string, target: string, reason: string) {
    this.db
      .prepare("INSERT INTO reports VALUES(?,?,?,?,?)")
      .run(
        randomUUID(),
        author,
        target.slice(0, 80),
        reason.slice(0, 500),
        Date.now(),
      );
  }
  shareTable(owner: string, json: string) {
    if (Buffer.byteLength(json) > 262144)
      throw Error("맵은 256KiB 이하만 허용됩니다.");
    const raw = JSON.parse(json),
      keys = [
        "version",
        "id",
        "name",
        "region",
        "preset",
        "rule",
        "goal",
        "amount",
        "seconds",
        "balls",
        "objects",
      ];
    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw) ||
      Object.keys(raw).some((k) => !keys.includes(k))
    )
      throw Error("맵에 허용되지 않은 필드가 있습니다.");
    const objectKeys = [
      "id",
      "kind",
      "name",
      "x",
      "y",
      "angle",
      "width",
      "height",
      "value",
      "type",
      "side",
      "link",
    ];
    if (
      Array.isArray(raw.objects) &&
      raw.objects.some(
        (o: unknown) =>
          !o ||
          typeof o !== "object" ||
          Array.isArray(o) ||
          Object.keys(o).some((k) => !objectKeys.includes(k)),
      )
    )
      throw Error("맵 객체에 허용되지 않은 필드가 있습니다.");
    const table = importTable(json),
      validation = validateTable(table);
    if (validation.errors.length) throw Error(validation.errors.join(" / "));
    const count = this.db
      .prepare("SELECT COUNT(*) AS n FROM tables WHERE owner=? AND deleted=0")
      .get(owner)!;
    if (Number(count.n) >= 20)
      throw Error("계정당 비공개 맵은 20개까지 공유할 수 있습니다.");
    const id = randomBytes(16).toString("hex");
    this.db
      .prepare("INSERT INTO tables VALUES(?,?,?,?,?,0)")
      .run(id, owner, table.name, JSON.stringify(table), Date.now());
    return { id, name: table.name };
  }
  table(id: string) {
    const r = this.db
      .prepare("SELECT id,name,body FROM tables WHERE id=? AND deleted=0")
      .get(id);
    if (!r) throw Error("공유 맵을 찾을 수 없습니다.");
    return { id: r.id, name: r.name, table: JSON.parse(String(r.body)) };
  }
  ownTables(owner: string) {
    return this.db
      .prepare(
        "SELECT id,name,created FROM tables WHERE owner=? AND deleted=0 ORDER BY created DESC",
      )
      .all(owner);
  }
  deleteTable(owner: string, id: string) {
    return !!this.db
      .prepare("UPDATE tables SET deleted=1 WHERE id=? AND owner=?")
      .run(id, owner).changes;
  }
  close() {
    this.db.close();
  }
}
export const elo = (a: number, b: number, score: 0 | 0.5 | 1, k = 32) =>
  Math.round(k * (score - 1 / (1 + 10 ** ((b - a) / 400))));
