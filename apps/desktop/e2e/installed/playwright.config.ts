import { defineConfig } from "@playwright/test";
import { e2eReporters } from "../reporters.ts";

/**
 * The installed app's smoke test (STORY-64): run by each package job in CI after `pnpm package`, never locally. It
 * installs the installer as a tester would and launches what was installed.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.smoke.ts",
  timeout: 120_000,
  workers: 1,
  reporter: e2eReporters(),
  outputDir: "../../test-results",
  preserveOutput: "failures-only",
  use: { trace: "retain-on-failure" },
});
