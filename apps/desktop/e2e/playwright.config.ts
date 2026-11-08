import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  // Each test launches its own Electron with its own userData folder; keep them serial to avoid focus fights.
  workers: 1,
  reporter: [["list"]],
  outputDir: "../test-results",
  // Keeps a failed test's output (traces from app.ts's launch(), screenshots) and drops a passing test's.
  preserveOutput: "failures-only",
  use: { trace: "retain-on-failure" },
});
