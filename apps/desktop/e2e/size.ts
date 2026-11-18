import type { ElectronApplication, Page } from "@playwright/test";

const SIZE_TRIES = 5;

/**
 * Sizes the window's content area, as a user dragging its edges would, and waits until the page has that size. A
 * window manager can apply a request late or drop it: one made before the window is first shown is lost when the
 * window is mapped at its default size (seen on WSLg). So the window is first shown, out of full screen and not
 * maximized, and the request is made again until it holds. A size the window manager never gives is a failure.
 * Shared by the journeys that check layout at 1280×800 and at the app's minimum size.
 */
export async function sizeTo(app: ElectronApplication, page: Page, width: number, height: number) {
  let got: number[] = [];
  for (let attempt = 0; attempt < SIZE_TRIES; attempt++) {
    got = await app.evaluate(
      async ({ BrowserWindow }, [w, h]) => {
        const win = BrowserWindow.getAllWindows()[0]!;
        // Each wait ends on the window's event, or after a second when the event never comes.
        // It runs in the main process: app.evaluate sends this function alone, so nothing outside it is there.
        // oxlint-disable-next-line unicorn/consistent-function-scoping
        const settle = (wait: (done: () => void) => void) =>
          new Promise<void>((done) => {
            wait(done);
            setTimeout(done, 1000);
          });
        if (!win.isVisible()) await settle((done) => win.once("show", done));
        if (win.isFullScreen()) {
          win.setFullScreen(false);
          await settle((done) => win.once("leave-full-screen", done));
        }
        if (win.isMaximized()) {
          win.unmaximize();
          await settle((done) => win.once("unmaximize", done));
        }
        const [cw, ch] = win.getContentSize();
        if (cw !== w || ch !== h) {
          win.setContentSize(w, h);
          await settle((done) => win.once("resize", done));
        }
        return win.getContentSize();
      },
      [width, height] as const,
    );
    if (got[0] !== width || got[1] !== height) continue;
    const settled = await page
      .waitForFunction(([w, h]) => window.innerWidth === w && window.innerHeight === h, [width, height], {
        timeout: 2000,
      })
      .then(
        () => true,
        () => false,
      );
    if (settled) return;
  }
  const inner = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
  throw new Error(
    `The window manager didn't give the window ${width}×${height} after ${SIZE_TRIES} tries: ` +
      `content ${got.join("×")}, page ${inner.join("×")}.`,
  );
}
