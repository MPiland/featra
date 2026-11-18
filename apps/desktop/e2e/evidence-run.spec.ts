import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { REPO, run } from "../../../tooling/test/run.ts";
import { expect, test } from "./fixtures.ts";

/**
 * BUG-30, end to end: an e2e test that times out on a locator the app never shows, run by Playwright with the suite's
 * fixtures and reporters (`stuck-app/`), prints the step and the locator it waited on, and the screenshot and trace it
 * kept, and both files are there.
 */

/** The outer run's own settings, which would steer the nested run: its worker, its loader, its colours. */
const OUTER = /^(?:TEST_|PW_|PLAYWRIGHT_(?!BROWSERS_PATH)|FORCE_COLOR$|NO_COLOR$)/;

test("BUG-30: a test that times out on a missing locator prints where it stopped and the files it kept", () => {
  test.setTimeout(150_000);
  const out = test.info().outputPath("nested-run");
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !OUTER.test(key)));
  const { output } = run("pnpm --filter @featra/desktop exec playwright test -c e2e/stuck-app/playwright.config.ts", {
    env: { ...env, FEATRA_STUCK_OUTPUT: out, NO_COLOR: "1" },
  });
  const text = stripVTControlCharacters(output);

  expect(text).toMatch(
    /Where "waits on a button the app never shows" stopped \(timedOut\):\s+Step: Click\s+(?:Inside: [^\n]*\s+)?At: \S*missing-locator\.stuck\.ts:\d+: await page\.getByRole\("button", \{ name: "BUG-30: not in the app" \}\)\.click\(\);/,
  );
  const kept =
    /\n {2}Kept:\n((?: {4}\S[^\n]*(?:\n|$))+)/
      .exec(text)?.[1]
      ?.trim()
      .split(/\s*\n\s*/) ?? [];
  expect(kept).toEqual([
    expect.stringMatching(/electron-\d+-window-1\.png$/),
    expect.stringMatching(/electron-\d+\.zip$/),
  ]);
  expect(kept.filter((file) => !existsSync(resolve(REPO, file)))).toEqual([]);
});
