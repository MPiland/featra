import { expect, test } from "@playwright/test";

/** Run on each platform by `e2e-report.test.ts` (STORY-63): FIXTURE_OS names the platform the run stands for. */
test.describe("a platform's e2e run", () => {
  test("works on every platform", () => {
    expect(process.env.FIXTURE_OS).toBeTruthy();
  });

  test("works except on macOS", () => {
    expect(process.env.FIXTURE_OS, "the platform").not.toBe("macos");
  });
});
