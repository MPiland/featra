/**
 * The SQLite index (ADR 0012, ADR 0016) at `<git common dir>/featra/index.sqlite`, shared by every worktree of a
 * repository. It holds only what files and git reproduce: card-file texts by git blob SHA (a blob never changes) and
 * the owner of every card as last resolved. Missing or unreadable, it is rebuilt from scratch; deleting it loses
 * nothing.
 */
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const INDEX_SCHEMA_VERSION = 1;

/** One card as the last scan resolved it. */
export interface OwnerRow {
  cardId: string;
  type: string;
  parent: string | null;
  status: string;
  /** `main`, `feature:<branch>` or `worktree:<path>`. */
  owner: string;
  /** The repository path of the copy shown. */
  path: string;
}

export interface CardIndex {
  /** The texts of these blobs: from the index, and from `load` for any it doesn't have yet (then kept). */
  blobs: (
    shas: readonly string[],
    load: (missing: string[]) => Promise<Map<string, string>>,
  ) => Promise<Map<string, string>>;
  setOwners: (rows: readonly OwnerRow[]) => void;
  owners: () => OwnerRow[];
  close: () => void;
}

export const indexFile = (commonDir: string) => join(commonDir, "featra", "index.sqlite");

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS blobs (sha TEXT PRIMARY KEY, text TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS owners (
    card_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    parent TEXT,
    status TEXT NOT NULL,
    owner TEXT NOT NULL,
    path TEXT NOT NULL
  );
`;

function open(file: string): DatabaseSync {
  const db = new DatabaseSync(file, { timeout: 2000 });
  try {
    const check = db.prepare("PRAGMA quick_check").get();
    if (check?.quick_check !== "ok") throw new Error("The index failed its check.");
    db.exec(SCHEMA);
    const row = db.prepare("SELECT value FROM meta WHERE key = 'schema'").get();
    if (!row) db.prepare("INSERT INTO meta (key, value) VALUES ('schema', ?)").run(String(INDEX_SCHEMA_VERSION));
    else if (row.value !== String(INDEX_SCHEMA_VERSION)) throw new Error("The index is from another version.");
    return db;
  } catch (err) {
    db.close();
    throw err;
  }
}

/** Opens the index, rebuilding it when it is corrupt or from another schema version. */
export function openCardIndex(file: string): CardIndex {
  mkdirSync(dirname(file), { recursive: true });
  let db: DatabaseSync;
  try {
    db = open(file);
  } catch {
    for (const f of [file, `${file}-journal`, `${file}-wal`, `${file}-shm`]) rmSync(f, { force: true });
    db = open(file);
  }
  const getBlob = db.prepare("SELECT text FROM blobs WHERE sha = ?");
  const putBlob = db.prepare("INSERT OR REPLACE INTO blobs (sha, text) VALUES (?, ?)");
  const putOwner = db.prepare(
    "INSERT INTO owners (card_id, type, parent, status, owner, path) VALUES (?, ?, ?, ?, ?, ?)",
  );

  const inTransaction = (work: () => void) => {
    db.exec("BEGIN");
    try {
      work();
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };

  return {
    async blobs(shas, load) {
      const texts = new Map<string, string>();
      const missing: string[] = [];
      for (const sha of new Set(shas)) {
        const row = getBlob.get(sha);
        if (typeof row?.text === "string") texts.set(sha, row.text);
        else missing.push(sha);
      }
      if (!missing.length) return texts;
      const loaded = await load(missing);
      inTransaction(() => {
        for (const [sha, text] of loaded) putBlob.run(sha, text);
      });
      for (const [sha, text] of loaded) texts.set(sha, text);
      return texts;
    },
    setOwners(rows) {
      inTransaction(() => {
        db.exec("DELETE FROM owners");
        for (const r of rows) putOwner.run(r.cardId, r.type, r.parent, r.status, r.owner, r.path);
      });
    },
    owners() {
      return db
        .prepare("SELECT card_id, type, parent, status, owner, path FROM owners ORDER BY card_id")
        .all()
        .map((r) => ({
          cardId: String(r.card_id),
          type: String(r.type),
          parent: typeof r.parent === "string" ? r.parent : null,
          status: String(r.status),
          owner: String(r.owner),
          path: String(r.path),
        }));
    },
    close: () => db.close(),
  };
}
