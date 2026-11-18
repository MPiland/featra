/**
 * BUG-31: Approve while another git process holds the repository's index lock, as `git status` does for a moment when
 * it refreshes the index (an editor's, or an e2e test's poll). Real git and a real `.git/index.lock`; the only fakes are
 * the clock and how long the review waits between tries.
 */
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeAtomic } from "../src/card-actions.ts";
import { createDraftReview } from "../src/draft-review.ts";
import { clock, draftFixture } from "./draft-review-fixture.ts";

const f = draftFixture();

const lockFile = () => join(f.repo.main, ".git", "index.lock");
/** Another git process takes the index lock, as `git status` does while it writes the refreshed index. */
const takeLock = () => writeFileSync(lockFile(), "");
const releaseLock = () => rmSync(lockFile(), { force: true });
afterEach(releaseLock);

/**
 * A review on the fixture's repository that takes the lock just as it has written the approved feature, right before
 * it stages it: the moment a `git status` beside it took the lock in CI. The lock goes after `holdMs`, or stays when it
 * is null. Its log is `logged`; `waits` are its waits between tries.
 */
function reviewWith(holdMs: number | null, waits?: readonly number[]) {
  const logged: string[] = [];
  const review = createDraftReview({
    scan: f.scanner.scan,
    now: () => clock,
    lane: f.lane,
    log: (message) => logged.push(message),
    write: async (file, text) => {
      await writeAtomic(file, text);
      takeLock();
      if (holdMs !== null) setTimeout(releaseLock, holdMs);
    },
    ...(waits ? { lockWaits: waits } : {}),
  });
  return { review, logged };
}

describe("approving while another git holds the index lock (BUG-31)", () => {
  it("waits for the lock and commits the draft once it is free", async () => {
    const feature = await f.draft();
    const before = f.commitCount();
    // The other git lets go after 300 ms, as a `git status` on a slow runner might.
    const { review } = reviewWith(300);
    await review.approve(f.repo.main, feature);
    expect((await f.read(feature)).status).toBe("approved");
    expect(f.commitCount()).toBe(before + 1);
    expect(f.repo.git(f.repo.main, "log", "-1", "--format=%s")).toBe(`${feature}: approved Shaping`);
    expect(f.status()).toEqual([]);
  });

  it("fails with git's own words when the lock stays, puts the draft back, says nothing was changed, and logs it", async () => {
    const feature = await f.draft();
    const at = f.head();
    const { review, logged } = reviewWith(null, [10, 10]);
    const failure = await review.approve(f.repo.main, feature).then(
      () => null,
      (e: Error) => e,
    );
    expect(existsSync(lockFile())).toBe(true);
    releaseLock();
    expect(failure?.message).toMatch(new RegExp(`^Couldn't approve ${feature}; nothing was changed\\. `));
    expect(failure?.message).toMatch(/index\.lock': File exists/);
    expect(f.head()).toBe(at);
    expect((await f.read(feature)).status).toBe("draft");
    expect(f.status().every((l) => l.startsWith("?? "))).toBe(true);
    expect(logged).toEqual([`Approve ${feature} failed: ${failure?.message ?? ""}`]);
  });
});
