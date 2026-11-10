/**
 * The shared setup for the STORY-52 Start tests: the draft review fixture (a real git repository, scanner, draft writer
 * and review), plus a feature start over the same scanner and lane. The only fakes are the clock and, where a test sets
 * `s.before`, a step run just before the branch is created.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, expect } from "vitest";
import { createFeatureStart, type FeatureStart } from "../src/feature-start.ts";
import { clock, draftFixture, lines } from "./draft-review-fixture.ts";

export const BRANCH = "feature/2-shaping";

export interface StartFixture {
  starts: FeatureStart;
  /** When set, runs just before the start creates the branch (to race it, or to fail it). */
  before: (() => Promise<void>) | null;
}

export function startFixture() {
  const f = draftFixture();
  const s = {} as StartFixture;
  beforeEach(() => {
    s.before = null;
    s.starts = createFeatureStart({
      scan: (dir) => f.scanner.scan(dir),
      now: () => clock,
      lane: f.lane,
      beforeBranch: () => s.before?.() ?? Promise.resolve(),
    });
  });
  const git = (...args: string[]) => f.repo.git(f.repo.main, ...args);
  const branches = () => lines(git("for-each-ref", "--format=%(refname:short)", "refs/heads")).toSorted();
  const worktrees = () => lines(git("worktree", "list", "--porcelain")).filter((l) => l.startsWith("worktree "));
  /** The temporary indexes a start leaves in the git folder: none, once it is done. */
  const indexesLeft = () => readdirSync(join(f.repo.main, ".git")).filter((n) => n.startsWith("featra-start-"));
  const onBranch = (path: string) => git("show", `${BRANCH}:.featra/cards/${path}`);
  const cardFile = async (id: string) => (await f.files()).find((n) => n.startsWith(`${id}-`)) as string;
  /** An approved feature in main, committed: a draft, approved. */
  async function approved() {
    const feature = await f.draft();
    await f.review.approve(f.repo.main, feature);
    return feature;
  }
  const snapshot = () => ({ branches: branches(), head: f.head(), status: f.status() });
  /** Git is exactly as the snapshot had it, with no worktree and no temporary index left. */
  const nothingChanged = (before: ReturnType<typeof snapshot>) => {
    expect(branches()).toEqual(before.branches);
    expect(f.head()).toBe(before.head);
    expect(f.status()).toEqual(before.status);
    expect(worktrees()).toHaveLength(1);
    expect(indexesLeft()).toEqual([]);
  };
  return { f, s, git, branches, worktrees, indexesLeft, onBranch, cardFile, approved, snapshot, nothingChanged };
}
