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
export type EditCommand = "undo" | "redo" | "cut" | "copy" | "paste" | "delete" | "selectAll";
export const EDIT_COMMANDS: readonly EditCommand[] = ["undo", "redo", "cut", "copy", "paste", "delete", "selectAll"];

/** Whether the window is maximized or full screen, as the OS has it. Main reports every change, whoever made it. */
export interface WindowState {
  maximized: boolean;
  fullScreen: boolean;
}

export const DEFAULT_WINDOW_STATE: WindowState = { maximized: false, fullScreen: false };

export function normalizeWindowState(raw: unknown): WindowState {
  const r = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { maximized: r.maximized === true, fullScreen: r.fullScreen === true };
}

/**
 * What the title bar's maximize button does. In full screen it leaves full screen, which puts the window back to
 * the size and maximized state it had before; un-maximizing a full-screen window instead shrinks it and the OS
 * snaps it back (BUG-1).
 */
export function sizeButtonAction(state: WindowState): "leaveFullScreen" | "unmaximize" | "maximize" {
  if (state.fullScreen) return "leaveFullScreen";
  return state.maximized ? "unmaximize" : "maximize";
}

/** The maximize button's label (and tooltip) and icon for the window's state, in the platform's words. */
export function sizeButtonFor(state: WindowState, platform: string): { label: string; icon: "maximize" | "restore" } {
  if (state.fullScreen) return { label: "Exit Full Screen", icon: "restore" };
  if (state.maximized) return { label: platform === "win32" ? "Restore Down" : "Restore", icon: "restore" };
  return { label: "Maximize", icon: "maximize" };
}

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
    /** Maximize, restore, or leave full screen: see `sizeButtonAction`. */
    toggleMaximize(): void;
    close(): void;
    toggleFullScreen(): void;
    state(): Promise<WindowState>;
    /** Calls back on every change to the window's state; returns the unsubscribe. */
    onStateChange(listener: (state: WindowState) => void): () => void;
    setZoomFactor(factor: number): void;
    /** Applied from the stored state; Settings > Appearance (STORY-20) will change it. */
    setTheme(theme: ThemeChoice): void;
  };
  edit(command: EditCommand): void;
  readonly app: {
    info(): Promise<AppInfo>;
    reload(): void;
    toggleDevTools(): void;
    /** Shows the main process's log file in the OS file manager. */
    showLogs(): void;
    /** Clears Chromium's HTTP cache, then restarts the app. */
    clearCacheAndRestart(): void;
    /** Deletes stored state (window chrome, app state, web storage, cache), then restarts. Logs are kept. */
    resetAppData(): void;
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
  windowToggleFullScreen: "window:toggle-full-screen",
  windowGetState: "window:get-state",
  windowStateChanged: "window:state-changed",
  windowSetZoom: "window:set-zoom",
  windowSetTheme: "window:set-theme",
  edit: "edit:run",
  appInfo: "app:info",
  appReload: "app:reload",
  appToggleDevTools: "app:toggle-devtools",
  appShowLogs: "app:show-logs",
  appClearCacheAndRestart: "app:clear-cache-and-restart",
  appResetAppData: "app:reset-app-data",
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
      toggleFullScreen() {},
      state: async () => ({ ...DEFAULT_WINDOW_STATE }),
      onStateChange: () => () => {},
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
      showLogs() {},
      clearCacheAndRestart() {},
      resetAppData() {},
      quit() {},
    },
  };
}

export function getBridge(): FeatraBridge {
  return window.featra ?? browserBridge();
}
