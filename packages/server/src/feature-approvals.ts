/**
 * The user's Approves whose Accept isn't on the feature's branch yet (STORY-70): Approve carries the Accept in the Done
 * card, so until the merge settles, this is the only record of it. A PR that merged on GitHub then settles with the
 * user's Accept, after a restart too. Kept beside the card index, in the repository's git directory
 * (`featra/approved.json`), so every checkout of the project shares it and nothing is committed. An approval is
 * dropped once its feature is no longer finished and unaccepted: it settled, or its Accept was recorded on the branch.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Scan } from "./work-scan.ts";

const fileOf = (scan: Scan) => join(scan.collected.git.paths.common, "featra", "approved.json");

export function createFeatureApprovals(log: (message: string) => void) {
  /** The approved feature ids, by file, as last read or written. */
  const known = new Map<string, Promise<Set<string>>>();
  /** The file each project's approvals are in, by the project's folder. */
  const files = new Map<string, string>();
  let writes = Promise.resolve();

  /** `dir`'s approvals, read once (after the writes in flight); none when the file is missing or unreadable. */
  function load(dir: string, scan: Scan): Promise<Set<string>> {
    const file = fileOf(scan);
    files.set(dir, file);
    let ids = known.get(file);
    if (!ids) {
      ids = writes
        .then(() => readFile(file, "utf8"))
        .then(
          (text) => {
            const raw: unknown = JSON.parse(text);
            return new Set(Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : []);
          },
          () => new Set<string>(),
        );
      known.set(file, ids);
    }
    return ids;
  }

  /** Writes `ids` through a temporary file, after the writes before it; a failure is logged, the memory stands. */
  function save(file: string, ids: Set<string>): Promise<void> {
    const text = JSON.stringify([...ids].toSorted());
    writes = writes.then(async () => {
      try {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(`${file}.tmp`, text, "utf8");
        await rename(`${file}.tmp`, file);
      } catch (err) {
        log(`Approvals couldn't be saved: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
    return writes;
  }

  return {
    /** Records the user's Approve of feature `id`, before its merge starts. */
    async add(dir: string, scan: Scan, id: string): Promise<void> {
      const ids = await load(dir, scan);
      if (ids.has(id)) return;
      ids.add(id);
      await save(fileOf(scan), ids);
    },

    /** Whether the user approved feature `id` and its Accept isn't on its branch yet. */
    has: async (dir: string, scan: Scan, id: string): Promise<boolean> => (await load(dir, scan)).has(id),

    /** Drops the approvals of features that aren't finished and unaccepted any more (`waiting` lists those that are). */
    async prune(dir: string, scan: Scan, waiting: ReadonlySet<string>): Promise<void> {
      const ids = await load(dir, scan);
      const gone = [...ids].filter((id) => !waiting.has(id));
      if (gone.length === 0) return;
      for (const id of gone) ids.delete(id);
      await save(fileOf(scan), ids);
    },

    /** `dir` stopped being watched: what was read of its approvals is dropped, and read again when next needed. */
    forget(dir: string) {
      const file = files.get(dir);
      files.delete(dir);
      if (file) known.delete(file);
    },

    /** Waits for the writes in flight. */
    idle: () => writes,
  };
}

export type FeatureApprovals = ReturnType<typeof createFeatureApprovals>;
