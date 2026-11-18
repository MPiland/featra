import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

/** Tests that fail or never finish, run by `stuck-step-reporter.test.ts` (BUG-30) with the e2e suite's reporters. */
export default defineConfig({
  testDir: ".",
  testMatch: "*.stuck.ts",
  workers: 1,
  reporter: [
    ["list"],
    ["../../e2e/stuck-step-reporter.ts", { root: fileURLToPath(new URL("../../../..", import.meta.url)) }],
  ],
  outputDir: fileURLToPath(new URL("../../test-results/stuck-fixture", import.meta.url)),
  preserveOutput: "never",
});
