/**
 * Waits until `ok` holds, checking every 20 ms. It sets no deadline of its own: on a busy PC one git start stalled for
 * up to 77 s (BUG-28), so any fixed wait failed at random. A condition that never holds fails at the hang guard
 * (`tooling/hang-guard.ts`). Give `ms` only where a criterion promises a time.
 */
export async function until(ok: () => boolean, ms?: number): Promise<void> {
  const end = ms === undefined ? Infinity : Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`Not seen in ${ms} ms`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

/**
 * How long a test lets a check command it starts run: the hang guard's limit (`tooling/hang-guard.ts`, which this
 * package can't import). A fixed 30 s killed node starts that the load had stalled (BUG-28).
 */
export const TEST_PROCESS_LIMIT_MS = 900_000;
