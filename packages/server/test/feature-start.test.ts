/**
 * STORY-52 AC1 and AC3: Start. Real git repository, scanner, draft writer, review and start; the only fake is the
 * clock. Start runs no hook and builds its commit without touching main's checkout. The refusals are in
 * feature-start-refusals.test.ts.
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { featureBranchName, parseCard } from "@featra/work-format";
import { cardViewIn } from "../src/card-actions.ts";
import { gitEnv } from "../src/git-run.ts";
import { lines } from "./draft-review-fixture.ts";
import { BRANCH, startFixture } from "./feature-start-fixture.ts";
import { withoutInheritedGitConfig } from "./git-config-env.ts";

withoutInheritedGitConfig();
const { f, s, git, branches, worktrees, indexesLeft, onBranch, cardFile, approved } = startFixture();

describe("AC1: Start creates the feature's branch and the feature is active on it", () => {
  it("makes feature/N-slug from the base branch, one commit on top, and answers with it", async () => {
    const feature = await approved();
    const base = git("rev-parse", "main");
    const result = await s.starts.start(f.repo.main, feature, "user");
    expect(result).toEqual({ branch: BRANCH });
    expect(result.branch).toBe(featureBranchName({ id: feature, title: "Shaping" }));
    expect(branches()).toEqual([BRANCH, "main"]);
    expect(git("rev-parse", `${BRANCH}~1`)).toBe(base);
    expect(git("rev-list", "--count", `main..${BRANCH}`)).toBe("1");
    expect(git("log", "-1", "--format=%s", BRANCH)).toBe(`${feature}: started Shaping`);
    // The one commit changes the feature's card and nothing else.
    expect(lines(git("show", "--name-only", "--format=", BRANCH))).toEqual([
      `.featra/cards/${await cardFile(feature)}`,
    ]);
  });

  it("the feature is active on the branch, with a status event by user, and main's own commit is untouched", async () => {
    const feature = await approved();
    const base = git("rev-parse", "main");
    await s.starts.start(f.repo.main, feature, "user");
    const started = parseCard(onBranch(await cardFile(feature)));
    expect(started.status).toBe("active");
    expect(started.history.at(-1)).toEqual({
      at: "2026-11-10T09:30:00Z",
      field: "status",
      from: "approved",
      to: "active",
      by: "user",
    });
    expect(started.extra["baseline"]).toBeDefined();
    expect(git("rev-parse", "main")).toBe(base);
  });

  it("does not change main's checkout: same branch, same HEAD, and staged, unstaged and untracked files as they were", async () => {
    const feature = await approved();
    writeFileSync(join(f.repo.main, "staged.txt"), "staged\n");
    git("add", "staged.txt");
    writeFileSync(join(f.repo.main, "README.md"), "hello, edited\n");
    writeFileSync(join(f.repo.main, "loose.txt"), "loose\n");
    const before = { head: f.head(), status: f.status(), index: git("ls-files", "-s"), cards: await f.files() };
    await s.starts.start(f.repo.main, feature, "user");
    expect(git("symbolic-ref", "HEAD")).toBe("refs/heads/main");
    expect(f.head()).toBe(before.head);
    expect(f.status()).toEqual(before.status);
    expect(git("ls-files", "-s")).toBe(before.index);
    expect(await f.files()).toEqual(before.cards);
    expect((await f.read(feature)).status).toBe("approved");
  });

  it("works while main's checkout is on another branch, and never pushes", async () => {
    const feature = await approved();
    git("checkout", "-q", "-b", "scratch");
    const remote = join(f.repo.root, "remote.git");
    execFileSync("git", ["init", "-q", "--bare", remote], { env: gitEnv() });
    git("remote", "add", "origin", remote);
    await s.starts.start(f.repo.main, feature, "user");
    expect(git("symbolic-ref", "HEAD")).toBe("refs/heads/scratch");
    expect(branches()).toContain(BRANCH);
    expect(execFileSync("git", ["ls-remote", remote], { encoding: "utf8", env: gitEnv() })).toBe("");
  });

  it("makes no worktree and no temporary folder, and runs no hook: a failing pre-commit hook doesn't stop it, and main's checkout is untouched", async () => {
    const feature = await approved();
    const marker = join(f.repo.root, "hook-ran.txt").replaceAll("\\", "/");
    f.hook(`echo ran > "${marker}"\nexit 1`);
    const before = { head: f.head(), status: f.status(), index: git("ls-files", "-s") };
    await s.starts.start(f.repo.main, feature, "user");
    expect(existsSync(marker)).toBe(false);
    expect(git("show", "-s", "--format=%s", BRANCH)).toBe(`${feature}: started Shaping`);
    expect(worktrees()).toHaveLength(1);
    expect(indexesLeft()).toEqual([]);
    expect(f.head()).toBe(before.head);
    expect(f.status()).toEqual(before.status);
    expect(git("ls-files", "-s")).toBe(before.index);
  });
});

describe("AC3: after Start the feature and its stories are read from the feature branch", () => {
  it("the branch owns the feature and each of its stories, and main's approved copy isn't shown", async () => {
    const feature = await approved();
    const before = await f.scanner.scan(f.repo.main);
    const stories = (before?.resolution.cards ?? []).filter((c) => c.card.parent === feature).map((c) => c.card.id);
    expect(stories).toHaveLength(2);
    expect(before?.resolution.cards.find((c) => c.card.id === feature)?.owner.kind).toBe("main");

    await s.starts.start(f.repo.main, feature, "user");
    const scan = await f.scanner.scan(f.repo.main);
    const shown = scan?.resolution.cards ?? [];
    for (const id of [feature, ...stories]) {
      const c = shown.find((x) => x.card.id === id);
      expect(c?.owner).toEqual({ kind: "feature", branch: BRANCH });
      expect(c?.shownFrom).toEqual({ kind: "feature", branch: BRANCH });
    }
    // The card shown is the branch's: active, not main's approved copy, which is still on disk.
    expect(shown.find((x) => x.card.id === feature)?.card.status).toBe("active");
    expect((await f.read(feature)).status).toBe("approved");
    const row = scan?.list.epics.flatMap((e) => e.features).find((r) => r.id === feature);
    expect(row?.status).toBe("active");
    expect(row?.stories.map((r) => r.id)).toEqual(stories);
    expect(scan?.resolution.stale).toEqual([]);
    expect(scan?.list.problems).toEqual([]);
  });

  it("the card pane reads the branch's copy, and says to check the branch out to edit it", async () => {
    const feature = await approved();
    await s.starts.start(f.repo.main, feature, "user");
    const scan = await f.scanner.scan(f.repo.main);
    const view = cardViewIn(scan, feature);
    expect(view?.status).toBe("active");
    expect(view?.owner).toBe(`feature branch ${BRANCH}`);
    expect(view?.readOnly).toBe(`Check out ${BRANCH} to edit it.`);
    expect(view?.startable).toBeUndefined();
  });
});
