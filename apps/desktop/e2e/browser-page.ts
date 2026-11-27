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
