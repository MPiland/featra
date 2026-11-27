import { createContext, useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import type { BrowserBridge } from "../../browser.ts";
import { devicesOf, withDevices, type BrowserDevices } from "../../browser-devices.ts";
import type { UiState } from "../../ui-state.ts";
import type { ChosenWidth } from "../work/PaneHandle.tsx";

/** What a Browser pane needs from the app (STORY-74): the host, and the user's remembered width and devices. */
export interface BrowserHostValue {
  host: BrowserBridge;
  /** The project's device toolbar choice and added devices. */
  devices: (dir: string) => BrowserDevices;
  setDevices: (dir: string, devices: BrowserDevices) => void;
  width: ChosenWidth;
}

/** App provides it; without it (a view rendered on its own) there is no Browser pane to open. */
export const BrowserHostContext = createContext<BrowserHostValue | null>(null);

/** The pane's opener in a card pane or a chat: what it shows, if anything, and how to show a story's or feature's. */
export interface BrowserOpener {
  /** The story or feature the pane shows; null when it is closed. */
  shown: string | null;
  paneId: string;
  /** Shows `id`'s pane, or closes it when it already shows. */
  toggle: (id: string) => void;
}

/** Null where nothing docks a Browser pane. */
export const OpenBrowserContext = createContext<BrowserOpener | null>(null);

/** The Browser pane's half of the UI state, kept by App. */
export function useBrowserHostValue(
  host: BrowserBridge,
  ui: UiState,
  setUi: Dispatch<SetStateAction<UiState>>,
): BrowserHostValue {
  const setDevices = useCallback(
    (dir: string, devices: BrowserDevices) => setUi((s) => withDevices(s, dir, devices)),
    [setUi],
  );
  const choose = useCallback((w: number) => setUi((s) => ({ ...s, browserPaneWidth: w })), [setUi]);
  const { browserPaneWidth } = ui;
  const byProject = ui.browserDevices;
  return useMemo(
    () => ({
      host,
      devices: (dir: string) => devicesOf({ browserDevices: byProject }, dir),
      setDevices,
      width: { chosen: browserPaneWidth ?? null, choose },
    }),
    [host, byProject, setDevices, browserPaneWidth, choose],
  );
}
