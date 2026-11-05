/**
 * The contract between the UI and its host. Electron's preload implements it; a plain browser (Vite dev, later
 * remote control) gets the fallback below. The UI never talks to Electron any other way.
 */
import { DEFAULT_ZOOM, normalizeZoom } from "./zoom.ts";

/** System follows the OS; Light and Dark override it. */
export type ThemeChoice = "system" | "light" | "dark";
export const THEME_CHOICES: readonly ThemeChoice[] = ["system", "light", "dark"];

/** Window chrome state that survives a restart. */
export interface UiState {
  sidebarCollapsed: boolean;
  zoomFactor: number;
  theme: ThemeChoice;
}

export const DEFAULT_UI_STATE: UiState = { sidebarCollapsed: false, zoomFactor: DEFAULT_ZOOM, theme: "system" };

/** Reads stored state defensively: unknown or malformed fields fall back to defaults. */
export function normalizeUiState(raw: unknown): UiState {
  const r = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    sidebarCollapsed:
      typeof r.sidebarCollapsed === "boolean" ? r.sidebarCollapsed : DEFAULT_UI_STATE.sidebarCollapsed,
    zoomFactor: normalizeZoom(r.zoomFactor),
    theme: THEME_CHOICES.includes(r.theme as ThemeChoice) ? (r.theme as ThemeChoice) : DEFAULT_UI_STATE.theme,
  };
}

/** Text-editing commands; the host runs them on whatever field has focus. */
export type EditCommand = "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll";
export const EDIT_COMMANDS: readonly EditCommand[] = ["undo", "redo", "cut", "copy", "paste", "selectAll"];

export interface AppInfo {
  name: string;
  version: string;
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
    setZoomFactor(factor: number): void;
    setTheme(theme: ThemeChoice): void;
  };
  edit(command: EditCommand): void;
  readonly app: {
    info(): Promise<AppInfo>;
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
  windowSetZoom: "window:set-zoom",
  windowSetTheme: "window:set-theme",
  edit: "edit:run",
  appInfo: "app:info",
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
    window: {
      minimize() {},
      toggleMaximize() {},
      close() {},
      setZoomFactor: (factor) => {
        document.documentElement.style.zoom = String(factor);
      },
      setTheme() {},
    },
    edit: (command) => {
      document.execCommand(command);
    },
    app: {
      info: async () => ({ name: "Featra", version: "dev" }),
      reload: () => window.location.reload(),
      toggleDevTools() {},
      quit() {},
    },
  };
}

export function getBridge(): FeatraBridge {
  return window.featra ?? browserBridge();
}
