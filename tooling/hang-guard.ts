/**
 * The one time limit of every unit test, hook and `expect.poll` (BUG-28). Tests wait on the condition, never for a
 * fixed time, so this only ends a test that hangs. It is long because a busy PC is slow: under load one git call took
 * 77 s and the slowest test, which only starts git and `gh` and waits on nothing, took 341 s in the stress
 * runs (decisions.md, 2026-11-17). 900 s is over twice that; only a hung test reaches it.
 *
 * Each project's config spreads it into `test`: vitest gives projects neither the root config's limits nor
 * `--hookTimeout` from the command line.
 */
export const HANG_GUARD = {
  testTimeout: 900_000,
  hookTimeout: 900_000,
  expect: { poll: { timeout: 900_000 } },
} as const;
