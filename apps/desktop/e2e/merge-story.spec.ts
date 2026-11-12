import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { expect, test, type ElectronApplication } from "@playwright/test";
import { checkRun, fakeGh } from "../../../packages/server/test/fake-gh.ts";
import { FAKE_SDK, PATH_KEY, standInClaude, tempDir } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { draftInNewChat, pane } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";

/**
 * STORY-12: merging a Verified story into its feature. The real app, its real local server and real git; only the
 * platform, the agent (agent.ts) and GitHub are faked: `gh` is a stand-in on the PATH (fake-gh.cjs) and the remote is
 * a bare repository on disk whose path names github.com. The story's work is committed in its worktree, it goes to
 * review (its PR opens), CI's checks pass and make it Verified, and Merge in its Work row merges the PR with a merge
 * commit. The worktree and the story's local and remote branches go; the row says Merged.
 */
test("Merge a Verified story: its PR merges with a merge commit, and its worktree and branches go", async () => {
  const userData = await tempUserData();
  const repo = await project("version: 1\nchecksWhere: ci\n");
  const github = await tempDir("featra-github-");
  const remote = join(github.dir, "github.com", "acme", "app.git").replace(/\\/g, "/");
  await mkdir(remote, { recursive: true });
  git(remote, "init", "-q", "--bare");
  git(repo.dir, "remote", "add", "origin", remote);
  // GitHub's copy is the bare remote, so a PR's head commit is its branch's tip there, and a merge happens there.
  const gh = await fakeGh({ remote });
  const bin = await standInClaude();
  let running: ElectronApplication | undefined;
  try {
    const { app, page } = await launch(userData.dir, {
      FEATRA_PROJECT_DIR: repo.dir,
      FEATRA_E2E_AGENT_SDK: FAKE_SDK,
      // The stand-in gh comes first, so the real one and its login are never used.
      [PATH_KEY]: [gh.bin, bin.path].join(delimiter),
    });
    running = app;
    const nav = page.getByRole("navigation", { name: "Featra" });

    const draft = await draftInNewChat(page, "FEAT-2");
    await draft.getByRole("button", { name: "Approve", exact: true }).click();
    await expect.poll(() => git(repo.dir, "status", "--porcelain")).toBe("");
    await draft.getByRole("button", { name: "Start", exact: true }).click();
    await expect.poll(() => git(repo.dir, "branch", "--format=%(refname:short)")).toContain("feature/2-shaping");

    await nav.getByRole("button", { name: "Work" }).click();
    await page.getByRole("button", { name: "Shaping", exact: true }).click();
    const row = page.getByRole("row", { name: /Draft a feature/ });
    await row.getByRole("button", { name: /^Start STORY-\d+$/ }).click();
    await expect
      .poll(() => git(repo.dir, "branch", "--format=%(refname:short)"))
      .toMatch(/featra\/story-\d+-draft-a-feature/);
    const branch =
      git(repo.dir, "branch", "--format=%(refname:short)")
        .split("\n")
        .find((b) => b.startsWith("featra/story-")) ?? "";
    const id = `STORY-${/story-(\d+)-/.exec(branch)?.[1]}`;
    const folder = join(repo.dir, ".claude", "worktrees", `${id}-draft-a-feature`);
    const merge = row.getByRole("button", { name: `Merge ${id}` });

    // The story's work, committed in its worktree as its session would.
    await writeFile(join(folder, "work.txt"), "the story's work\n");
    git(folder, "add", "work.txt");
    git(folder, "commit", "-q", "-m", "Draft a feature");

    // It goes to review: its branch is pushed and its PR opened. Not Verified yet, so no Merge.
    await row.getByRole("button", { name: "Draft a feature" }).click();
    const card = pane(page, id);
    await card.getByRole("button", { name: "Status: In Progress" }).click();
    await page.getByRole("listbox", { name: "Status" }).getByRole("option", { name: "In Review" }).click();
    const section = card.getByRole("region", { name: "PR" });
    await expect(section.getByRole("link", { name: "#1", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(merge).toHaveCount(0);

    // AC1: CI's checks pass, the story is Verified, and Merge is offered in its row and card pane, without Accept.
    await gh.change((s) => {
      for (const pr of s.prs) pr.checks = [checkRun("SUCCESS")];
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(card.getByRole("list", { name: "Evidence" })).toContainText("Verified: yes", { timeout: 30_000 });
    await expect(card.getByRole("button", { name: `Merge ${id}` })).toBeVisible();
    const story = git(repo.dir, "rev-parse", branch);
    const base = git(remote, "rev-parse", "feature/2-shaping");

    // AC2: Merge merges the PR on GitHub with a merge commit, at the head Featra checked.
    await merge.click();
    await expect(row).toContainText("Merged", { timeout: 30_000 });
    await expect(row.getByRole("alert")).toHaveCount(0);
    const merged = (await gh.calls()).find((c) => c.args.slice(0, 2).join(" ") === "pr merge");
    expect(merged?.args).toEqual([
      "pr",
      "merge",
      "https://github.com/acme/app/pull/1",
      "--merge",
      "--match-head-commit",
      story,
    ]);
    expect((await gh.load()).prs[0]?.state).toBe("MERGED");
    expect(git(remote, "log", "-1", "--format=%P", "feature/2-shaping").split(" ")).toEqual([base, story]);

    // AC5: the worktree and the story's local and remote branches are gone; the feature branch has the merged card.
    await expect.poll(() => existsSync(folder)).toBe(false);
    expect(git(repo.dir, "branch", "--list", branch)).toBe("");
    expect(git(remote, "branch", "--list", branch)).toBe("");
    expect(git(repo.dir, "log", "-1", "--format=%s", "feature/2-shaping")).toBe(`${id}: merged into feature/2-shaping`);
    await expect(merge).toHaveCount(0);

    // The session stays, as its transcript.
    await row.getByRole("button", { name: `Open the session of ${id}` }).click();
    await expect(page.getByRole("region", { name: "Developer" })).toBeVisible();
    await app.close();
  } finally {
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await github.dispose();
    await gh.dispose();
    await bin.dispose();
  }
});
