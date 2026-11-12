import { defineConfig } from "vitest/config";

/**
 * FEATRA_JUNIT names a file for a JUnit report of the run as well (CI uploads it, STORY-57). Naming reporters replaces
 * vitest's defaults, so they are kept: `default`, plus `github-actions` on GitHub.
 */
const junit = process.env.FEATRA_JUNIT;
const reporters = junit
  ? ["default", ...(process.env.GITHUB_ACTIONS === "true" ? ["github-actions"] : []), "junit"]
  : undefined;

export default defineConfig({
  test: {
    projects: ["packages/work-format", "packages/client", "packages/server", "packages/mcp", "apps/desktop", "tooling"],
    ...(junit ? { reporters, outputFile: { junit } } : {}),
  },
});
