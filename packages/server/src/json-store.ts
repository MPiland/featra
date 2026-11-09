import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface JsonStore<T> {
  readonly file: string;
  load: () => Promise<T>;
  save: (state: T) => Promise<void>;
  /** Deletes the file (Reset App Data), after any save already queued. */
  remove: () => Promise<void>;
  /** Resolves once every save issued so far is on disk. */
  flush: () => Promise<void>;
  readonly pending: boolean;
}

/**
 * A small JSON file in the app's data folder (Electron's userData): the desktop's own stores, and the server's saved
 * chats (STORY-44). Reads are defensive (`normalize` repairs anything stored);
 * writes are serialised and atomic (temp file + rename), so a crash mid-write never leaves a torn file.
 */
export function createJsonStore<T>(dir: string, name: string, normalize: (raw: unknown) => T): JsonStore<T> {
  const file = join(dir, name);
  let queue: Promise<void> = Promise.resolve();
  let inFlight = 0;

  const write = async (state: T) => {
    await mkdir(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, `${JSON.stringify(normalize(state), null, 2)}\n`, "utf8");
    await rename(tmp, file);
  };

  const enqueue = (op: () => Promise<void>) => {
    inFlight++;
    const next = queue.then(op).finally(() => inFlight--);
    queue = next.catch(() => {});
    return next;
  };

  return {
    file,
    async load() {
      try {
        return normalize(JSON.parse(await readFile(file, "utf8")));
      } catch {
        return normalize(undefined);
      }
    },
    save: (state) => enqueue(() => write(state)),
    remove: () => enqueue(() => rm(file, { force: true })),
    flush: () => queue,
    get pending() {
      return inFlight > 0;
    },
  };
}
