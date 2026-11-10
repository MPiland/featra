/**
 * STORY-51: which branch is main's checkout meant to be on. The user's `baseBranch` wins; without one, origin/HEAD,
 * then whichever of main and master exists. Real git repositories, scanner and review.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDraftReview } from "../src/draft-review.ts";
import { createDraftWriter } from "../src/draft-writer.ts";
import { createCardLane } from "../src/card-lane.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { cardRepo } from "./card-repo.ts";
import { clock, input, draftFixture } from "./draft-review-fixture.ts";

const f = draftFixture();

describe("a repository whose default branch is master", () => {
  it("approves a draft on master, with no config", async () => {
    f.repo.git(f.repo.main, "branch", "-m", "main", "master");
    const feature = await f.draft();
    await f.review.approve(f.repo.main, feature);
    expect((await f.read(feature)).status).toBe("approved");
    expect(f.repo.git(f.repo.main, "log", "-1", "--format=%s")).toBe(`${feature}: approved Shaping`);
    expect(f.status()).toEqual([]);
  });

  it("is refused on another branch, asking for master", async () => {
    f.repo.git(f.repo.main, "branch", "-m", "main", "master");
    const feature = await f.draft();
    f.repo.git(f.repo.main, "checkout", "-q", "-b", "other");
    await expect(f.review.approve(f.repo.main, feature)).rejects.toThrow(
      "Main isn't checked out on master. Switch it back to master, then try again.",
    );
  });
});

describe("the default branch order", () => {
  it("prefers origin/HEAD to main and master", async () => {
    f.repo.git(f.repo.main, "branch", "-m", "main", "trunk");
    f.repo.git(f.repo.main, "branch", "master");
    f.repo.git(f.repo.main, "update-ref", "refs/remotes/origin/trunk", "HEAD");
    f.repo.git(f.repo.main, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk");
    const feature = await f.draft();
    await f.review.approve(f.repo.main, feature);
    expect(f.repo.git(f.repo.main, "branch", "--show-current")).toBe("trunk");
    expect((await f.read(feature)).status).toBe("approved");
  });

  it("is overridden by baseBranch in the config", async () => {
    f.repo.git(f.repo.main, "branch", "-m", "main", "trunk");
    f.repo.git(f.repo.main, "branch", "main");
    f.repo.git(f.repo.main, "update-ref", "refs/remotes/origin/trunk", "HEAD");
    f.repo.git(f.repo.main, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk");
    const feature = await f.draft();
    writeFileSync(join(f.repo.main, ".featra", "config.yaml"), "version: 1\nbaseBranch: main\n");
    // The user said main; main's checkout is on trunk, so Approve asks for main.
    await expect(f.review.approve(f.repo.main, feature)).rejects.toThrow(
      "Main isn't checked out on main. Switch it back to main, then try again.",
    );
  });

  it("names a branch that doesn't exist, and how to fix it", async () => {
    const feature = await f.draft();
    writeFileSync(join(f.repo.main, ".featra", "config.yaml"), "version: 1\nbaseBranch: develop\n");
    await expect(f.review.approve(f.repo.main, feature)).rejects.toThrow(
      "There's no develop branch. Create it, or set baseBranch in .featra/config.yaml.",
    );
  });
});

describe("a repository with no commits", () => {
  it("refuses Approve, saying the branch has no commits, and writes nothing", async () => {
    const empty = await cardRepo();
    const scanner = createScanner(createRepoGit());
    try {
      const lane = createCardLane();
      const writer = createDraftWriter({ scan: scanner.scan, now: () => clock, lane });
      const review = createDraftReview({ scan: scanner.scan, now: () => clock, lane });
      const { feature } = await writer.draft(empty.main, "chat-1", input);
      await expect(review.approve(empty.main, feature)).rejects.toThrow(
        "main has no commits yet. Make a first commit, then try again.",
      );
      expect(empty.git(empty.main, "status", "--porcelain")).toContain("?? .featra/");
    } finally {
      await scanner.close();
      await empty.dispose();
    }
  });
});
