import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { expect, test, type ElectronApplication } from "@playwright/test";
import { fakeGh } from "../../../packages/server/test/fake-gh.ts";
import { FAKE_SDK, PATH_KEY, standInClaude, tempDir } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { draftInNewChat, pane } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";

/**
 * STORY-58: abandoning a story from its card pane. The real app, its real local server and real git; only the
 * platform, the agent (agent.ts) and GitHub are faked: `gh` is a stand-in on the PATH (fake-gh.cjs) and the remote is
 * a bare repository on disk whose path names github.com. The story has a pushed branch and an open PR, then an
 * uncommitted file; Abandon warns of both, and Keep as Cancelled closes the PR, removes the worktree and branches, and
 * leaves the card Cancelled on the feature branch.
 */
test("Abandon a story: it warns, closes the PR, removes its worktree and branches, and keeps it as Cancelled", async () => {
  const userData = await tempUserData();
  const repo = await project("version: 1\nchecksWhere: ci\n");
  const github = await tempDir("featra-github-");
  const remote = join(github.dir, "github.com", "acme", "app.git").replace(/\\/g, "/");
  await mkdir(remote, { recursive: true });
  git(remote, "init", "-q", "--bare");
  git(repo.dir, "remote", "add", "origin", remote);
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

    // The story's work, committed in its worktree as its session would; it goes to review, so its PR opens.
    await writeFile(join(folder, "work.txt"), "the story's work\n");
    git(folder, "add", "work.txt");
    git(folder, "commit", "-q", "-m", "Draft a feature");
    await row.getByRole("button", { name: "Draft a feature" }).click();
    const card = pane(page, id);
    await card.getByRole("button", { name: "Status: In Progress" }).click();
    await page.getByRole("listbox", { name: "Status" }).getByRole("option", { name: "In Review" }).click();
    await expect(card.getByRole("region", { name: "PR" }).getByRole("link", { name: "#1", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect.poll(() => git(remote, "branch", "--list", branch)).not.toBe("");

    // AC1: an uncommitted file and the open PR are named before anything happens.
    await writeFile(join(folder, "notes.txt"), "not saved anywhere\n");
    await card.getByRole("button", { name: `Abandon ${id}` }).click();
    const ask = page.getByRole("alertdialog", { name: "Abandon" });
    await expect(ask).toContainText(`Abandon ${id}?`);
    await expect(ask.getByRole("listitem").filter({ hasText: "notes.txt" })).toBeVisible();
    await expect(ask.getByRole("listitem").filter({ hasText: "PR #1 closes" })).toBeVisible();
    await expect(ask).toContainText(`the branch ${branch} are removed, here and on origin.`);

    // AC2, AC3: kept as Cancelled; the PR closes, and the worktree and both branches go.
    await ask.getByRole("button", { name: "Keep as Cancelled" }).click();
    await expect(ask).toHaveCount(0, { timeout: 30_000 });
    await expect(card.getByRole("alert")).toHaveCount(0);
    await expect.poll(() => existsSync(folder), { timeout: 30_000 }).toBe(false);
    const closed = (await gh.calls()).find((c) => c.args.slice(0, 2).join(" ") === "pr close");
    expect(closed?.args).toEqual(["pr", "close", "https://github.com/acme/app/pull/1"]);
    expect((await gh.load()).prs[0]?.state).toBe("CLOSED");
    // The branches go after the folder, the local one and then origin's: wait for each (BUG-22).
    await expect.poll(() => git(repo.dir, "branch", "--list", branch), { timeout: 30_000 }).toBe("");
    await expect.poll(() => git(remote, "branch", "--list", branch), { timeout: 30_000 }).toBe("");
    expect(git(repo.dir, "log", "-1", "--format=%s", "feature/2-shaping")).toBe(`${id}: abandoned, kept as Cancelled`);
    await expect(row).toContainText("Cancelled", { timeout: 30_000 });
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
