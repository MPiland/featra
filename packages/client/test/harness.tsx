import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SETUP_ITEM_IDS } from "@featra/work-format/setup-plan";
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
  type ProjectSetup,
  type ProjectsResult,
  type SetupItemId,
  type ProjectsSnapshot,
  type SettingsSnapshot,
  type UiState,
  type WindowState,
  type WorkOverrides,
  type WorkUpdate,
} from "../src/bridge.ts";
import { EMPTY_WORK_LIST, type WorkList } from "@featra/work-format/work-list";
import type { Card } from "@featra/work-format";
import { fakeCardServer } from "./card-server.ts";
import { fakeChatServer, type ChatHost } from "./chat-server.ts";
import type { CopyActionResult } from "@featra/work-format/protocol";

export const PROJECT: ProjectRef = { dir: "/home/me/manager", name: "manager" };
/** Where New Project… suggests a folder by default. */
export const LOCATION = "/home/me";

export interface HostOptions extends ChatHost {
  closeToTray?: CloseToTraySupport;
  /** The current project, or null for none. Default: PROJECT. */
  project?: ProjectRef | null;
  /** Every known project. Default: the current one only. */
  projects?: ProjectRef[];
  /** Folders the folder dialog returns, in turn; then it is cancelled. */
  folderPicks?: string[];
  /** What the host answers to a switch, an open or a create, by folder: a refusal such as a folder that is gone. */
  refusals?: Record<string, string>;
  /** What each project's config file overrides, by folder. */
  projectFiles?: Record<string, WorkOverrides>;
  /** A project whose config file can't be read: its error. */
  brokenProjects?: Record<string, string>;
  /** Config-file writes wait until `releaseWrites()`: a slow disk or IPC round trip. */
  slowProjectWrites?: boolean;
  /** Each folder's setup as the server would find it on disk. Default: set up ("ready"). */
  setup?: Record<string, ProjectSetup>;
  /** Setup items already in each folder, as the server would find them. Default: none. */
  existing?: Record<string, SetupItemId[]>;
  /** Folders the server can't check for setup: its error. */
  planFailures?: Record<string, string>;
  /** Folders where the server's setup fails: its error. */
  initFailures?: Record<string, string>;
  /** What the server's setup reports it created and kept, by folder. Default: it created config.yaml only. */
  initResults?: Record<string, { created: string[]; kept: string[] }>;
  /** Each folder's Work list as the server would send it. Default: empty. */
  work?: Record<string, WorkList>;
  /** What apply and discard answer. Default: ok. */
  copyResult?: CopyActionResult;
  /**
   * Each folder's cards, owned by main and checked out: the Work list and the card pane are built from them by
   * work-format, and the pane's edits change them. Overrides `work` for that folder.
   */
  cards?: Record<string, Card[]>;
}

export { EDIT_AT } from "./card-server.ts";

const noop = () => {};
const ref = (dir: string): ProjectRef => ({ dir, name: dir.split("/").at(-1) ?? dir });

/** Fakes only the host platform: in-memory stores (userData, the projects' config files) and recorded window calls. */
export function fakeBridge(platform = "win32", host: HostOptions = {}) {
  const saves: UiState[] = [];
  const appSaves: AppSettings[] = [];
  const projectFiles = new Map(Object.entries(host.projectFiles ?? {}));
  const project = host.project === undefined ? PROJECT : host.project;
  const projectSettings = (dir: string) => ({
    dir,
    overrides: { ...projectFiles.get(dir) },
    error: host.brokenProjects?.[dir] ?? null,
  });
  const calls: string[] = [];
  const known: ProjectRef[] = [...(host.projects ?? (project ? [project] : []))];
  let current = project;
  const folderPicks = [...(host.folderPicks ?? [])];
  const list = (): ProjectsSnapshot => ({ current, projects: [...known], location: LOCATION });
  /** The host makes `dir` current (adding it to the list), unless a test made it refuse. */
  const makeCurrent = async (dir: string): Promise<ProjectsResult> => {
    const refusal = host.refusals?.[dir];
    if (refusal) return { ok: false, error: refusal };
    current = known.find((p) => p.dir === dir) ?? ref(dir);
    if (!known.includes(current)) known.push(current);
    return { ok: true, projects: list() };
  };
  let windowState: WindowState = { ...DEFAULT_WINDOW_STATE };
  const listeners = new Set<(s: WindowState) => void>();
  let releaseWrites: () => void = noop;
  const writesReleased = new Promise<void>((r) => (releaseWrites = r));
  // The project folders on disk, as the server sees them: git init and Featra init move a folder to the next state.
  const setupOnDisk = new Map(Object.entries(host.setup ?? {}));
  const setupOf = (dir: string): ProjectSetup => setupOnDisk.get(dir) ?? { state: "ready" };
  // The server's Work list per folder, and who is watching it.
  const workLists = new Map(Object.entries(host.work ?? {}));
  const watchers = new Map<string, Set<(u: WorkUpdate) => void>>();
  const cards = fakeCardServer(host.cards ?? {}, calls, (dir, next) => {
    for (const l of watchers.get(dir) ?? []) l({ list: next, error: null });
  });
  const chats = fakeChatServer(calls, host);
  const listOf = (dir: string) => cards.listOf(dir) ?? workLists.get(dir) ?? EMPTY_WORK_LIST;
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
      }),
      saveApp: async (s) => void appSaves.push(s),
      loadProject: async (dir) => projectSettings(dir),
      setProjectValue: async (dir, key, value) => {
        if (host.slowProjectWrites) await writesReleased;
        if (host.brokenProjects?.[dir]) return projectSettings(dir);
        const next: Record<string, unknown> = { ...projectFiles.get(dir) };
        if (value === null) delete next[key];
        else next[key] = value;
        projectFiles.set(dir, normalizeWorkOverrides(next));
        return projectSettings(dir);
      },
    },
    projects: {
      list: async () => list(),
      switchTo: async (dir) => {
        calls.push(`switchTo:${dir}`);
        return makeCurrent(dir);
      },
      openFolder: async () => {
        calls.push("folderDialog:Open Folder");
        const dir = folderPicks.shift();
        return dir === undefined ? null : makeCurrent(dir);
      },
      chooseLocation: async (from) => {
        calls.push(`folderDialog:Choose Location:${from}`);
        return folderPicks.shift() ?? null;
      },
      create: async (location, name) => {
        calls.push(`create:${location}:${name}`);
        return makeCurrent(`${location}/${name.trim()}`);
      },
    },
    setup: {
      status: async (dir) => setupOf(dir),
      plan: async (dir) => {
        const failure = host.planFailures?.[dir];
        if (failure) return { ok: false, error: failure };
        const existing = new Set(host.existing?.[dir] ?? []);
        return {
          ok: true,
          git: setupOf(dir).state !== "no-git",
          items: SETUP_ITEM_IDS.map((id) => ({ id, exists: existing.has(id) })),
        };
      },
      run: async (dir, items) => {
        calls.push(`setup:${dir}:${items.join(",")}`);
        const failure = host.initFailures?.[dir];
        if (failure) return { ok: false, error: failure };
        setupOnDisk.set(dir, { state: "ready" });
        return { ok: true, ...(host.initResults?.[dir] ?? { created: [".featra/config.yaml"], kept: [] }) };
      },
    },
    work: {
      watch: (dir, listener) => {
        const set = watchers.get(dir) ?? new Set();
        watchers.set(dir, set.add(listener));
        queueMicrotask(() => listener({ list: listOf(dir), error: null }));
        return () => {
          set.delete(listener);
        };
      },
      applyCopy: async (dir, key) => {
        calls.push(`applyCopy:${dir}:${key}`);
        return host.copyResult ?? { ok: true };
      },
      discardCopy: async (dir, key) => {
        calls.push(`discardCopy:${dir}:${key}`);
        return host.copyResult ?? { ok: true };
      },
      ...cards.bridge,
    },
    // Records which element had focus when the command reached the host: that is the field it acts on.
    chats: chats.bridge,
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
  /** What the server does when a card file changes: push the new list to every watcher of the folder. */
  const pushWork = (dir: string, update: WorkList | WorkUpdate) =>
    act(() => {
      const u = "list" in update ? update : { list: update, error: null };
      workLists.set(dir, u.list);
      for (const l of watchers.get(dir) ?? []) l(u);
    });
  /** A card changes outside the pane (an agent, an editor): the server pushes the change. */
  const pushCard = (dir: string, card: Card) => act(() => cards.changed(dir, card));
  return {
    bridge,
    pushWork,
    pushCard,
    chats,
    cardsIn: cards.cardsIn,
    watchingCards: cards.watching,
    /** How many watches are open on `dir`. */
    watching: (dir: string) => watchers.get(dir)?.size ?? 0,
    saves,
    appSaves,
    projectFiles,
    calls,
    list,
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
  };
  const startupSaves = fake.appSaves.length;
  render(
    <App bridge={fake.bridge} initialUiState={initial} initialSettings={snapshot} initialProjects={fake.list()} />,
  );
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
