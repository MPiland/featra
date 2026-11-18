import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import { e2eReporters } from "../../e2e/reporters.ts";

/** Tests run by `e2e-report.test.ts` (STORY-63) with the e2e suite's own reporters, as each platform's CI job runs. */
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  workers: 1,
  reporter: e2eReporters(),
  // Outside the repo: the failure is made on purpose and nothing reads its output.
  outputDir: join(tmpdir(), "featra-report-fixture"),
  preserveOutput: "never",
});
