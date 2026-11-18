import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import { run, REPO } from "../../../tooling/test/run.ts";
import { EVIDENCE, type Step, stoppedStep, whereItStopped } from "../e2e/stuck-step-reporter.ts";

// BUG-30: the CI log of a failed or timed-out e2e test names the step it stopped in and the locator it waited for.

const SPEC = join(REPO, "apps", "desktop", "e2e", "work-list.spec.ts");
const START = new Date(1_000_000);

function step(title: string, more: Partial<Step> = {}, parent?: Step): Step {
  const titles = [...(parent?.titlePath() ?? []), title];
  return { title, category: "pw:api", duration: 0, startTime: START, parent, titlePath: () => titles, ...more };
}

const noNotes = { annotations: [] };

describe("a timed-out e2e test names the step and the locator it was waiting on (BUG-30)", () => {
  it("prints where each failed test stopped, in a real Playwright run with the e2e suite's reporters", () => {
    const { output } = run(
      "pnpm --filter @featra/desktop exec playwright test -c test/stuck-fixture/playwright.config.ts --timeout=2000",
      { env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" } },
    );
    const text = stripVTControlCharacters(output);
    const file = String.raw`apps/desktop/test/stuck-fixture/stuck\.stuck\.ts`;

    expect(text).toMatch(
      new RegExp(
        String.raw`Where "hangs in a step" stopped \(timedOut\):\s+Step: open the Work list\s+` +
          String.raw`At: ${file}:7: await test\.step\("open the Work list"[^\n]*\s+Still running after \d+\.\d s when the test ended`,
      ),
    );
    expect(text).toMatch(
      new RegExp(
        String.raw`Where "hangs in a poll" stopped \(\w+\):\s+Step: [^\n]*poll[^\n]*\s+` +
          String.raw`At: ${file}:13: await expect\.poll\(\(\) => ready\.done\)\.toBe\(true\);`,
      ),
    );
    expect(text).toMatch(
      new RegExp(
        String.raw`Where "fails in a step" stopped \(failed\):\s+Step: [^\n]*\s+(?:Inside: [^\n]*\s+)?` +
          String.raw`At: ${file}:18: expect\(ready\.done, "the title is shown"\)\.toBe\(true\);\s+Failed after \d+\.\d s\s+` +
          String.raw`Its error:\s+[^\n]*the title is shown`,
      ),
    );
    expect(text).not.toMatch(/Where "passes" stopped/);
  });

  it("names the action a test was still waiting in, with its locator as written at its code line", () => {
    const body = step("open the Work list", { category: "test.step", location: { file: SPEC, line: 1 } });
    const click = step(
      "Click getByRole('button', { name: 'Not in the app' })",
      { location: { file: SPEC, line: 1 } },
      body,
    );
    const done = step("Wait for load state", { location: { file: SPEC, line: 1 } }, body);
    const stopped = stoppedStep([body, done, click], new Set([done]));
    expect(stopped).toBe(click);

    const lines = whereItStopped(
      { title: "opens the list", ...noNotes },
      { status: "timedOut", ...noNotes },
      { step: stopped, finished: false, ended: START.getTime() + 60_000 },
      REPO,
    );
    expect(lines[0]).toBe('Where "opens the list" stopped (timedOut):');
    expect(lines[1]).toBe("  Step: Click getByRole('button', { name: 'Not in the app' })");
    expect(lines[2]).toBe("  Inside: open the Work list");
    expect(lines[3]).toMatch(/^ {2}At: apps\/desktop\/e2e\/work-list\.spec\.ts:1: \S/);
    expect(lines[4]).toBe("  Still running after 60.0 s when the test ended");
  });

  it("never blames the harness's hooks and fixtures that run after the test stopped", () => {
    const action = step("Click getByText('Saved')", { location: { file: SPEC, line: 1 } });
    const fixture = step('Fixture "appEvidence"', { category: "fixture" });
    const inFixture = step("Close", { location: { file: SPEC, line: 1 } }, fixture);
    const hook = step("After Hooks", { category: "hook" });
    expect(stoppedStep([action, fixture, inFixture, hook], new Set())).toBe(action);
  });

  it("falls back to the last step that failed, and to the step around one with no code line", () => {
    const failed = step('Expect "toBeVisible"', { location: { file: SPEC, line: 1 }, error: { message: "no" } });
    const passed = step('Expect "toHaveText"', { location: { file: SPEC, line: 1 } });
    expect(stoppedStep([failed, passed], new Set([failed, passed]))).toBe(failed);

    const poll = step('Expect "poll toBe"', { category: "expect", location: { file: SPEC, line: 1 } });
    const tryOf = step('Expect "toBe"', { category: "expect" }, poll);
    expect(stoppedStep([poll, tryOf], new Set([tryOf]))).toBe(poll);
  });

  it("names the screenshot and trace kept for the test, once each, and a test that stopped outside any step", () => {
    const shot = join(REPO, "apps", "desktop", "test-results", "x", "electron-1-window-1.png");
    const trace = join(REPO, "apps", "desktop", "test-results", "x", "electron-1.zip");
    const kept = [
      { type: EVIDENCE, description: shot },
      { type: EVIDENCE, description: trace },
    ];
    const lines = whereItStopped(
      { title: "t", annotations: [{ type: "issue", description: "BUG-30" }, ...kept] },
      { status: "failed", annotations: kept },
      { step: undefined, finished: false, ended: 0 },
      REPO,
    );
    expect(lines).toEqual([
      'Where "t" stopped (failed):',
      "  In no step: in the test's own code, before or between steps.",
      "  Kept:",
      "    apps/desktop/test-results/x/electron-1-window-1.png",
      "    apps/desktop/test-results/x/electron-1.zip",
    ]);
  });
});
