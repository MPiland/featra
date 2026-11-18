import { expect, test } from "@playwright/test";

/** Tests that stop in a step, for `stuck-step-reporter.test.ts` (BUG-30). None needs a browser. */
const ready = { done: false };

test("hangs in a step", async () => {
  await test.step("open the Work list", async () => {
    await new Promise<void>(() => undefined);
  });
});

test("hangs in a poll", async () => {
  await expect.poll(() => ready.done).toBe(true);
});

test("fails in a step", async () => {
  await test.step("check the title", () => {
    expect(ready.done, "the title is shown").toBe(true);
  });
});

test("passes", () => {
  expect(ready.done).toBe(false);
});
