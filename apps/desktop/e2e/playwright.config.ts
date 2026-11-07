import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  // Each test launches its own Electron with its own userData folder; keep them serial to avoid focus fights.
  workers: 1,
  // Refuse to start beside leftover harness processes or on a desktop the focus tests can't use; fail if any outlive the run.
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  reporter: [["list"]],
  outputDir: "../test-results",
  use: { trace: "retain-on-failure" },
});
