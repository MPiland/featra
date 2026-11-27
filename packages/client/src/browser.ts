/**
 * The Browser pane's contract (STORY-74, ADR 0047): the local server starts and stops the dev server it shows, and the
 * host shows the page in a view of its own over the pane's viewport. Each open pane has a `key`, so a closed pane's
 * late calls never touch the next one's view. Part of the host contract (bridge.ts).
 */
import { errorMessage, isRecord } from "@featra/work-format/guards";
import type { PreviewResult } from "./card-pane.ts";
import type { ServerClient } from "./server-client.ts";

/** The Browser pane's words: short and sentence case. */
export const BROWSER_COPY = {
  open: "Browser",
  pane: (id: string) => `${id} browser`,
  close: "Close browser",
  resize: "Resize browser pane",
  back: "Back",
  forward: "Forward",
  reload: "Reload",
  address: "Address",
  badAddress: "Enter a web address, like localhost:5173 or example.com.",
  starting: "Starting the dev server…",
  installing: "Installing dependencies…",
  /** The pane's header: what it shows. */
  title: (id: string) => `Browser · ${id}`,
  page: "Page",
  /** How much a device shown scaled down to fit is drawn at, as Chrome shows it. */
  percent: (scale: number) => `${Math.round(scale * 100)}%`,
  scale: (scale: number) => `Shown at ${Math.round(scale * 100)}%`,
  device: "Device",
  fit: "Fit to pane",
  responsive: "Responsive",
  presets: "Devices",
  custom: "Your devices",
  width: "Width",
  height: "Height",
  resizeWidth: "Resize width",
  resizeHeight: "Resize height",
  addDevice: "Add device",
  removeDevice: "Remove device",
  name: "Name",
  dpr: "Pixel ratio",
  mobile: "Touch",
  add: "Add",
  cancel: "Cancel",
  failed: (why: string) => `The page didn't load: ${why}`,
} as const;

/** Where the page is, as the host last said. */
export interface BrowserState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  /** Why the last page didn't load; null when it did. */
  failed: string | null;
}

export const BLANK_STATE: BrowserState = {
  url: "",
  title: "",
  canGoBack: false,
  canGoForward: false,
  loading: false,
  failed: null,
};

/** A rectangle in the window's CSS px. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A device the page is shown as: its viewport in CSS px, its pixel ratio, and whether it is a touch phone or tablet. */
export interface DeviceMetrics {
  width: number;
  height: number;
  dpr: number;
  mobile: boolean;
}

/**
 * Where the page shows and as what: `bounds` in the window (null hides it), and the device it emulates drawn at
 * `scale` to fit there; with no device the page fills `bounds` at its own size.
 */
export interface BrowserLayout {
  bounds: Rect | null;
  device: (DeviceMetrics & { scale: number }) | null;
}

/** A start's answer: the dev server's URL, that dependencies install first (start again to wait), or why not. */
export type BrowserStart = PreviewResult | { ok: true; installing: true };

/** What a pane shows: the project and its story or feature. */
export interface BrowserTarget {
  dir: string;
  id: string;
}

export interface BrowserBridge {
  /**
   * Starts the dev server of story or feature `id` for pane `key`, or holds the one running; its URL, or why not. A
   * feature's fresh checkout installs its dependencies first: the answer says so, and the next start waits for it.
   */
  start: (dir: string, id: string, key: string) => Promise<BrowserStart>;
  /** Pane `key` closed: the server lets go of its dev server, which stops once nothing else holds it. */
  stop: (dir: string, id: string, key: string) => Promise<void>;
  /** Makes the pane's view, hidden until it is laid out and navigated; replaces any other pane's. */
  open: (key: string, target: BrowserTarget) => void;
  /** Gives the page the keyboard. */
  focus: (key: string) => void;
  /** Calls back when Escape is pressed in a pane's page, as Escape closes the other panes; returns the unsubscribe. */
  onEscape: (listener: (key: string) => void) => () => void;
  layout: (key: string, layout: BrowserLayout) => void;
  /** Loads an http or https URL; the host checks it again. */
  navigate: (key: string, url: string) => void;
  back: (key: string) => void;
  forward: (key: string) => void;
  reload: (key: string) => void;
  /** Destroys the pane's view. */
  close: (key: string) => void;
  /** Calls back with each pane's state as it changes; returns the unsubscribe. */
  onState: (listener: (key: string, state: BrowserState) => void) => () => void;
}

/** IPC channel names of the host's half, shared by preload and main. */
export const BROWSER_IPC = {
  browserOpen: "browser:open",
  browserLayout: "browser:layout",
  browserNavigate: "browser:navigate",
  browserBack: "browser:back",
  browserForward: "browser:forward",
  browserReload: "browser:reload",
  browserClose: "browser:close",
  browserState: "browser:state",
  browserFocus: "browser:focus",
  browserEscape: "browser:escape",
} as const;

/** The pixel ratios a device may have: what Chromium shows sensibly. */
export const DPR = { min: 0.5, max: 5 } as const;

const text = (v: unknown) => (typeof v === "string" ? v : "");
const finite = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const positive = (v: unknown) => {
  const n = finite(v);
  return n !== null && n > 0 ? n : null;
};

export function normalizeBrowserState(raw: unknown): BrowserState {
  const r = isRecord(raw) ? raw : {};
  return {
    url: text(r.url),
    title: text(r.title),
    canGoBack: r.canGoBack === true,
    canGoForward: r.canGoForward === true,
    loading: r.loading === true,
    failed: typeof r.failed === "string" && r.failed ? r.failed : null,
  };
}

function rectOf(raw: unknown): Rect | null {
  if (!isRecord(raw)) return null;
  const x = finite(raw.x);
  const y = finite(raw.y);
  const width = finite(raw.width);
  const height = finite(raw.height);
  if (x === null || y === null || width === null || height === null || width < 0 || height < 0) return null;
  return { x, y, width, height };
}

/** A layout from the page, read defensively: what isn't valid hides the view or drops the device. */
export function normalizeBrowserLayout(raw: unknown): BrowserLayout {
  const r = isRecord(raw) ? raw : {};
  const d = isRecord(r.device) ? r.device : null;
  const [width, height, dpr, scale] = d ? [d.width, d.height, d.dpr, d.scale].map(positive) : [null, null, null, null];
  const device =
    d && width && height && dpr && scale
      ? {
          width: Math.round(width),
          height: Math.round(height),
          dpr: Math.min(DPR.max, Math.max(DPR.min, dpr)),
          scale,
          mobile: d.mobile === true,
        }
      : null;
  return { bounds: rectOf(r.bounds), device };
}

/** The server's half, over the local server's socket. */
export const serverBrowser = (server: ServerClient): Pick<BrowserBridge, "start" | "stop"> => ({
  start: (dir, id, pane) =>
    server.call("browser.start", { dir, id, pane }).then(
      (r): BrowserStart =>
        isRecord(r) && typeof r.url === "string"
          ? { ok: true, url: r.url }
          : isRecord(r) && r.installing === true
            ? { ok: true, installing: true }
            : { ok: false, error: "Featra gave an unexpected answer." },
      (err: unknown): BrowserStart => ({ ok: false, error: errorMessage(err) }),
    ),
  stop: (dir, id, pane) =>
    server.call("browser.stop", { dir, id, pane }).then(
      () => {},
      () => {},
    ),
});

/** A browser tab has no dev servers, and no view to show one in. */
export function noBrowser(error: string): BrowserBridge {
  return {
    start: async () => ({ ok: false, error }),
    stop: async () => {},
    open() {},
    focus() {},
    onEscape: () => () => {},
    layout() {},
    navigate() {},
    back() {},
    forward() {},
    reload() {},
    close() {},
    onState: () => () => {},
  };
}
