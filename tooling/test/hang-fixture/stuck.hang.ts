import { expect, it } from "vitest";
import { until } from "../../waits.ts";

/** Tests that never finish, each in a different wait, so the hang guard stops them (`wait-report.test.ts`, BUG-30). */
const ready = { done: false };

it("hangs in until", async () => {
  await until(() => ready.done);
  expect(ready.done).toBe(true);
});

it("hangs in expect.poll", async () => {
  await expect.poll(() => ready.done).toBe(true);
});

it("fails without waiting", () => {
  expect(ready.done).toBe(true);
});

it("passes", () => {
  expect(ready.done).toBe(false);
});
