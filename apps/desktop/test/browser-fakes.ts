/**
 * Electron, faked for the Browser pane's tests (STORY-74): its view, contents, debugger, session and window. Each records
 * what it was asked; a test mocks "electron" with `fakeElectron` and drives the events a real one emits.
 */
import { EventEmitter } from "node:events";
import { vi } from "vitest";

export class FakeContents extends EventEmitter {
  url = "";
  destroyed = false;
  focused = 0;
  loads: string[] = [];
  commands: [string, unknown][] = [];
  attached = false;
  setWindowOpenHandler = vi.fn<(handler: (d: Record<string, unknown>) => { action: string }) => void>();
  navigationHistory = {
    back: 0,
    canGoBack: () => true,
    canGoForward: () => false,
    goBack: () => void this.navigationHistory.back++,
    goForward: () => {},
  };
  debugger = {
    isAttached: () => this.attached,
    attach: () => void (this.attached = true),
    sendCommand: async (method: string, params?: unknown) => void this.commands.push([method, params]),
  };
  getURL = () => this.url;
  getTitle = () => "Fixture";
  isLoading = () => false;
  isDestroyed = () => this.destroyed;
  close = () => void (this.destroyed = true);
  focus = () => void this.focused++;
  reload = vi.fn<() => void>();
  capturePage = vi.fn<(rect?: unknown) => Promise<string>>(async () => "image");
  async loadURL(url: string) {
    this.loads.push(url);
  }
}

export const platform = {
  views: [] as { options: Record<string, unknown>; view: FakeView }[],
  partitions: [] as string[],
  request: null as null | ((c: unknown, p: string, decide: (ok: boolean) => void) => void),
  check: null as null | (() => boolean),
  downloads: [] as boolean[],
  /** Called with each new view's contents: the test guards it as the app does every new contents. */
  onContents: (_contents: FakeContents) => {},
};

export class FakeView {
  webContents = new FakeContents();
  bounds: unknown = null;
  visible = true;
  constructor(options: Record<string, unknown>) {
    platform.views.push({ options, view: this });
    platform.onContents(this.webContents);
  }
  setBounds(b: unknown) {
    this.bounds = b;
  }
  setVisible(v: boolean) {
    this.visible = v;
  }
  getVisible() {
    return this.visible;
  }
  getBounds() {
    return this.bounds;
  }
}

export const fakeElectron = () => ({
  WebContentsView: FakeView,
  BrowserWindow: vi.fn<() => void>(),
  ipcMain: { on: vi.fn<() => void>() },
  session: {
    fromPartition(name: string) {
      platform.partitions.push(name);
      return {
        setPermissionRequestHandler: (h: typeof platform.request) => void (platform.request = h),
        setPermissionCheckHandler: (h: typeof platform.check) => void (platform.check = h),
        on: (event: string, h: (e: { preventDefault: () => void }) => void) => {
          if (event !== "will-download") return;
          const e = { prevented: false, preventDefault: () => void (e.prevented = true) };
          h(e);
          platform.downloads.push(e.prevented);
        },
      };
    },
  },
});

type Listener = Parameters<EventEmitter["on"]>[1];

/** The main window: its zoom, its child views, what it sent the page, and its own page's events. */
export function fakeWindow(zoom = 1) {
  const sent: unknown[][] = [];
  const children = new Set<FakeView>();
  const events = new EventEmitter();
  const page = new EventEmitter();
  const win = {
    isDestroyed: () => false,
    webContents: {
      getZoomFactor: () => zoom,
      send: (...args: unknown[]) => void sent.push(args),
      on: (event: string, h: Listener) => void page.on(event, h),
      off: (event: string, h: Listener) => void page.off(event, h),
    },
    contentView: {
      addChildView: (v: FakeView) => void children.add(v),
      removeChildView: (v: FakeView) => void children.delete(v),
    },
    once: (event: string, h: () => void) => void events.once(event, h),
    off: (event: string, h: () => void) => void events.off(event, h),
  };
  return { win, sent, children, events, page };
}

export type FakeWindow = ReturnType<typeof fakeWindow>;
