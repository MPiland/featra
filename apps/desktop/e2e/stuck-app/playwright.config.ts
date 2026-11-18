import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

/**
 * An e2e test that times out in the app, run by `evidence-run.spec.ts` (BUG-30) with the e2e suite's reporters, to
 * output the outer test names. Kept out of the suite's own run: its tests are named `*.stuck.ts`.
 */
const outputDir = process.env.FEATRA_STUCK_OUTPUT;
if (!outputDir) throw new Error("FEATRA_STUCK_OUTPUT names the folder for this run's output");

export default defineConfig({
  testDir: ".",
  testMatch: "*.stuck.ts",
  timeout: 15_000,
  workers: 1,
  reporter: [["list"], ["../stuck-step-reporter.ts", { root: fileURLToPath(new URL("../../../..", import.meta.url)) }]],
  outputDir,
  preserveOutput: "failures-only",
});
