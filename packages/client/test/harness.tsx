import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App.tsx";
import { act } from "react";
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_UI_STATE,
  DEFAULT_WINDOW_STATE,
  normalizeWorkOverrides,
  type AppSettings,
  type CloseToTraySupport,
  type FeatraBridge,
  type ProjectRef,
  type SettingsSnapshot,
  type UiState,
  type WindowState,
  type WorkOverrides,
} from "../src/bridge.ts";

export const PROJECT: ProjectRef = { dir: "/home/me/manager", name: "manager" };

export interface HostOptions {
  closeToTray?: CloseToTraySupport;
  /** The current project, or null for none. Default: PROJECT. */
  project?: ProjectRef | null;
  /** What each project's config file overrides, by folder. */
  projectFiles?: Record<string, WorkOverrides>;
  /** A project whose config file can't be read: its error. */
  brokenProjects?: Record<string, string>;
  /** Config-file writes wait until `releaseWrites()`: a slow disk or IPC round trip. */
  slowProjectWrites?: boolean;
}

/** Fakes only the host platform: in-memory stores (userData, the projects' config files) and recorded window calls. */
export function fakeBridge(platform = "win32", host: HostOptions = {}) {
  const saves: UiState[] = [];
  const appSaves: AppSettings[] = [];
  const projectFiles = new Map(Object.entries(host.projectFiles ?? {}));
  const project = host.project === undefined ? PROJECT : host.project;
  const projectSettings = (dir: string) => ({
    dir,
    overrides: { ...(projectFiles.get(dir) ?? {}) },
    error: host.brokenProjects?.[dir] ?? null,
  });
  const calls: string[] = [];
  let windowState: WindowState = { ...DEFAULT_WINDOW_STATE };
  const listeners = new Set<(s: WindowState) => void>();
  let releaseWrites = () => {};
  const writesReleased = new Promise<void>((r) => (releaseWrites = r));
  const bridge: FeatraBridge = {
    platform,
    uiState: {
      load: async () => saves.at(-1) ?? { ...DEFAULT_UI_STATE },
      save: async (s) => void saves.push(s),
    },
    window: {
      minimize: () => void calls.push("minimize"),
      toggleMaximize: () => void calls.push("toggleMaximize"),
      close: () => void calls.push("close"),
      toggleFullScreen: () => void calls.push("fullScreen"),
      state: async () => windowState,
      onStateChange: (listener) => {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
      setZoomFactor: (f) => void calls.push(`zoom:${f}`),
      setTheme: (t) => void calls.push(`theme:${t}`),
    },
    settings: {
      load: async (): Promise<SettingsSnapshot> => ({
        app: appSaves.at(-1) ?? DEFAULT_APP_SETTINGS,
        closeToTray: host.closeToTray === undefined ? { available: true, place: "tray" } : host.closeToTray,
        currentProject: project,
        projects: project ? [project] : [],
      }),
      saveApp: async (s) => void appSaves.push(s),
      loadProject: async (dir) => projectSettings(dir),
      setProjectValue: async (dir, key, value) => {
        if (host.slowProjectWrites) await writesReleased;
        if (host.brokenProjects?.[dir]) return projectSettings(dir);
        const next: Record<string, unknown> = { ...(projectFiles.get(dir) ?? {}) };
        if (value === null) delete next[key];
        else next[key] = value;
        projectFiles.set(dir, normalizeWorkOverrides(next));
        return projectSettings(dir);
      },
    },
    // Records which element had focus when the command reached the host: that is the field it acts on.
    edit: (command) => void calls.push(`edit:${command}:${(document.activeElement as HTMLElement | null)?.id ?? ""}`),
    app: {
      info: async () => ({ name: "Featra", version: "1.2.3" }),
      reload: () => void calls.push("reload"),
      toggleDevTools: () => void calls.push("toggleDevTools"),
      showLogs: () => void calls.push("showLogs"),
      clearCacheAndRestart: () => void calls.push("clearCacheAndRestart"),
      resetAppData: () => void calls.push("resetAppData"),
      quit: () => void calls.push("quit"),
    },
  };
  /** What the host does when the window changes (the OS, F11 or the button): report the new state. */
  const setWindowState = (s: Partial<WindowState>) =>
    act(() => {
      windowState = { ...windowState, ...s };
      for (const l of listeners) l(windowState);
    });
  return {
    bridge,
    saves,
    appSaves,
    projectFiles,
    calls,
    setWindowState,
    releaseWrites: () => act(async () => releaseWrites()),
  };
}

/** Window calls the app makes on its own at startup (apply the stored zoom and theme); `actions()` skips them. */
const startupCalls = (s: UiState, app: AppSettings) => [`zoom:${s.zoomFactor}`, `theme:${app.theme}`];

export function renderApp(
  opts: {
    collapsed?: boolean;
    platform?: string;
    state?: Partial<UiState>;
    settings?: Partial<AppSettings>;
  } & HostOptions = {},
) {
  const fake = fakeBridge(opts.platform, opts);
  if (opts.settings) fake.appSaves.push({ ...DEFAULT_APP_SETTINGS, ...opts.settings });
  const user = userEvent.setup();
  const initial: UiState = { ...DEFAULT_UI_STATE, sidebarCollapsed: opts.collapsed ?? false, ...opts.state };
  // What main.tsx does: load the settings snapshot before the first render. Synchronous here: the fake resolves at once.
  const app = fake.appSaves.at(-1) ?? DEFAULT_APP_SETTINGS;
  const snapshot: SettingsSnapshot = {
    app,
    closeToTray:
      opts.closeToTray === undefined
        ? opts.platform === "web"
          ? null
          : { available: true, place: opts.platform === "darwin" ? "dock" : "tray" }
        : opts.closeToTray,
    currentProject: opts.project === undefined ? PROJECT : opts.project,
    projects: opts.project === undefined ? [PROJECT] : opts.project ? [opts.project] : [],
  };
  const startupSaves = fake.appSaves.length;
  render(<App bridge={fake.bridge} initialUiState={initial} initialSettings={snapshot} />);
  const actions = () => fake.calls.slice(startupCalls(initial, app).length);
  /** App settings the UI saved after startup. */
  const appSaved = () => fake.appSaves.slice(startupSaves);
  return { ...fake, user, actions, appSaved };
}

export const titleBar = () => screen.getByRole("banner");
export const viewTitle = () => screen.getByRole("heading", { level: 1 });
export const sidebar = () => document.getElementById("sidebar") as HTMLElement;
/** jsdom has no `inert` property; Chromium's behaviour is proved in e2e. */
export const isCollapsed = () => sidebar().hasAttribute("inert");
export const toggle = () => within(titleBar()).getByRole("button", { name: "Toggle sidebar" });
export const collapsedState = (sidebarCollapsed: boolean): UiState => ({ ...DEFAULT_UI_STATE, sidebarCollapsed });
export const ENTRIES = ["Work", "Inbox", "Artifacts", "Plugins", "Settings"];
