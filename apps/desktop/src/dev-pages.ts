import { BrowserWindow, type WebContents } from "electron";
import { isDevServerUrl } from "@featra/work-format/proof";
import type { HostCapture } from "./server-process.ts";
import { e2e, testHooks } from "./test-hooks.ts";

/**
 * Pages of a story's dev server, shown by Electron's own Chromium (STORY-25, ADR 0044): captured in a hidden window
 * when the server asks, as the story moves to review, and opened in a Preview window when the user asks. Only a page on
 * this computer (http on localhost or 127.0.0.1) is ever loaded, and a Preview window navigates only within it.
 */

const WIDTH = 1280;
const HEIGHT = 800;
/** How long a page has to load before it isn't captured. */
const LOAD_MS = 30_000;
/** The largest screenshot evidence takes (EVIDENCE_BYTES): a bigger PNG is captured again as a JPEG. */
const MAX_BYTES = 1_000_000;

/** The page's origin when it is a dev server's on this computer; null otherwise. */
function localOrigin(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    return isDevServerUrl(`${u.protocol}//${u.host}`) ? u.origin : null;
  } catch {
    return null;
  }
}

/** The Preview windows' contents, each with the origin it may navigate in. */
const previews = new WeakMap<WebContents, string>();

/** Whether `contents` may go to `url`: a Preview window, within its dev server. Every other window stays put. */
export const mayNavigate = (contents: WebContents, url: string): boolean =>
  previews.get(contents) !== undefined && previews.get(contents) === localOrigin(url);

const windowOptions = { width: WIDTH, height: HEIGHT, webPreferences: { sandbox: true, contextIsolation: true } };

/** Loads `url`, failing after `ms`. */
function load(win: BrowserWindow, url: string, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("The page took too long to load.")), ms);
  });
  return Promise.race([win.loadURL(url), late]).finally(() => clearTimeout(timer));
}

/** Captures the dev server's page at `url` in a hidden window: a PNG, or a JPEG when the PNG is over 1 MB. */
export async function capturePage(url: string): Promise<HostCapture> {
  if (!localOrigin(url)) return { error: "Only a page on this computer is captured." };
  const win = new BrowserWindow({ ...windowOptions, show: false, paintWhenInitiallyHidden: true });
  try {
    await load(win, url, LOAD_MS);
    const image = await win.webContents.capturePage();
    const png = image.toPNG();
    if (png.length <= MAX_BYTES) return { data: png.toString("base64"), ext: "png" };
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
  const win = new BrowserWindow({ ...windowOptions, title: name });
  previews.set(win.webContents, origin);
  // The page's own <title> would replace the story's.
  win.on("page-title-updated", (e) => e.preventDefault());
  if (e2e) testHooks.previews.push({ url, title: name });
  void win.loadURL(url).catch(() => {});
}
