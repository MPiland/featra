import { readFile } from "node:fs/promises";
import { closeLeftRunning, exited, launch, tempUserData } from "./app.ts";
import { expect, test } from "./fixtures.ts";
import { EVIDENCE } from "./stuck-step-reporter.ts";
import { readZip } from "./zip.ts";

/**
 * BUG-30: a test that stops while the app is still running keeps a screenshot of the app's window and the app's trace,
 * with its DOM snapshots, as they were when it stopped. The test puts the app in the state a timed-out test leaves,
 * an action waiting on a locator that never comes, then runs the evidence fixture's own teardown.
 */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("BUG-30: a test stopped while the app waits keeps a screenshot of its window and its trace with DOM snapshots", async () => {
  const profile = await tempUserData();
  try {
    const { app, page } = await launch(profile.dir);
    const stuck = page
      .getByRole("button", { name: "Not in the app" })
      .click()
      .catch((e: unknown) => e);
    await page.getByRole("banner").waitFor();
    // Playwright forgets the app's process once it closes, so watch for its exit first, as other specs do.
    const gone = exited(app);

    await closeLeftRunning();
    await gone;
    expect(await stuck).toBeInstanceOf(Error);

    const kept = test.info().annotations.flatMap((a) => (a.type === EVIDENCE && a.description ? [a.description] : []));
    expect(kept).toEqual([
      expect.stringMatching(/electron-\d+-window-1\.png$/),
      expect.stringMatching(/electron-\d+\.zip$/),
    ]);
    const [shot = "", trace = ""] = kept;
    expect((await readFile(shot)).subarray(0, 8)).toEqual(PNG);

    const files = await readZip(trace);
    const events = [...files.entries()]
      .filter(([name]) => name.endsWith(".trace"))
      .map(([, data]) => data.toString("utf8"))
      .join("\n");
    expect(events).toContain('"type":"frame-snapshot"');
    expect(events).toContain("Not in the app");
    expect([...files.keys()].some((name) => /^resources\/.+\.(?:jpeg|png)$/.test(name))).toBe(true);
  } finally {
    await profile.dispose();
  }
});
