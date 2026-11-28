import { expect, test, type ElectronApplication } from "./fixtures.ts";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { openStoryBrowser } from "./browser-journey.ts";
import {
  browserBox,
  browserClick,
  browserInput,
  browserPanesOpen,
  browserShot,
  inBrowserPage,
} from "./browser-page.ts";
import { project } from "./draft-project.ts";
import { freePort, setProof } from "./proof-setup.ts";
import { atReviewSize } from "./ux-shot.ts";

/**
 * STORY-75: Annotate in the Browser pane. On a story's running app, the user picks an element and comments, adds
 * another with Shift, draws a region and comments, opens an annotation from its marker on the page, sees what each
 * captured (the page's console error and the dev build's source hint among it), deletes one, leaves Annotate with
 * Escape, and closing the pane asks before the annotations are lost. The real app, its real local server, real git, a
 * real dev server (fixture-dev-server.mjs) and real input to the page's view; only the platform and the agent are faked.
 */
test("Annotate: pick, comment, draw a region, edit from a marker, delete, and be asked before closing", async () => {
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

    // The page's own console error, and what a React dev build leaves on an element it rendered (React 18's source).
    await inBrowserPage(app, "console.error('Boom from the page')");
    await inBrowserPage(
      app,
      "document.querySelector('h1')['__reactFiber$e2e'] = { _debugSource: { fileName: '/src/Heading.tsx', lineNumber: 3, columnNumber: 5 } }",
    );

    // Annotate: the overlay covers the page, and the element under the pointer is highlighted.
    const toggle = browser.getByRole("button", { name: "Annotate", exact: true });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(browser.getByText(/^Point at the page/)).toBeVisible();
    const h1 = await browserBox(app, "h1");
    await expect
      .poll(() => inBrowserPage(app, `document.elementFromPoint(${h1.x + 5}, ${h1.y + 5})?.tagName`))
      .toBe("FEATRA-ANNOTATE");
    await browserInput(app, [{ type: "mouseMove", x: Math.round(h1.x + 20), y: Math.round(h1.y + h1.height / 2) }]);
    await browserShot(app, page, "feat10-annotate-picking");

    // A click picks the heading: annotation 1 opens to take a comment, with its screenshot.
    await browserClick(app, h1.x + 20, h1.y + h1.height / 2);
    const list = browser.getByRole("region", { name: "Annotations" });
    const comment = browser.getByRole("textbox", { name: "Comment" });
    await expect(comment).toBeFocused();
    await comment.fill("Make the heading bigger");
    await expect(browser.getByRole("img", { name: "Screenshot of annotation 1" })).toBeVisible();

    // Shift-click adds the button to it.
    const button = await browserBox(app, "main > button");
    await browserClick(app, button.x + 10, button.y + 10, true);
    await browser.getByText("Details", { exact: true }).click();
    const details = browser.locator(".annotation-details");
    await expect(details).toContainText("Selector 2");
    await expect(details).toContainText("<button>Draft</button>");
    await expect(details).toContainText("<h1>Draft a feature</h1>");
    await expect(details).toContainText("Boom from the page");
    await expect(details).toContainText("/src/Heading.tsx:3:5");
    await expect(details).toContainText(url);
    await browserShot(app, page, "feat10-annotate-marker");
    await browser.getByRole("button", { name: "Done", exact: true }).click();

    // A drag draws a region over the paragraph: annotation 2, with its own comment.
    const p = await browserBox(app, "main > p");
    const from = { x: Math.round(p.x + 2), y: Math.round(p.y + 2) };
    const to = { x: Math.round(p.x + 150), y: Math.round(p.y + p.height - 2) };
    await browserInput(app, [
      { type: "mouseMove", ...from },
      { type: "mouseDown", button: "left", clickCount: 1, ...from },
      { type: "mouseMove", x: from.x + 40, y: from.y + 4 },
      { type: "mouseMove", ...to },
      { type: "mouseUp", button: "left", clickCount: 1, ...to },
    ]);
    await expect(list.getByRole("button", { name: "Annotation 2: No comment yet" })).toBeVisible();
    await expect(comment).toBeFocused();
    await comment.fill("Tighten this copy");
    await browser.getByText("Details", { exact: true }).click();
    await expect(details).toContainText("Region");
    await browser.getByRole("button", { name: "Done", exact: true }).click();
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await browserShot(app, page, "feat10-annotate-list");

    // Escape leaves Annotate; the pane and its annotations stay.
    await toggle.focus();
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(browser).toBeVisible();

    // Marker 1, on the page, opens annotation 1 to edit.
    await browserClick(app, Math.max(12, h1.x), Math.max(12, h1.y));
    await expect(list.getByRole("button", { name: "Annotation 1: Make the heading bigger" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(comment).toHaveValue("Make the heading bigger");
    await browser.getByRole("button", { name: "Done", exact: true }).click();

    // Annotation 2 deletes; the list closes up.
    await list.getByRole("button", { name: "Annotation 2: Tighten this copy" }).click();
    await browser.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(list.getByRole("listitem")).toHaveCount(1);

    // Closing with an unsent annotation asks first; Cancel keeps it.
    await browser.getByRole("button", { name: "Close browser" }).click();
    const ask = page.getByRole("alertdialog", { name: "Close browser" });
    await expect(ask).toContainText("Close the browser? Your annotation will be lost.");
    await browserShot(app, page, "feat10-annotate-close-warning");
    await ask.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(ask).toHaveCount(0);
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await browser.getByRole("button", { name: "Close browser" }).click();
    await ask.getByRole("button", { name: "Close and discard", exact: true }).click();
    await expect(browser).toHaveCount(0);
    await expect.poll(() => browserPanesOpen(app)).toBe(0);
  } finally {
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
});
