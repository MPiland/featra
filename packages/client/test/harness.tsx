import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App.tsx";
import { DEFAULT_UI_STATE, type FeatraBridge, type UiState } from "../src/bridge.ts";

/** Fakes only the host platform: an in-memory store and recorded window calls. */
export function fakeBridge(platform = "win32") {
  const saves: UiState[] = [];
  const calls: string[] = [];
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
      setZoomFactor: (f) => void calls.push(`zoom:${f}`),
      setTheme: (t) => void calls.push(`theme:${t}`),
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
  return { bridge, saves, calls };
}

/** Window calls the app makes on its own at startup (apply the stored zoom and theme); `actions()` skips them. */
const startupCalls = (s: UiState) => [`zoom:${s.zoomFactor}`, `theme:${s.theme}`];

export function renderApp(opts: { collapsed?: boolean; platform?: string; state?: Partial<UiState> } = {}) {
  const fake = fakeBridge(opts.platform);
  const user = userEvent.setup();
  const initial: UiState = { ...DEFAULT_UI_STATE, sidebarCollapsed: opts.collapsed ?? false, ...opts.state };
  render(<App bridge={fake.bridge} initialUiState={initial} />);
  const actions = () => fake.calls.slice(startupCalls(initial).length);
  return { ...fake, user, actions };
}

export const titleBar = () => screen.getByRole("banner");
export const viewTitle = () => screen.getByRole("heading", { level: 1 });
export const sidebar = () => document.getElementById("sidebar") as HTMLElement;
/** jsdom has no `inert` property; Chromium's behaviour is proved in e2e. */
export const isCollapsed = () => sidebar().hasAttribute("inert");
export const toggle = () => within(titleBar()).getByRole("button", { name: "Toggle sidebar" });
export const collapsedState = (sidebarCollapsed: boolean): UiState => ({ ...DEFAULT_UI_STATE, sidebarCollapsed });
export const ENTRIES = ["Work", "Inbox", "Artifacts", "Plugins", "Settings"];
