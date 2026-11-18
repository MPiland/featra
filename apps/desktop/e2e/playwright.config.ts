import { defineConfig } from "@playwright/test";
import { e2eReporters } from "./reporters.ts";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  // Each test launches its own Electron with its own userData folder; keep them serial to avoid focus fights.
  workers: 1,
  // Refuse to start beside leftover harness processes or on a desktop the focus tests can't use; fail if any outlive the run.
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  // The list, where each failed test stopped (BUG-30), and the JUnit report CI uploads (STORY-63).
  reporter: e2eReporters(),
  outputDir: "../test-results",
  // Keeps a failed test's output (traces and window screenshots from app.ts, the runner's trace) and drops a passing test's.
  preserveOutput: "failures-only",
  use: { trace: "retain-on-failure" },
});
