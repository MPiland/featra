import { test as base } from "@playwright/test";
import { closeLeftRunning } from "./evidence.ts";

export * from "@playwright/test";

/**
 * Every e2e spec's `test` (BUG-30): Playwright's, with one automatic fixture. After each test, failed and timed-out
 * ones included, it closes each app the test left running, which first saves a screenshot of each window and the app's
 * trace (`evidence.ts`). A spec closes its app at the end of `try`, so a test that times out never got there and lost both
 * exactly when they were needed. After a timeout Playwright runs fixture teardown in a time slot of its own.
 */
export const test = base.extend<{ appEvidence: undefined }>({
  appEvidence: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright reads a fixture's needs from this pattern; it needs none
    async ({}, use) => {
      await use(undefined);
      await closeLeftRunning();
    },
    { auto: true },
  ],
});
