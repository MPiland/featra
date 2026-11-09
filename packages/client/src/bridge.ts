/**
 * The contract between the UI and its host. Electron's preload implements it; a plain browser (Vite dev, later
 * remote control) gets the fallback below. The UI never talks to Electron any other way.
 */
import { isRecord } from "@featra/work-format/guards";
import {
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
  normalizeProjectSettings,
  normalizeSettingsSnapshot,
  type AppSettings,
  type ProjectSettings,
  type SettingsSnapshot,
  type WorkSettingKey,
  type WorkSettings,
} from "./settings.ts";
import { noChats, type ChatBridge } from "./chats.ts";
import { noInbox, noNotifications, type InboxBridge, type NotificationsBridge } from "./inbox.ts";
import { noRoles, type RolesBridge } from "./roles-bridge.ts";
import { noSetup, type ProjectSetupBridge } from "./project-setup.ts";
import { EMPTY_PROJECTS, type ProjectsResult, type ProjectsSnapshot } from "./projects.ts";
import { noWork, type WorkBridge } from "./work-list.ts";
import { THEME_CHOICES, type ThemeChoice } from "./theme.ts";
import { normalizePaneWidth } from "./pane-width.ts";
import { DEFAULT_ZOOM, normalizeZoom } from "./zoom.ts";

export { THEME_CHOICES, type ThemeChoice };
export * from "./chats.ts";
export * from "./inbox.ts";
export * from "./project-setup.ts";
export * from "./projects.ts";
export * from "./roles-bridge.ts";
export * from "./server-client.ts";
export * from "./settings.ts";
export * from "./work-list.ts";

/** Window chrome state that survives a restart. The theme is an app setting (Settings > Appearance), not chrome. */
export interface UiState {
  sidebarCollapsed: boolean;
  zoomFactor: number;
  /** The card pane width the user chose by its handle; null for the default (STORY-4, `pane-width.ts`). */
  cardPaneWidth: number | null;
}

export const DEFAULT_UI_STATE: UiState = { sidebarCollapsed: false, zoomFactor: DEFAULT_ZOOM, cardPaneWidth: null };

/** Reads stored state defensively: unknown or malformed fields fall back to defaults. */
export function normalizeUiState(raw: unknown): UiState {
  const r = isRecord(raw) ? raw : {};
  return {
    sidebarCollapsed: typeof r.sidebarCollapsed === "boolean" ? r.sidebarCollapsed : DEFAULT_UI_STATE.sidebarCollapsed,
    zoomFactor: normalizeZoom(r.zoomFactor),
    cardPaneWidth: normalizePaneWidth(r.cardPaneWidth),
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
  const r = isRecord(raw) ? raw : {};
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
    load: () => Promise<UiState>;
    save: (state: UiState) => Promise<void>;
  };
  readonly window: {
    minimize: () => void;
    /** Maximize, restore, or leave full screen: see `sizeButtonAction`. */
    toggleMaximize: () => void;
    close: () => void;
    toggleFullScreen: () => void;
    state: () => Promise<WindowState>;
    /** Calls back on every change to the window's state; returns the unsubscribe. */
    onStateChange: (listener: (state: WindowState) => void) => () => void;
    setZoomFactor: (factor: number) => void;
    /** Pins native surfaces to the app setting's theme (System lets the OS decide). */
    setTheme: (theme: ThemeChoice) => void;
  };
  readonly settings: {
    /** App settings, what the close button can do here, and the projects the Project scope can pick from. */
    load: () => Promise<SettingsSnapshot>;
    /** Stores app settings; the host applies them at once (the close button among them, without a restart). */
    saveApp: (settings: AppSettings) => Promise<void>;
    /** A project's overrides, read from its `.featra/config.yaml`. */
    loadProject: (dir: string) => Promise<ProjectSettings>;
    /** Overrides one work setting in the project's config file, or removes the override (`null`). */
    setProjectValue: <K extends WorkSettingKey>(
      dir: string,
      key: K,
      value: WorkSettings[K] | null,
    ) => Promise<ProjectSettings>;
  };
  readonly projects: {
    /** The known projects and the current one. */
    list: () => Promise<ProjectsSnapshot>;
    /** Makes a known project the current one. */
    switchTo: (dir: string) => Promise<ProjectsResult>;
    /** Asks for a folder (the OS folder dialog), adds it and switches to it. Null when the user cancels. */
    openFolder: () => Promise<ProjectsResult | null>;
    /** Asks for a folder to create a new project in, starting at `from`. Null when the user cancels. */
    chooseLocation: (from: string) => Promise<string | null>;
    /** Creates the folder `name` in `location`, adds it and switches to it. */
    create: (location: string, name: string) => Promise<ProjectsResult>;
  };
  /** Git and Featra init for a project folder, done by the local server (ADR 0015). */
  readonly setup: ProjectSetupBridge;
  /** The project's live Work list and the stale-copy actions, from the local server (ADR 0016). */
  readonly work: WorkBridge;
  /** Chats started from roles, run by the local server (ADR 0018). */
  readonly chats: ChatBridge;
  /** The project's roles and their edits, from the local server (STORY-6). */
  readonly roles: RolesBridge;
  /** The requests waiting on the user past the Inbox wait, from the local server (STORY-7). */
  readonly inbox: InboxBridge;
  /** Desktop notifications for the requests that arrive (STORY-7); the host decides when to show one. */
  readonly notifications: NotificationsBridge;
  edit: (command: EditCommand) => void;
  readonly app: {
    info: () => Promise<AppInfo>;
    reload: () => void;
    toggleDevTools: () => void;
    /** Shows the main process's log file in the OS file manager. */
    showLogs: () => void;
    /** Clears Chromium's HTTP cache, then restarts the app. */
    clearCacheAndRestart: () => void;
    /** Deletes stored state (window chrome, app state, web storage, cache), then restarts. Logs are kept. */
    resetAppData: () => void;
    quit: () => void;
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
  settingsLoad: "settings:load",
  settingsSaveApp: "settings:save-app",
  settingsLoadProject: "settings:load-project",
  settingsSetProjectValue: "settings:set-project-value",
  projectsList: "projects:list",
  projectsSwitch: "projects:switch",
  projectsOpenFolder: "projects:open-folder",
  projectsChooseLocation: "projects:choose-location",
  projectsCreate: "projects:create",
  serverEndpoint: "server:endpoint",
  notificationsAsked: "notifications:asked",
  notificationsOpenChat: "notifications:open-chat",
} as const;

declare global {
  interface Window {
    featra?: FeatraBridge;
  }
}

const STORAGE_KEY = "featra.ui-state";
const SETTINGS_KEY = "featra.settings";

const NO_FOLDERS = "No project folder in a browser tab.";
const noProject = (dir: string): ProjectSettings => normalizeProjectSettings({ error: NO_FOLDERS }, dir);
const noFolders: ProjectsResult = { ok: false, error: NO_FOLDERS };

/**
 * Used when the UI runs in a plain browser: state lives in localStorage and there is no window to control, nor a
 * project folder to read.
 */
export function browserBridge(storage: Storage = window.localStorage): FeatraBridge {
  const readSettings = (): AppSettings => {
    try {
      return normalizeAppSettings(JSON.parse(storage.getItem(SETTINGS_KEY) ?? "null"));
    } catch {
      return { ...DEFAULT_APP_SETTINGS };
    }
  };
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
    settings: {
      load: async () => normalizeSettingsSnapshot({ app: readSettings(), closeToTray: null }),
      async saveApp(settings) {
        storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeAppSettings(settings)));
      },
      loadProject: async (dir) => noProject(dir),
      setProjectValue: async (dir) => noProject(dir),
    },
    projects: {
      list: async () => ({ ...EMPTY_PROJECTS }),
      switchTo: async () => noFolders,
      openFolder: async () => noFolders,
      chooseLocation: async () => null,
      create: async () => noFolders,
    },
    setup: noSetup(NO_FOLDERS),
    work: noWork(NO_FOLDERS),
    chats: noChats(NO_FOLDERS),
    roles: noRoles(NO_FOLDERS),
    inbox: noInbox(),
    notifications: noNotifications(),
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
