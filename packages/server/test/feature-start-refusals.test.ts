/**
 * STORY-52 AC4 and all or nothing: what Start refuses, and that a start that fails (or loses a race) leaves nothing
 * behind and never touches a branch it didn't make. Real git repository, scanner and start; the only fake is the clock
 * and a step run just before the branch is created.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { featureBranchName, type Card } from "@featra/work-format";
import { card } from "./card-repo.ts";
import { BRANCH, startFixture } from "./feature-start-fixture.ts";
import { withoutInheritedGitConfig } from "./git-config-env.ts";

withoutInheritedGitConfig();
const { f, s, git, branches, worktrees, indexesLeft, approved, snapshot, nothingChanged } = startFixture();

describe("AC4: Start is refused with a clear message", () => {
  it("refuses a feature that is still a draft", async () => {
    const feature = await f.draft();
    const before = snapshot();
    await expect(s.starts.start(f.repo.main, feature, "user")).rejects.toThrow(
      `${feature} isn't approved yet. Approve it first.`,
    );
    nothingChanged(before);
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
    nothingChanged(before);
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
    nothingChanged(before);
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
    nothingChanged(before);
  });

  it("refuses a folder that isn't a Featra project in git", async () => {
    await expect(s.starts.start(f.repo.root, "FEAT-2", "user")).rejects.toThrow(
      "This folder isn't a Featra project in git.",
    );
  });
});

describe("a remote branch counts too", () => {
  it("refuses when a remote-tracking branch of the same name exists, naming it, and changes nothing", async () => {
    const feature = await approved();
    git("update-ref", `refs/remotes/origin/${BRANCH}`, "HEAD");
    const before = snapshot();
    await expect(s.starts.start(f.repo.main, feature, "user")).rejects.toThrow(
      `${feature} already has a remote branch, origin/${BRANCH}. Check it out instead.`,
    );
    nothingChanged(before);
  });

  it("refuses when the feature has a remote-tracking branch under another name", async () => {
    const feature = await approved();
    git("update-ref", "refs/remotes/upstream/feature/2-older-name", "HEAD");
    const before = snapshot();
    await expect(s.starts.start(f.repo.main, feature, "user")).rejects.toThrow(
      `${feature} already has a remote branch, upstream/feature/2-older-name. Check it out instead.`,
    );
    nothingChanged(before);
  });

  it("is not stopped by a remote branch of another feature", async () => {
    const feature = await approved();
    git("update-ref", "refs/remotes/origin/feature/21-other", "HEAD");
    await expect(s.starts.start(f.repo.main, feature, "user")).resolves.toEqual({ branch: BRANCH });
  });
});

describe("the branch is named from the base branch's copy", () => {
  it("an uncommitted title edit in main's working tree doesn't change the name", async () => {
    const feature = await approved();
    const file = join(
      f.repo.main,
      ".featra",
      "cards",
      (await f.files()).find((n) => n.startsWith(`${feature}-`)) ?? "",
    );
    writeFileSync(file, readFileSync(file, "utf8").replace("title: Shaping", "title: Something else entirely"));
    expect((await f.read(feature)).title).toBe("Something else entirely");
    const result = await s.starts.start(f.repo.main, feature, "user");
    expect(result.branch).toBe(featureBranchName({ id: feature, title: "Shaping" }));
    expect(branches()).toEqual([BRANCH, "main"]);
    // The edit stays in main's working tree, unstaged and as it was.
    expect((await f.read(feature)).title).toBe("Something else entirely");
  });
});

describe("all or nothing", () => {
  it("a step that fails before the branch is made leaves no branch, no worktree and no temporary index, and says nothing was changed", async () => {
    const feature = await approved();
    s.before = () => Promise.reject(new Error("disk full"));
    const before = snapshot();
    await expect(s.starts.start(f.repo.main, feature, "user")).rejects.toThrow(
      `Couldn't start ${feature}; nothing was changed. disk full`,
    );
    nothingChanged(before);
    // Nothing is stuck: without the failure, Start works.
    s.before = null;
    await expect(s.starts.start(f.repo.main, feature, "user")).resolves.toEqual({ branch: BRANCH });
  });

  it("a branch made by someone else at the last moment is refused and never deleted or moved", async () => {
    const feature = await approved();
    s.before = async () => {
      git("branch", BRANCH, "main");
      await Promise.resolve();
    };
    const theirs = git("rev-parse", "main");
    await expect(s.starts.start(f.repo.main, feature, "user")).rejects.toThrow(
      `${feature} already has a branch, ${BRANCH}.`,
    );
    expect(git("rev-parse", BRANCH)).toBe(theirs);
    expect(branches()).toEqual([BRANCH, "main"]);
    expect(worktrees()).toHaveLength(1);
    expect(indexesLeft()).toEqual([]);
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
