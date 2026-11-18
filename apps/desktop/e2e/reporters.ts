import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReporterDescription } from "@playwright/test";

/** The repository root, which the reporters print and write paths from. */
export const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/**
 * The e2e suite's reporters: the list; where each failed test stopped and the files kept for it, with paths from the
 * repo root (BUG-30); and, when FEATRA_JUNIT names a file (from the repo root, as for the unit tests), a JUnit report.
 * CI uploads that report from each platform's job, and Featra reads them together to prove criteria (STORY-57,
 * STORY-63).
 */
export function e2eReporters(env: NodeJS.ProcessEnv = process.env): ReporterDescription[] {
  const junit = env.FEATRA_JUNIT;
  const reporters: ReporterDescription[] = [
    ["list"],
    [fileURLToPath(new URL("stuck-step-reporter.ts", import.meta.url)), { root: REPO_ROOT }],
  ];
  if (junit) reporters.push(["junit", { outputFile: isAbsolute(junit) ? junit : join(REPO_ROOT, junit) }]);
  return reporters;
}
