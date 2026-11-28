import type { ElectronApplication, Page } from "@playwright/test";
import type { BrowserHandle } from "../src/browser-pane.ts";
import { uxImage, uxShot } from "./ux-shot.ts";

/**
 * The Browser pane's page as the journeys see it (STORY-74): a view of its own over the window, which Playwright's
 * pages don't include, so it is read and captured through the main process's open panes (test-hooks.ts).
 */
type MainGlobal = typeof globalThis & { featraTest: { browserPanes?: () => BrowserHandle[] } };

/** Runs `js` in the open pane's page; null with no pane open. */
export const inBrowserPage = <T>(app: ElectronApplication, js: string): Promise<T | null> =>
  app.evaluate(async (_e, code) => {
    const pane = (globalThis as MainGlobal).featraTest.browserPanes?.()[0];
    return pane ? ((await pane.contents.executeJavaScript(code)) as T) : null;
  }, js);

/** The open pane's page's address; null with no pane open. */
export const browserUrl = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as MainGlobal).featraTest.browserPanes?.()[0]?.contents.getURL() ?? null);

/**
 * How light the page shows at its top right corner, as captured (0 black to 255 white): a page whose dark header
 * spans its width shows dark there only when the page fills its view, as a device scaled to fit must.
 */
export const browserTopRight = (app: ElectronApplication) =>
  app.evaluate(async () => {
    const pane = (globalThis as MainGlobal).featraTest.browserPanes?.()[0];
    if (!pane) return null;
    const image = await pane.contents.capturePage();
    const { width, height } = image.getSize();
    const bitmap = image.toBitmap();
    // The bitmap's own rows, which may be at the screen's scale rather than in DIPs.
    const k = Math.sqrt(bitmap.length / 4 / Math.max(1, width * height));
    const columns = Math.round(width * k);
    const at = (Math.round(4 * k) * columns + columns - Math.round(4 * k)) * 4;
    return Math.round(((bitmap[at] ?? 0) + (bitmap[at + 1] ?? 0) + (bitmap[at + 2] ?? 0)) / 3);
  });

/** An input event as Electron's `sendInputEvent` takes it: a mouse event at the page's CSS px, or a key. */
export type PageInput = {
  type: "mouseMove" | "mouseDown" | "mouseUp" | "keyDown" | "keyUp";
  x?: number;
  y?: number;
  button?: "left";
  clickCount?: number;
  modifiers?: "shift"[];
  keyCode?: string;
};

/**
 * Sends `events` to the open pane's page as the user's own input: Chromium marks them trusted, as the overlay asks
 * (STORY-75). Playwright's input reaches only the window's page, not the pane's view.
 */
export const browserInput = (app: ElectronApplication, events: PageInput[]) =>
  app.evaluate((_e, list) => {
    const pane = (globalThis as MainGlobal).featraTest.browserPanes?.()[0];
    for (const event of list)
      pane?.contents.sendInputEvent(event as Parameters<typeof pane.contents.sendInputEvent>[0]);
  }, events);

/** A click at `x`, `y` in the pane's page, with Shift if `shift`. */
export const browserClick = (app: ElectronApplication, x: number, y: number, shift = false) => {
  const at = { x: Math.round(x), y: Math.round(y), ...(shift ? { modifiers: ["shift" as const] } : {}) };
  return browserInput(app, [
    { type: "mouseMove", ...at },
    { type: "mouseDown", button: "left", clickCount: 1, ...at },
    { type: "mouseUp", button: "left", clickCount: 1, ...at },
  ]);
};

/** The box of the first element `selector` finds in the pane's page, in its CSS px. */
export async function browserBox(app: ElectronApplication, selector: string) {
  const box = await inBrowserPage<{ x: number; y: number; width: number; height: number }>(
    app,
    `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`,
  );
  if (!box) throw new Error(`No ${selector} in the Browser pane's page.`);
  return box;
}

/**
 * Whether the page's document has been shown: its first contentful paint is reported once the frame is presented.
 * Until then Chromium drops input to a document just navigated to (paint holding keeps the last page on screen, and
 * input meant for it must not reach the new one), so a click sent before is lost, as a user's would be.
 */
export const browserPainted = (app: ElectronApplication) =>
  inBrowserPage<boolean>(app, "performance.getEntriesByType('paint').some((e) => e.name === 'first-contentful-paint')");

/** How many Browser panes are open. */
export const browserPanesOpen = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as MainGlobal).featraTest.browserPanes?.().length ?? 0);

/**
 * Saves the window with the pane's page drawn where it shows, for the design review (`uxShot`): the window's capture,
 * and the page's, put together in the window's own page (a canvas), at the window's pixels.
 */
export async function browserShot(app: ElectronApplication, page: Page, name: string): Promise<void> {
  try {
    const view = await app.evaluate(async ({ BrowserWindow }) => {
      const pane = (globalThis as MainGlobal).featraTest.browserPanes?.()[0];
      const bounds = pane?.bounds();
      if (!pane || !bounds) return null;
      const image = await pane.contents.capturePage();
      const width = BrowserWindow.getAllWindows()[0]?.getContentBounds().width ?? 0;
      return { png: image.toPNG().toString("base64"), bounds, width };
    });
    if (!view || !view.width) return await uxShot(page, name);
    const base = (await page.screenshot({ timeout: 5_000 })).toString("base64");
    const composed = await page.evaluate(
      async ({ shot, over }) => {
        const [win, shown] = await Promise.all(
          [shot, over.png].map(
            (png) =>
              new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new Image();
                img.addEventListener("load", () => resolve(img));
                img.addEventListener("error", () => reject(new Error("An image didn't load.")));
                img.src = `data:image/png;base64,${png}`;
              }),
          ),
        );
        const k = win!.naturalWidth / over.width;
        const canvas = document.createElement("canvas");
        canvas.width = win!.naturalWidth;
        canvas.height = win!.naturalHeight;
        const g = canvas.getContext("2d")!;
        g.drawImage(win!, 0, 0);
        const b = over.bounds;
        g.drawImage(shown!, b.x * k, b.y * k, b.width * k, b.height * k);
        return canvas.toDataURL("image/png").slice("data:image/png;base64,".length);
      },
      { shot: base, over: view },
    );
    await uxImage(name, Buffer.from(composed, "base64"));
  } catch (err) {
    process.stderr.write(`uxShot: skipped ${name}: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}
