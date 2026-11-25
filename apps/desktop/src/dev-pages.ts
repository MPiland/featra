import { BrowserWindow, session, type BrowserWindowConstructorOptions, type WebContents } from "electron";
import { EVIDENCE_BYTES } from "@featra/work-format/evidence-link";
import { isDevServerUrl } from "@featra/work-format/proof";
import type { HostCapture } from "./server-process.ts";
import { e2e, testHooks } from "./test-hooks.ts";

/**
 * Pages of a story's dev server, shown by Electron's own Chromium (STORY-25, ADR 0044): captured in a hidden window
 * when the server asks, as the story moves to review, and opened in a Preview window when the user asks. Only a page on
 * this computer (http on localhost or 127.0.0.1) is ever loaded, and only on the dev server's own origin: each window
 * is registered with that origin, and neither a navigation nor a server's redirect takes it anywhere else. They run in
 * a session of their own that grants a page no permission (camera, notifications and the like).
 */

const WIDTH = 1280;
const HEIGHT = 800;
/** How long a page has to load before it isn't captured. */
const LOAD_MS = 30_000;
/** The session dev pages run in, apart from the app's own, in memory only. */
export const DEV_PARTITION = "featra-dev-pages";

/** The page's origin when it is a dev server's on this computer; null otherwise, and for any URL with a user in it. */
export function localOrigin(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    if (u.username || u.password) return null;
    return isDevServerUrl(`${u.protocol}//${u.host}`) ? u.origin : null;
  } catch {
    return null;
  }
}

/** The dev pages' contents, Preview and capture windows, each with the origin it may be on. */
const devPages = new WeakMap<WebContents, string>();

/** Whether `contents` may go to `url`: a dev page, within its dev server's origin. Every other window stays put. */
export const mayNavigate = (contents: WebContents, url: string): boolean => {
  const origin = devPages.get(contents);
  return origin !== undefined && origin === localOrigin(url);
};

/**
 * Keeps a window where it is (every window, as it is created): the app's own window only ever shows the bundled
 * client, a dev page moves only within its origin, by a link or by a server's redirect alike, and none opens pop-ups.
 */
export function guardContents(contents: WebContents): void {
  const stay = (e: { preventDefault: () => void }, url: string) => {
    if (!mayNavigate(contents, url)) e.preventDefault();
  };
  contents.on("will-navigate", stay);
  contents.on("will-redirect", stay);
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
}

let sessionReady = false;

/** A window for a dev page on `origin`, in the dev pages' session, which refuses every permission a page asks for. */
function devWindow(origin: string, options: BrowserWindowConstructorOptions): BrowserWindow {
  if (!sessionReady) {
    const pages = session.fromPartition(DEV_PARTITION);
    pages.setPermissionRequestHandler((_contents, _permission, decide) => decide(false));
    pages.setPermissionCheckHandler(() => false);
    sessionReady = true;
  }
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    ...options,
    webPreferences: { sandbox: true, contextIsolation: true, partition: DEV_PARTITION },
  });
  devPages.set(win.webContents, origin);
  return win;
}

/** Loads `url`, failing after `ms`. */
function load(win: BrowserWindow, url: string, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("The page took too long to load.")), ms);
  });
  return Promise.race([win.loadURL(url), late]).finally(() => clearTimeout(timer));
}

/**
 * Captures the page at `url` of the dev server at `origin` in a hidden window: a PNG, or a JPEG when the PNG is over
 * the evidence limit. A URL off that origin, or off this computer, isn't loaded.
 */
export async function capturePage(url: string, origin: string): Promise<HostCapture> {
  const own = localOrigin(url);
  if (!own || own !== origin) return { error: "Only a page of the story's dev server is captured." };
  const win = devWindow(own, { show: false, paintWhenInitiallyHidden: true });
  try {
    await load(win, url, LOAD_MS);
    const image = await win.webContents.capturePage();
    const png = image.toPNG();
    if (png.length <= EVIDENCE_BYTES) return { data: png.toString("base64"), ext: "png" };
    return { data: image.toJPEG(80).toString("base64"), ext: "jpg" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

/** Opens the story's dev server at `url` in a Preview window titled `title`; anything not on this computer is ignored. */
export function openPreview(url: unknown, title: unknown): void {
  const origin = localOrigin(url);
  if (!origin || typeof url !== "string") return;
  const name = typeof title === "string" && title ? title.slice(0, 100) : "Preview";
  const win = devWindow(origin, { title: name });
  // The page's own <title> would replace the story's.
  win.on("page-title-updated", (e) => e.preventDefault());
  if (e2e) testHooks.previews.push({ url, title: name });
  void win.loadURL(url).catch(() => {});
}
