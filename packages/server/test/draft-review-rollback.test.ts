/**
 * STORY-51: Approve is all or nothing. Files go back byte for byte and the index entries of the draft's paths as they
 * were; if putting things back fails too, the message says so. Real git and hooks.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lines, draftFixture } from "./draft-review-fixture.ts";

const f = draftFixture();

/**
 * The pre-commit hook runs these tests under `git -c core.hooksPath=.githooks`, and the product's git keeps that
 * environment config (ADR 0023), so the repo's own hook would be skipped. This file's tests that need the repo's hook
 * to run take that config out of the process environment, and put it back.
 */
const CONFIG = ["GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT"] as const;
let savedConfig: Record<string, string | undefined>;
beforeEach(() => {
  savedConfig = Object.fromEntries(CONFIG.map((k) => [k, process.env[k]]));
  for (const k of CONFIG) delete process.env[k];
});
afterEach(() => {
  for (const k of CONFIG) {
    if (savedConfig[k] === undefined) delete process.env[k];
    else process.env[k] = savedConfig[k];
  }
});

const snapshot = async () => {
  const names = (await readdir(f.cardsDir())).toSorted();
  return new Map(await Promise.all(names.map(async (n) => [n, await readFile(join(f.cardsDir(), n))] as const)));
};

describe("a failed approve puts everything back", () => {
  it("runs the repo's hooks, and a failing hook rolls everything back: files exactly as before, no commit, nothing staged", async () => {
    const { feature, two } = await f.draftWithCancelled();
    const names = (await readdir(f.cardsDir())).toSorted();
    const bytes = await snapshot();
    const at = f.head();
    f.hook("echo 'hook says no' >&2\nexit 1");
    await expect(f.review.approve(f.repo.main, feature)).rejects.toThrow(/hook says no/);
    expect(f.head()).toBe(at);
    expect((await readdir(f.cardsDir())).toSorted()).toEqual(names);
    for (const [name, content] of bytes) expect((await readFile(join(f.cardsDir(), name))).equals(content)).toBe(true);
    expect((await f.read(feature)).status).toBe("draft");
    expect((await f.read(two)).status).toBe("Cancelled");
    expect(lines(f.repo.git(f.repo.main, "diff", "--cached", "--name-only"))).toEqual([]);
    expect(f.status().every((l) => l.startsWith("?? "))).toBe(true);
    // The hook is the only thing in the way: with it gone, the same draft approves.
    f.hook("exit 0");
    await f.review.approve(f.repo.main, feature);
    expect((await f.read(feature)).status).toBe("approved");
  }, 60_000);

  it("keeps a path the user had already staged staged, as it was, after a failed commit", async () => {
    const feature = await f.draft();
    const path = `.featra/cards/${(await f.files()).find((n) => n.startsWith(feature))}`;
    f.repo.git(f.repo.main, "add", path);
    const staged = f.repo.git(f.repo.main, "ls-files", "-s", "--", path);
    const state = f.status();
    expect(state).toContain(`A  ${path}`);
    const bytes = await snapshot();
    f.hook("echo 'hook says no' >&2\nexit 1");
    await expect(f.review.approve(f.repo.main, feature)).rejects.toThrow(/hook says no/);
    expect(f.repo.git(f.repo.main, "ls-files", "-s", "--", path)).toBe(staged);
    expect(f.status().toSorted()).toEqual(state.toSorted());
    for (const [name, content] of await snapshot()) expect(content.equals(bytes.get(name) as Buffer)).toBe(true);
    expect((await f.read(feature)).status).toBe("draft");
  });

  it("rolls back when the feature can't be written: nothing is deleted or committed", async () => {
    const { feature, two } = await f.draftWithCancelled();
    const at = f.head();
    f.diskWrite = async () => {
      throw new Error("disk full");
    };
    await expect(f.review.approve(f.repo.main, feature)).rejects.toThrow(/disk full/);
    expect(f.head()).toBe(at);
    expect((await f.read(feature)).status).toBe("draft");
    expect((await f.read(two)).status).toBe("Cancelled");
  });

  it("says so when putting the index back fails too, rather than claiming nothing was changed", async () => {
    const { feature } = await f.draftWithCancelled();
    const bytes = await snapshot();
    // The hook fails the commit and breaks the branch, so the reset that follows can't read HEAD.
    f.hook("echo 'hook says no' >&2\necho 0000000000000000000000000000000000000001 > .git/refs/heads/main\nexit 1");
    const failure = await f.review.approve(f.repo.main, feature).then(
      () => null,
      (e: Error) => e,
    );
    expect(failure?.message).toMatch(/putting things back failed too, so check git status/);
    expect(failure?.message).toMatch(/hook says no/);
    expect(failure?.message).toMatch(/Restoring the index failed: git reset failed/);
    expect(failure?.message).not.toMatch(/nothing was changed/);
    // The files were still put back, byte for byte.
    for (const [name, content] of await snapshot()) expect(content.equals(bytes.get(name) as Buffer)).toBe(true);
  });
});

describe("approve reads the draft as it is on disk", () => {
  it("writes the approved feature from the bytes on disk, not from a scan that went stale", async () => {
    const feature = await f.draft();
    const name = (await f.files()).find((n) => n.startsWith(feature)) as string;
    const file = join(f.cardsDir(), name);
    f.scan = async (dir) => {
      const scan = await f.scanner.scan(dir);
      // The user edits the feature's text after the scan and before the approve reads it.
      await writeFile(file, (await readFile(file, "utf8")).replace("Talk a feature through.", "Edited by hand."));
      return scan;
    };
    await f.review.approve(f.repo.main, feature);
    expect(await readFile(file, "utf8")).toContain("Edited by hand.");
    expect(f.repo.git(f.repo.main, "show", `HEAD:.featra/cards/${name}`)).toContain("Edited by hand.");
    expect((await f.read(feature)).status).toBe("approved");
  });

  it("refuses, writing nothing, when a card changes after it was read and before it is written", async () => {
    const feature = await f.draft();
    const name = (await f.files()).find((n) => n.startsWith(feature)) as string;
    const file = join(f.cardsDir(), name);
    const at = f.head();
    f.onNow = () => writeFileSync(file, `${readFileSync(file, "utf8")}\nEdited while approving.\n`);
    await expect(f.review.approve(f.repo.main, feature)).rejects.toThrow(
      `${feature} changed while it was being approved.`,
    );
    expect(f.head()).toBe(at);
    expect(await readFile(file, "utf8")).toContain("Edited while approving.");
    expect((await f.read(feature)).status).toBe("draft");
    expect(f.status().every((l) => l.startsWith("?? "))).toBe(true);
  });
});
