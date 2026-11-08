import { expect, test } from "@playwright/test";

// Throwaway (STORY-43): fails on purpose to show that branch protection blocks the merge. Never merged.
test("fails on purpose so the PR is blocked", () => {
  expect(1 + 1).toBe(3);
});
