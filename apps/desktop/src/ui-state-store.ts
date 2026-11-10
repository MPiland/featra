import { createJsonStore, type JsonStore } from "@featra/server/json-store";
import { DEFAULT_UI_STATE, normalizeUiState, type UiState } from "@featra/client/bridge";
import { isRecord } from "@featra/work-format";

export type UiStateStore = JsonStore<UiState>;

/** Window chrome state (sidebar collapsed, zoom, theme): `ui-state.json`. */
export function createUiStateStore(dir: string): UiStateStore {
  return createJsonStore(dir, "ui-state.json", (raw) =>
    raw === undefined ? { ...DEFAULT_UI_STATE } : normalizeUiState(raw),
  );
}

/** What main itself remembers between runs: `app-state.json`. */
export interface AppState {
  /** The "still running in the system tray" notice has been shown once. */
  trayNoticeShown: boolean;
}

export function normalizeAppState(raw: unknown): AppState {
  return { trayNoticeShown: isRecord(raw) && raw.trayNoticeShown === true };
}

export function createAppStateStore(dir: string): JsonStore<AppState> {
  return createJsonStore(dir, "app-state.json", normalizeAppState);
}
