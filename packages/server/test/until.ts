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
/**
 * How long a test waits for an answer that needs a full git scan: a new watch's first answer, or a draft door check with
 * no watch open (up to five serial git starts). STORY-3 times only the push after an edit (1 s), not these. A start took 9 to 15 s once the whole PC stalled, with Defender
 * scanning every git process and file (BUG-12); a late answer still fails the test, a missing one always did.
 */
export const FIRST_ANSWER_MS = 20_000;
