import {
  session,
  WebContentsView,
  type BrowserWindow,
  type Input,
  type NativeImage,
  type Rectangle,
  type WebContents,
} from "electron";
import { IPC, type BrowserLayout, type BrowserState } from "@featra/client/bridge";
import { createAnnotator, type Annotator } from "./annotator.ts";
import { createEmulation } from "./browser-emulation.ts";
import { allowBrowsing, webUrl } from "./dev-pages.ts";
import { e2e, testHooks } from "./test-hooks.ts";

/**
 * The Browser pane's page (STORY-74, ADR 0047): a view of its own in the main window, drawn over the pane's viewport
 * where the page lays it out. It runs sandboxed and context-isolated, without Node, in a session apart from the
 * window's ("featra", ADR 0046) and from Proof's dev pages: in memory, granting no permission and taking no download.
 * Unlike the window's, it keeps the system's proxy: it loads the web as a browser does. One pane per window, by key:
 * a closed pane's late calls never touch the next one's view.
 */
export const BROWSER_PARTITION = "featra-browser";

/** What a pane shows: the project's folder and its story or feature. */
export interface BrowserTarget {
  dir: string;
  id: string;
}

/** What drives an open pane's page: the page's own calls, its annotations (STORY-75), and later an agent's (STORY-40). */
export interface BrowserHandle extends BrowserTarget {
  key: string;
  contents: WebContents;
  navigate: (url: string) => boolean;
  back: () => void;
  forward: () => void;
  reload: () => void;
  layout: (layout: BrowserLayout) => void;
  /** Where the page shows in the window, in its pixels; null while hidden: for an overlay over it (STORY-75). */
  bounds: () => Rectangle | null;
  /** The page as shown, or `rect` of it in the page's CSS px: for screenshots of an element or region. */
  capture: (rect?: Rectangle) => Promise<NativeImage>;
  /** Its annotations (STORY-75): Annotate, the list and its one owner. */
  annotations: Annotator;
  /** Gives the page the keyboard. */
  focus: () => void;
}

interface Pane extends BrowserHandle {
  close: () => void;
}

const panes = new Map<BrowserWindow, Pane>();

let sessionReady = false;

function browserSession() {
  const pages = session.fromPartition(BROWSER_PARTITION);
  if (!sessionReady) {
    pages.setPermissionRequestHandler((_contents, _permission, decide) => decide(false));
    pages.setPermissionCheckHandler(() => false);
    pages.on("will-download", (e) => e.preventDefault());
    sessionReady = true;
  }
  return pages;
}

/** A page's state as the pane shows it. */
function stateOf(contents: WebContents, failed: string | null): BrowserState {
  return {
    url: contents.getURL(),
    title: contents.getTitle(),
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
    loading: contents.isLoading(),
    failed,
  };
}

/** Escape with no modifier, pressed: in the pane's page it closes the pane, as Escape closes the other panes. */
const isEscape = (input: Input) =>
  input.type === "keyDown" && input.key === "Escape" && !input.shift && !input.control && !input.alt && !input.meta;

/**
 * Makes `win`'s pane `key`, showing `target`, replacing the one it had. Hidden until laid out. It closes when the
 * window's page goes (a reload, a crash): the page that drove it, and would close it, is gone.
 */
export function openPane(
  win: BrowserWindow,
  key: string,
  target: BrowserTarget,
  log: (message: string) => void,
): BrowserHandle {
  panes.get(win)?.close();
  browserSession();
  const view = new WebContentsView({
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: BROWSER_PARTITION },
  });
  const contents = view.webContents;
  allowBrowsing(contents);
  view.setVisible(false);
  win.contentView.addChildView(view);
  const emulation = createEmulation(contents.debugger, log);
  let device: BrowserLayout["device"] = null;
  let failed: string | null = null;
  const zoom = () => win.webContents.getZoomFactor();
  const send = () => {
    if (!win.isDestroyed() && !contents.isDestroyed())
      win.webContents.send(IPC.browserState, key, stateOf(contents, failed));
  };
  contents.on("did-start-loading", () => {
    failed = null;
    send();
  });
  contents.on("did-stop-loading", send);
  contents.on("did-navigate-in-page", send);
  contents.on("page-title-updated", send);
  contents.on("did-navigate", () => {
    // A new document: the device is shown again, as it may be in a new renderer.
    void emulation.apply(device, zoom(), true);
    send();
  });
  contents.on("did-fail-load", (_e, code, description, _url, mainFrame) => {
    // -3: a load the next one replaced.
    if (!mainFrame || code === -3) return;
    failed = description || `error ${code}`;
    send();
  });
  const annotations = createAnnotator({
    page: {
      getURL: () => contents.getURL(),
      onConsole: (listener) => contents.on("console-message", (...args: unknown[]) => listener(...args)),
      onNavigate: (listener) => contents.on("did-navigate", () => listener()),
      debugger: contents.debugger,
    },
    capture: (rect) => pane.capture(rect),
    device: () => device?.name ?? null,
    send: (state) => {
      if (!win.isDestroyed()) win.webContents.send(IPC.browserAnnotations, key, state);
    },
    focusWindow: () => {
      if (!win.isDestroyed()) win.webContents.focus();
    },
    log,
  });
  contents.on("before-input-event", (e, input) => {
    if (!isEscape(input) || win.isDestroyed()) return;
    // Escape leaves Annotate first; then, as in the other panes, it closes the pane.
    if (annotations.escape()) e.preventDefault();
    else {
      // The window takes the keyboard back, as it may ask before the pane closes.
      win.webContents.focus();
      win.webContents.send(IPC.browserEscape, key);
    }
  });
  const pageGone = (details: { isMainFrame: boolean; isSameDocument: boolean }) => {
    if (details.isMainFrame && !details.isSameDocument) pane.close();
  };
  const crashed = () => pane.close();
  const windowClosed = () => pane.close();
  const pane: Pane = {
    key,
    dir: target.dir,
    id: target.id,
    contents,
    navigate(url) {
      const ok = webUrl(url);
      if (ok) void contents.loadURL(ok).catch(() => {});
      return ok !== null;
    },
    back() {
      if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
    },
    forward() {
      if (contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
    },
    reload: () => contents.reload(),
    layout(layout) {
      const z = zoom();
      device = layout.device;
      const b = layout.bounds;
      if (b && b.width > 0 && b.height > 0) {
        view.setBounds({
          x: Math.round(b.x * z),
          y: Math.round(b.y * z),
          width: Math.round(b.width * z),
          height: Math.round(b.height * z),
        });
        view.setVisible(true);
      } else view.setVisible(false);
      void emulation.apply(device, z);
    },
    bounds: () => (view.getVisible() ? view.getBounds() : null),
    capture: (rect) => {
      // The page's CSS px are drawn at the device's scale times the window's zoom; with no device, at their size.
      const k = device ? device.scale * zoom() : 1;
      const at = (n: number) => Math.round(n * k);
      return contents.capturePage(
        rect && { x: at(rect.x), y: at(rect.y), width: at(rect.width), height: at(rect.height) },
      );
    },
    annotations,
    focus: () => {
      if (!contents.isDestroyed()) contents.focus();
    },
    close() {
      if (panes.get(win) === pane) panes.delete(win);
      win.off("closed", windowClosed);
      if (!win.isDestroyed()) {
        win.webContents.off("did-start-navigation", pageGone);
        win.webContents.off("render-process-gone", crashed);
        win.contentView.removeChildView(view);
      }
      if (!contents.isDestroyed()) contents.close();
    },
  };
  panes.set(win, pane);
  win.once("closed", windowClosed);
  win.webContents.on("did-start-navigation", pageGone);
  win.webContents.on("render-process-gone", crashed);
  return pane;
}

/** `win`'s open pane when it is `key`'s; null for a pane closed or replaced since. */
export function paneOf(win: BrowserWindow | null, key: unknown): BrowserHandle | null {
  const pane = win ? panes.get(win) : undefined;
  return pane && typeof key === "string" && pane.key === key ? pane : null;
}

/** Closes `win`'s pane `key`, if it is still the open one. */
export function closePane(win: BrowserWindow | null, key: unknown): void {
  const pane = win ? panes.get(win) : undefined;
  if (pane && pane.key === key) pane.close();
}

/** Every open pane: for an agent's tool (STORY-40) and the e2e journeys. */
export const openPanes = (): BrowserHandle[] => [...panes.values()];
if (e2e) testHooks.browserPanes = openPanes;
