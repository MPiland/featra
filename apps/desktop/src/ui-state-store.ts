import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_UI_STATE, normalizeUiState, type UiState } from "@featra/client/bridge";

export interface JsonStore<T> {
  readonly file: string;
  load(): Promise<T>;
  save(state: T): Promise<void>;
  /** Resolves once every save issued so far is on disk. */
  flush(): Promise<void>;
  readonly pending: boolean;
}

/**
 * A small JSON file in Electron's userData folder. Reads are defensive (`normalize` repairs anything stored);
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

  return {
    file,
    async load() {
      try {
        return normalize(JSON.parse(await readFile(file, "utf8")));
      } catch {
        return normalize(undefined);
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

export type UiStateStore = JsonStore<UiState>;

/** Window chrome state (sidebar collapsed, zoom, theme): `ui-state.json`. */
export function createUiStateStore(dir: string): UiStateStore {
  return createJsonStore(dir, "ui-state.json", (raw) => (raw === undefined ? { ...DEFAULT_UI_STATE } : normalizeUiState(raw)));
}

/** What main itself remembers between runs: `app-state.json`. */
export interface AppState {
  /** The "still running in the system tray" notice has been shown once. */
  trayNoticeShown: boolean;
}

export function normalizeAppState(raw: unknown): AppState {
  const r = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { trayNoticeShown: r.trayNoticeShown === true };
}

export function createAppStateStore(dir: string): JsonStore<AppState> {
  return createJsonStore(dir, "app-state.json", normalizeAppState);
}
