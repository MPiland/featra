/**
 * The one time limit of every unit test, hook, `expect.poll` and Testing Library wait (BUG-28). Tests wait on the
 * condition, never for a fixed time, so this only ends a test that hangs, and names it.
 *
 * It is read from `FEATRA_HANG_GUARD_MS`, here and nowhere else:
 * - 120 s by default, so a focused run reports a hung test soon;
 * - 900 s from the pre-commit hook, for a loaded PC: there one git call took 77 s and the slowest test, which only
 *   starts git and `gh`, took 341 s (decisions.md, 2026-11-17);
 * - 300 s in CI, well inside the Gate job's own time limit, so a hang fails a named test and the report still uploads.
 *
 * Each project's config spreads `HANG_GUARD` into `test`: vitest gives projects neither the root config's limits nor
 * `--hookTimeout` from the command line. Test code reads the limit with `inject("hangGuardMs")`.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const HANG_GUARD_ENV = "FEATRA_HANG_GUARD_MS";
export const DEFAULT_HANG_GUARD_MS = 120_000;

declare module "vitest" {
  export interface ProvidedContext {
    /** The run's hang guard, in ms. */
    hangGuardMs: number;
  }
}

/** The limit `env` sets, or the default. Anything but a whole number of ms above zero is a mistake, and throws. */
export function hangGuardMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[HANG_GUARD_ENV];
  if (raw === undefined || raw === "") return DEFAULT_HANG_GUARD_MS;
  const ms = Number(raw);
  if (!Number.isSafeInteger(ms) || ms <= 0) throw new Error(`${HANG_GUARD_ENV} must be a number of ms, not "${raw}"`);
  return ms;
}

/** A project's `test` settings for a hang guard of `ms`. */
export function hangGuard(ms: number) {
  return {
    testTimeout: ms,
    hookTimeout: ms,
    expect: { poll: { timeout: ms } },
    provide: { hangGuardMs: ms },
  };
}

/** The setup file that names what a stopped test was waiting for (BUG-30). A project with its own lists it first. */
export const WAIT_REPORT_SETUP = join(dirname(fileURLToPath(import.meta.url)), "wait-report-setup.ts");

export const HANG_GUARD = { ...hangGuard(hangGuardMs()), setupFiles: [WAIT_REPORT_SETUP] };
