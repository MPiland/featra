import { expect, TEARDOWN_FAILS, test } from "./fixtures.ts";

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

test(TEARDOWN_FAILS, async () => {
  await test.step("check the list", () => {
    expect(ready.done, "the list is shown").toBe(true);
  });
});

test("catches a failed step, then fails outside any step", async () => {
  await test
    .step("try the title", () => {
      expect(ready.done, "the title is shown").toBe(true);
    })
    .catch(() => undefined);
  throw new Error("the list never came");
});
