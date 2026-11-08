/** Waits until `ok` holds, checking every 20 ms: a full git rescan takes up to about 3 s on a loaded PC. */
export async function until(ok: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`Not seen in ${ms} ms`);
    await new Promise((r) => setTimeout(r, 20));
  }
}
