import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";

/** Teardown that fails, for the test named so: its error joins the test's, as a harness failure would. */
export const TEARDOWN_FAILS = "fails in a step, and its teardown fails too";

/**
 * Like the e2e suite's evidence fixture (`e2e/fixtures.ts`), an automatic fixture whose teardown runs Playwright steps
 * after each test, timed-out ones included, so the reporter's run sees steps it must never name (BUG-30).
 */
export const test = base.extend<{ tidy: undefined }>({
  tidy: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright reads a fixture's needs from this pattern; it needs none
    async ({}, use, info) => {
      await use(undefined);
      await base.step("tidy up after the test", async () => {
        await base.step("close what it left running", () => Promise.resolve());
        if (info.title === TEARDOWN_FAILS) throw new Error("the tidy-up failed too");
      });
    },
    { auto: true },
  ],
});
