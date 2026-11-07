import { harnessLeftoversAfter } from "./leftovers.ts";

/**
 * Fails the run if a process the harness started outlived it (BUG-4): every Featra launch and PowerShell helper
 * must end with its test, timed-out ones included. A few seconds' grace covers a helper still noticing its worker
 * is gone.
 */
export default async function globalTeardown() {
  const left = await harnessLeftoversAfter(10_000);
  if (left.length > 0) {
    throw new Error(`e2e: harness processes outlived the run (a teardown leak):\n  ${left.join("\n  ")}`);
  }
}
