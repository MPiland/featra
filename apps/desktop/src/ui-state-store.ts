import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_UI_STATE, normalizeUiState, type UiState } from "@featra/client/bridge";

export interface UiStateStore {
  readonly file: string;
  load(): Promise<UiState>;
  save(state: UiState): Promise<void>;
  /** Resolves once every save issued so far is on disk. */
  flush(): Promise<void>;
  readonly pending: boolean;
}

/**
 * Window chrome state (sidebar collapsed, …) kept as JSON in Electron's userData folder.
 * Writes are serialised and atomic (temp file + rename), so a crash mid-write never leaves a torn file.
 */
export function createUiStateStore(dir: string): UiStateStore {
  const file = join(dir, "ui-state.json");
  let queue: Promise<void> = Promise.resolve();
  let inFlight = 0;

  const write = async (state: UiState) => {
    await mkdir(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, `${JSON.stringify(normalizeUiState(state), null, 2)}\n`, "utf8");
    await rename(tmp, file);
  };

  return {
    file,
    async load() {
      try {
        return normalizeUiState(JSON.parse(await readFile(file, "utf8")));
      } catch {
        return { ...DEFAULT_UI_STATE };
      }
    },
    save(state) {
      inFlight++;
      const next = queue.then(() => write(state)).finally(() => inFlight--);
      queue = next.catch(() => {});
      return next;
    },
    flush: () => queue,
    get pending() {
      return inFlight > 0;
    },
  };
}
