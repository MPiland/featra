import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  // Each test launches its own Electron with its own userData folder; keep them serial to avoid focus fights.
  workers: 1,
  reporter: [["list"]],
  outputDir: "../test-results",
  use: { trace: "retain-on-failure" },
});
