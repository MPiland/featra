/**
 * The shared setup for the STORY-52 Start tests: the draft review fixture (a real git repository, scanner, draft writer
 * and review), plus a feature start over the same scanner and lane. The only fakes are the clock and, where a test sets
 * `s.write`, the write into the temporary worktree.
 */
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach } from "vitest";
import { writeAtomic } from "../src/card-actions.ts";
import { createFeatureStart, type FeatureStart } from "../src/feature-start.ts";
import { clock, draftFixture, lines } from "./draft-review-fixture.ts";

export interface StartFixture {
  starts: FeatureStart;
  /** Where the start makes its temporary worktree: this folder is empty again when it is done. */
  temp: string;
  /** When set, replaces the write of the started feature into the temporary worktree. */
  write: ((file: string, text: string) => Promise<void>) | null;
}

export function startFixture() {
  const f = draftFixture();
  const s = {} as StartFixture;
  beforeEach(async () => {
    s.write = null;
    s.temp = join(f.repo.root, "start-temp");
    await mkdir(s.temp);
    s.starts = createFeatureStart({
      scan: (dir) => f.scanner.scan(dir),
      now: () => clock,
      lane: f.lane,
      tempRoot: s.temp,
      write: (file, text) => (s.write ?? writeAtomic)(file, text),
    });
  });
  const git = (...args: string[]) => f.repo.git(f.repo.main, ...args);
  const branches = () => lines(git("for-each-ref", "--format=%(refname:short)", "refs/heads")).toSorted();
  const worktrees = () => lines(git("worktree", "list", "--porcelain")).filter((l) => l.startsWith("worktree "));
  const tempLeft = () => readdir(s.temp);
  /** An approved feature in main, committed: a draft, approved. */
  async function approved() {
    const feature = await f.draft();
    await f.review.approve(f.repo.main, feature);
    return feature;
  }
  return { f, s, git, branches, worktrees, tempLeft, approved };
}
