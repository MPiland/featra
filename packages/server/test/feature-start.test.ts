/**
 * STORY-52 AC1, AC3 and AC4: Start. Real git repository, scanner, draft writer, review and start; git runs the
 * repository's real hooks. The only fakes are the clock and, in one test, the write into the temporary worktree.
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { featureBranchName, parseCard, type Card } from "@featra/work-format";
import { cardViewIn } from "../src/card-actions.ts";
import { gitEnv } from "../src/git-run.ts";
import { card } from "./card-repo.ts";
import { lines } from "./draft-review-fixture.ts";
import { startFixture } from "./feature-start-fixture.ts";
import { withoutInheritedGitConfig } from "./git-config-env.ts";

withoutInheritedGitConfig();
const { f, s, git, branches, worktrees, tempLeft, approved } = startFixture();

const BRANCH = "feature/2-shaping";
const onBranch = (path: string) => git("show", `${BRANCH}:.featra/cards/${path}`);
const cardFile = async (id: string) => (await f.files()).find((n) => n.startsWith(`${id}-`)) as string;

const nothingChanged = async (before: { branches: string[]; head: string; status: string[] }) => {
  expect(branches()).toEqual(before.branches);
  expect(f.head()).toBe(before.head);
  expect(f.status()).toEqual(before.status);
  expect(worktrees()).toHaveLength(1);
  expect(await tempLeft()).toEqual([]);
};
const snapshot = () => ({ branches: branches(), head: f.head(), status: f.status() });

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

  it("leaves no temporary worktree or folder behind, and the repository's hooks run on the commit", async () => {
    const feature = await approved();
    const marker = join(f.repo.root, "hook-ran.txt").replaceAll("\\", "/");
    f.hook(`echo "$(git rev-parse --abbrev-ref HEAD)" > "${marker}"`);
    await s.starts.start(f.repo.main, feature, "user");
    expect(existsSync(marker)).toBe(true);
    expect(git("show", "-s", "--format=%s", BRANCH)).toContain("started");
    expect(worktrees()).toHaveLength(1);
    expect(await tempLeft()).toEqual([]);
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

describe("AC4: Start is refused with a clear message", () => {
  it("refuses a feature that is still a draft", async () => {
    const feature = await f.draft();
    const before = snapshot();
    await expect(s.starts.start(f.repo.main, feature, "user")).rejects.toThrow(
      `${feature} isn't approved yet. Approve it first.`,
    );
    await nothingChanged(before);
  });

  it("refuses a feature that is already started: a second start, even at the same moment, makes one branch", async () => {
    const feature = await approved();
    const [a, b] = await Promise.allSettled([
      s.starts.start(f.repo.main, feature, "user"),
      s.starts.start(f.repo.main, feature, "user"),
    ]);
    expect([a.status, b.status].toSorted()).toEqual(["fulfilled", "rejected"]);
    const refused = [a, b].find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((refused.reason as Error).message).toBe(`${feature} is already active.`);
    expect(git("rev-list", "--count", `main..${BRANCH}`)).toBe("1");
  });

  it("refuses a card that isn't a feature, and a card that isn't there", async () => {
    const feature = await approved();
    const story = ((await f.scanner.scan(f.repo.main))?.resolution.cards ?? []).find((c) => c.card.parent === feature);
    const id = story?.card.id as string;
    await expect(s.starts.start(f.repo.main, id, "user")).rejects.toThrow(`${id} isn't a feature.`);
    await expect(s.starts.start(f.repo.main, "FEAT-99", "user")).rejects.toThrow("That card is gone.");
    expect(branches()).toEqual(["main"]);
  });

  it("refuses when its branch already exists, with that name, and leaves it alone", async () => {
    const feature = await approved();
    git("branch", BRANCH);
    const tip = git("rev-parse", BRANCH);
    const before = snapshot();
    await expect(s.starts.start(f.repo.main, feature, "user")).rejects.toThrow(
      `${feature} already has a branch, ${BRANCH}.`,
    );
    expect(git("rev-parse", BRANCH)).toBe(tip);
    await nothingChanged(before);
  });

  it("refuses when the feature already has a branch under another name", async () => {
    const feature = await approved();
    git("branch", `feature/${feature.replace("FEAT-", "")}-older-name`);
    await expect(s.starts.start(f.repo.main, feature, "user")).rejects.toThrow(
      `${feature} already has a branch, feature/2-older-name.`,
    );
    expect(branches()).toEqual(["feature/2-older-name", "main"]);
  });

  it("refuses when the base branch can't be found, saying how to set it", async () => {
    const feature = await approved();
    writeFileSync(join(f.repo.main, ".featra", "config.yaml"), "version: 1\nbaseBranch: trunk\n");
    const before = snapshot();
    await expect(s.starts.start(f.repo.main, feature, "user")).rejects.toThrow(
      "There's no trunk branch. Create it, or set baseBranch in .featra/config.yaml.",
    );
    await nothingChanged(before);
  });

  it("refuses when the base branch doesn't have the feature approved: the file is not committed there", async () => {
    await approved();
    // A feature somebody marked approved by hand in main's working tree, never committed.
    const local: Card = { ...card("FEAT-7", "feature", null, "approved"), title: "By hand" };
    await f.repo.write(f.repo.main, local);
    const before = snapshot();
    await expect(s.starts.start(f.repo.main, "FEAT-7", "user")).rejects.toThrow(
      "FEAT-7 isn't approved on main yet. Commit it there first.",
    );
    await nothingChanged(before);
  });

  it("refuses a folder that isn't a Featra project in git", async () => {
    await expect(s.starts.start(f.repo.root, "FEAT-2", "user")).rejects.toThrow(
      "This folder isn't a Featra project in git.",
    );
  });
});

describe("all or nothing", () => {
  it("a failing hook leaves no branch, no worktree and no folder, and says nothing was changed", async () => {
    const feature = await approved();
    f.hook('echo "no commits today" >&2\nexit 1');
    const before = { branches: branches(), head: f.head(), status: f.status() };
    const err = await s.starts.start(f.repo.main, feature, "user").then(
      () => null,
      (e: Error) => e,
    );
    expect(err?.message).toContain(`Couldn't start ${feature}; nothing was changed.`);
    expect(err?.message).toContain("no commits today");
    expect(branches()).toEqual(before.branches);
    expect(f.head()).toBe(before.head);
    expect(f.status()).toEqual(before.status);
    expect(worktrees()).toHaveLength(1);
    expect(await tempLeft()).toEqual([]);
    // Nothing is stuck: with the hook gone, Start works.
    f.hook("exit 0");
    await expect(s.starts.start(f.repo.main, feature, "user")).resolves.toEqual({ branch: BRANCH });
  });

  it("a failed write into the worktree leaves nothing either", async () => {
    const feature = await approved();
    s.write = () => Promise.reject(new Error("disk full"));
    await expect(s.starts.start(f.repo.main, feature, "user")).rejects.toThrow("disk full");
    expect(branches()).toEqual(["main"]);
    expect(worktrees()).toHaveLength(1);
    expect(await tempLeft()).toEqual([]);
  });
});

describe("the card lane", () => {
  it("a start waits for the card write ahead of it, and one behind it waits for the start", async () => {
    const feature = await approved();
    const order: string[] = [];
    const gate = { open: () => {} };
    const held = f.lane.exclusive(
      () =>
        new Promise<void>((resolve) => {
          gate.open = resolve;
        }),
    );
    const start = s.starts.start(f.repo.main, feature, "user").then(() => order.push("start"));
    const after = f.lane.exclusive(() => Promise.resolve(order.push("next")));
    await new Promise((r) => setTimeout(r, 300));
    expect(order).toEqual([]);
    expect(branches()).toEqual(["main"]);
    gate.open();
    await Promise.all([held, start, after]);
    expect(order).toEqual(["start", "next"]);
  });
});
