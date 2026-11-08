/** Waits until `ok` holds, checking every 20 ms: a full git rescan takes up to about 3 s on a loaded PC. */
export async function until(ok: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`Not seen in ${ms} ms`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

/**
 * How long a test waits to see the watch ask git again. No criterion promises a time for it, and a missed event never
 * asks, so the test still fails. But now and then the whole PC stalls: every git start took about 2.8 s at once,
 * and a rescan took 5.6 s (BUG-6).
 */
export const GIT_ASKED_MS = 20_000;
