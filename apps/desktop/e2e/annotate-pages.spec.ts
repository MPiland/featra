import { expect, test, type ElectronApplication } from "./fixtures.ts";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { openStoryBrowser } from "./browser-journey.ts";
import type { BrowserHandle } from "../src/browser-pane.ts";
import { browserBox, browserClick, browserPainted, browserUrl, inBrowserPage } from "./browser-page.ts";
import { project } from "./draft-project.ts";
import { freePort, setProof } from "./proof-setup.ts";
import { atReviewSize } from "./ux-shot.ts";

type MainGlobal = typeof globalThis & { featraTest: { browserPanes?: () => BrowserHandle[] } };

/**
 * STORY-75, from the review of PR #96: Annotate over the page's life. A marker comes back after a reload and still
 * opens its annotation; a pick works on the reloaded page and on the page a link leads to, where Shift doesn't add to
 * an annotation of the page before. An annotation's screenshot is the page as shown on a phone, for a page with no
 * viewport meta. The real app, its real local server, real git, a real dev server (fixture-dev-server.mjs) and real
 * input to the page's view; only the platform and the agent are faked.
 */
test("Annotate: markers come back after a reload, picks work on later pages, and a phone's screenshot is right", async () => {
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
    const { card, browser } = await openStoryBrowser(app, page, repo.dir, url);
    await card.getByRole("button", { name: "Close card" }).click();
    const toggle = browser.getByRole("button", { name: "Annotate", exact: true });
    const list = browser.getByRole("region", { name: "Annotations" });
    const comment = browser.getByRole("textbox", { name: "Comment" });
    const done = browser.getByRole("button", { name: "Done", exact: true });
    const hit = (x: number, y: number) =>
      inBrowserPage(app, `document.elementFromPoint(${Math.round(x)}, ${Math.round(y)})?.tagName`);

    // Annotation 1, on the heading; then Annotate off.
    await toggle.click();
    const h1 = await browserBox(app, "h1");
    await expect.poll(() => hit(h1.x + 5, h1.y + 5)).toBe("FEATRA-ANNOTATE");
    await browserClick(app, h1.x + 20, h1.y + h1.height / 2);
    await expect(comment).toBeFocused();
    await comment.fill("Make the heading bigger");
    await done.click();
    await toggle.focus();
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    // Reload: the new document gets the overlay, and marker 1 shows again and opens annotation 1.
    await inBrowserPage(app, "window.featraMark = 1");
    await browser.getByRole("button", { name: "Reload", exact: true }).click();
    await expect.poll(() => inBrowserPage(app, "typeof window.featraMark")).toBe("undefined");
    // Shown, as the user would see it before clicking: input to a document not yet shown is dropped (browserPainted).
    await expect.poll(() => browserPainted(app)).toBe(true);
    await expect.poll(() => hit(h1.x + 11, h1.y - 13)).toBe("FEATRA-ANNOTATE");
    const para = await browserBox(app, "main > p");
    expect(await hit(para.x + 5, para.y + para.height / 2)).toBe("P");
    await browserClick(app, h1.x + 11, h1.y - 13);
    const first = list.getByRole("button", { name: "Annotation 1: Make the heading bigger" });
    await expect(first).toHaveAttribute("aria-expanded", "true");
    await done.click();

    // A pick on the reloaded page: annotation 2.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const button = await browserBox(app, "main > button");
    await expect.poll(() => hit(button.x + 5, button.y + 5)).toBe("FEATRA-ANNOTATE");
    await browserClick(app, button.x + 10, button.y + 10);
    await expect(list.getByRole("button", { name: "Annotation 2: No comment yet" })).toBeVisible();
    await expect(comment).toBeFocused();
    await comment.fill("Make it primary");
    await done.click();
    await toggle.focus();
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    // A link to another page, with annotation 1 open: there, Shift-click is an annotation of its own.
    await inBrowserPage(
      app,
      "document.querySelector('main').insertAdjacentHTML('beforeend', '<p><a id=\"next\" href=\"/next\">Next</a></p>')",
    );
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    const link = await browserBox(app, "#next");
    await browserClick(app, link.x + 5, link.y + link.height / 2);
    await expect.poll(() => browserUrl(app)).toBe(`${url}/next`);
    await expect.poll(() => browserPainted(app)).toBe(true);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const there = await browserBox(app, "h1");
    await expect.poll(() => hit(there.x + 30, there.y + 5)).toBe("FEATRA-ANNOTATE");
    await browserClick(app, there.x + 40, there.y + there.height / 2, true);
    await expect(list.getByRole("button", { name: "Annotation 3: No comment yet" })).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await toggle.focus();
    await page.keyboard.press("Escape");

    // A phone, and a page with no viewport meta: laid out at 980 px and drawn scaled, scrolled down. A screenshot of
    // the block's rect is all the block's magenta, edge to edge. The layout is the document's width (980); innerWidth
    // is the visual viewport, 375 px over the initial scale (375 / 980), which Chromium rounds up to a whole px.
    await browser.getByRole("combobox", { name: "Device" }).selectOption({ label: "iPhone SE" });
    const address = browser.getByRole("textbox", { name: "Address" });
    await address.fill(`${url}/plain`);
    await address.press("Enter");
    await expect.poll(() => browserUrl(app)).toBe(`${url}/plain`);
    await expect.poll(() => inBrowserPage(app, "document.documentElement.clientWidth")).toBe(980);
    expect(await inBrowserPage(app, "visualViewport.scale < 1")).toBe(true);
    await inBrowserPage(app, "scrollTo(0, 700)");
    await expect.poll(() => inBrowserPage(app, "scrollY")).toBe(700);
    const block = await browserBox(app, "#block");
    const rect = {
      x: Math.round(block.x + 10),
      y: Math.round(block.y + 10),
      width: Math.round(block.width - 20),
      height: Math.round(block.height - 20),
    };
    const off = await app.evaluate(async ({ nativeImage }, r) => {
      const pane = (globalThis as MainGlobal).featraTest.browserPanes?.()[0];
      const shot = pane ? await pane.capture(r) : null;
      if (!shot) return null;
      const image = nativeImage.createFromDataURL(shot);
      const { width, height } = image.getSize();
      const bitmap = image.toBitmap();
      const k = Math.sqrt(bitmap.length / 4 / Math.max(1, width * height));
      const columns = Math.round(width * k);
      const rows = Math.round(height * k);
      // How far from #c828c8 the farthest of its corners and its middle is, in any channel (B and R alike).
      let worst = 0;
      for (const [fx, fy] of [
        [0.05, 0.05],
        [0.95, 0.05],
        [0.05, 0.95],
        [0.95, 0.95],
        [0.5, 0.5],
      ] as const) {
        const at = (Math.floor(fy * rows) * columns + Math.floor(fx * columns)) * 4;
        const [c0 = 0, c1 = 0, c2 = 0] = [bitmap[at], bitmap[at + 1], bitmap[at + 2]];
        worst = Math.max(worst, Math.abs(c0 - 0xc8), Math.abs(c1 - 0x28), Math.abs(c2 - 0xc8));
      }
      return worst;
    }, rect);
    expect(off).not.toBeNull();
    expect(off).toBeLessThan(24);
  } finally {
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
});
