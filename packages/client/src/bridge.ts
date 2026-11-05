/**
 * The contract between the UI and its host. Electron's preload implements it; a plain browser (Vite dev, later
 * remote control) gets the fallback below. The UI never talks to Electron any other way.
 */

/** Window chrome state that survives a restart. */
export interface UiState {
  sidebarCollapsed: boolean;
}

export const DEFAULT_UI_STATE: UiState = { sidebarCollapsed: false };

/** Reads stored state defensively: unknown or malformed fields fall back to defaults. */
export function normalizeUiState(raw: unknown): UiState {
  const r = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    sidebarCollapsed:
      typeof r.sidebarCollapsed === "boolean" ? r.sidebarCollapsed : DEFAULT_UI_STATE.sidebarCollapsed,
  };
}

export interface FeatraBridge {
  /** `process.platform` of the host: "win32", "darwin", "linux", or "web" outside Electron. */
  readonly platform: string;
  readonly uiState: {
    load(): Promise<UiState>;
    save(state: UiState): Promise<void>;
  };
  readonly window: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
  };
  readonly app: {
    reload(): void;
    toggleDevTools(): void;
    quit(): void;
  };
}

/** IPC channel names shared by preload and main. */
export const IPC = {
  uiStateLoad: "ui-state:load",
  uiStateSave: "ui-state:save",
  windowMinimize: "window:minimize",
  windowToggleMaximize: "window:toggle-maximize",
  windowClose: "window:close",
  appReload: "app:reload",
  appToggleDevTools: "app:toggle-devtools",
  appQuit: "app:quit",
} as const;

declare global {
  interface Window {
    featra?: FeatraBridge;
  }
}

const STORAGE_KEY = "featra.ui-state";

/** Used when the UI runs in a plain browser: state lives in localStorage and there is no window to control. */
export function browserBridge(storage: Storage = window.localStorage): FeatraBridge {
  return {
    platform: "web",
    uiState: {
      async load() {
        try {
          return normalizeUiState(JSON.parse(storage.getItem(STORAGE_KEY) ?? "null"));
        } catch {
          return { ...DEFAULT_UI_STATE };
        }
      },
      async save(state) {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
      },
    },
    window: { minimize() {}, toggleMaximize() {}, close() {} },
    app: {
      reload: () => window.location.reload(),
      toggleDevTools() {},
      quit() {},
    },
  };
}

export function getBridge(): FeatraBridge {
  return window.featra ?? browserBridge();
}
