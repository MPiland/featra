import { expect, test, type ElectronApplication } from "./fixtures.ts";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { openStoryBrowser } from "./browser-journey.ts";
import { browserPanesOpen, browserShot, browserTopRight, browserUrl, inBrowserPage } from "./browser-page.ts";
import { project } from "./draft-project.ts";
import { freePort, setProof } from "./proof-setup.ts";
import { atReviewSize } from "./ux-shot.ts";

/**
 * STORY-74: the Browser pane opens from a story's card, starts the story's dev server in its worktree and shows it in
 * the main window; its address bar goes anywhere, back and reload; the device toolbar shows the page as a phone and at a
 * size of the user's own; and closing the pane stops the dev server. The real app, its real local server, real git and
 * a real dev server (fixture-dev-server.mjs); only the platform and the agent are faked (agent.ts).
 */
test("Browser pane: a story's dev server shows beside its card, as any device, and stops when it closes", async () => {
  const userData = await tempUserData();
  const repo = await project();
  const bin = await standInClaude();
  const url = `http://127.0.0.1:${await freePort()}`;
  let running: ElectronApplication | undefined;
  try {
    const { app, page } = await launch(userData.dir, {
      FEATRA_PROJECT_DIR: repo.dir,
      FEATRA_E2E_AGENT_SDK: FAKE_SDK,
      [PATH_KEY]: bin.path,
    });
    running = app;
    await atReviewSize(app, page);
    await setProof(page, "Preview", url);

    // Browser, from the story's card: the pane docks beside it, the dev server starts and its page shows.
    const { card, browser } = await openStoryBrowser(app, page, repo.dir, url);
    const address = browser.getByRole("textbox", { name: "Address" });
    await expect(address).toHaveValue(`${url}/`);

    // The card closes; the page fits the pane, which takes the room.
    await card.getByRole("button", { name: "Close card" }).click();
    const viewport = browser.locator(".browser-viewport");
    const fitted = async () => Math.round((await viewport.boundingBox())?.width ?? 0);
    await expect.poll(async () => (await inBrowserPage(app, "innerWidth")) === (await fitted())).toBe(true);
    await expect.poll(() => browserTopRight(app)).toBeLessThan(100);
    await browserShot(app, page, "feat10-browser-desktop-fit");

    // Any address, then back, then reload.
    await address.fill(`${url}/second`);
    await address.press("Enter");
    await expect.poll(() => browserUrl(app)).toBe(`${url}/second`);
    await expect(address).toHaveValue(`${url}/second`);
    await browser.getByRole("button", { name: "Back", exact: true }).click();
    await expect.poll(() => browserUrl(app)).toBe(`${url}/`);
    await inBrowserPage(app, "window.featraMark = 1");
    await browser.getByRole("button", { name: "Reload", exact: true }).click();
    await expect.poll(() => inBrowserPage(app, "typeof window.featraMark")).toBe("undefined");

    // A phone: the page sees its width.
    const device = browser.getByRole("combobox", { name: "Device" });
    await device.selectOption({ label: "iPhone SE" });
    await expect.poll(() => inBrowserPage(app, "innerWidth")).toBe(375);
    await expect.poll(() => inBrowserPage(app, "navigator.maxTouchPoints")).toBe(5);
    // Scaled to fit the pane, the phone's page fills its frame: its header reaches the right edge.
    await expect.poll(() => browserTopRight(app)).toBeLessThan(100);
    // The scale it is drawn at shows beside its size, as Chrome shows it.
    await expect(browser.locator(".browser-scale")).toHaveText(/^\d{1,2}%$/);
    await browserShot(app, page, "feat10-browser-phone");

    // Responsive, at a width of the user's own, with its handles.
    await device.selectOption({ label: "Responsive" });
    const width = browser.getByRole("spinbutton", { name: "Width" });
    await width.fill("500");
    await width.press("Enter");
    await expect.poll(() => inBrowserPage(app, "innerWidth")).toBe(500);
    await expect(browser.getByRole("separator", { name: "Resize width" })).toBeVisible();
    await expect.poll(() => browserTopRight(app)).toBeLessThan(100);
    await browserShot(app, page, "feat10-browser-responsive");

    // Close: the view goes, and the dev server the pane started stops.
    await browser.getByRole("button", { name: "Close browser" }).click();
    await expect(browser).toHaveCount(0);
    await expect.poll(() => browserPanesOpen(app)).toBe(0);
    await expect
      .poll(
        () =>
          fetch(url).then(
            () => "answers",
            () => "stopped",
          ),
        { timeout: 30_000 },
      )
      .toBe("stopped");
  } finally {
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
});
