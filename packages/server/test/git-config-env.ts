import { afterEach, beforeEach } from "vitest";

/**
 * The pre-commit hook runs the tests under `git -c core.hooksPath=.githooks`, and the product's git keeps that
 * environment config (ADR 0023), so a test repository's own hook would be skipped. A file whose tests need the
 * repository's hook to run calls this: it takes that config out of the process environment for each test, and puts it back.
 */
const CONFIG = ["GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT"] as const;

export function withoutInheritedGitConfig(): void {
  let saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    saved = Object.fromEntries(CONFIG.map((k) => [k, process.env[k]]));
    for (const k of CONFIG) delete process.env[k];
  });
  afterEach(() => {
    for (const k of CONFIG) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
}
