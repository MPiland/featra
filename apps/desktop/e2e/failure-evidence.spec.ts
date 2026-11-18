import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { exited, launch, tempUserData } from "./app.ts";
import { closeLeftRunning, keptFiles } from "./evidence.ts";
import { expect, test } from "./fixtures.ts";
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

    const kept = keptFiles(test.info().annotations);
    expect(kept).toEqual([
      expect.stringMatching(/electron-\d+-window-1\.png$/),
      expect.stringMatching(/electron-\d+\.zip$/),
      expect.stringMatching(/electron-\d+-logs[\\/]main\.log$/),
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
    // The screencast: each frame event names its image, kept in the zip (seen in the BUG-30 probe run, 44338894157).
    const frames = [...events.matchAll(/"type":"screencast-frame".*?"file":"([^"]+)"/g)].map(([, file]) => file);
    expect(frames.length).toBeGreaterThan(0);
    expect(
      frames.filter(
        (file) =>
          files
            .get(file ?? "")
            ?.subarray(0, 3)
            .toString("hex") !== "ffd8ff",
      ),
    ).toEqual([]);
  } finally {
    await profile.dispose();
  }
});

test("BUG-31: a test stopped while the app runs keeps the app's log, with the main process's and the server's lines", async () => {
  const profile = await tempUserData();
  try {
    const { app } = await launch(profile.dir);
    const log = join(profile.dir, "logs", "main.log");
    await expect.poll(() => readFile(log, "utf8").catch(() => "")).toContain("Server listening");
    const gone = exited(app);

    await closeLeftRunning();
    await gone;

    const kept = keptFiles(test.info().annotations).filter((file) => /electron-\d+-logs[\\/]main\.log$/.test(file));
    expect(kept).toHaveLength(1);
    const text = await readFile(kept[0] ?? "", "utf8");
    expect(text).toMatch(/Featra \S+ started \(/);
    expect(text).toContain("Server listening");
  } finally {
    await profile.dispose();
  }
});
