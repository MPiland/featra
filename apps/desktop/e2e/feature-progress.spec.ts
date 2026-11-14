import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type ElectronApplication } from "@playwright/test";
import { newCard, serializeCard } from "@featra/work-format";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { draftInNewChat } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";

/**
 * STORY-24: a feature's progress pane, from the Dev Lead chat that drafted it and from its row in Work. The real app,
 * its real local server, the real MCP process and real git; only the platform and the agent are faked (agent.ts). A
 * story is added on the feature's branch as a session would add it, in another worktree, and the open pane follows.
 */
test("Feature progress opens beside the chat and in Work, follows the cards live, and opens a story's chat or card", async () => {
  const userData = await tempUserData();
  const repo = await project();
  const bin = await standInClaude();
  let running: ElectronApplication | undefined;
  try {
    const { app, page } = await launch(userData.dir, {
      FEATRA_PROJECT_DIR: repo.dir,
      FEATRA_E2E_AGENT_SDK: FAKE_SDK,
      [PATH_KEY]: bin.path,
    });
    running = app;
    const draft = await draftInNewChat(page, "FEAT-2");
    await draft.getByRole("button", { name: "Approve", exact: true }).click();
    await expect.poll(() => git(repo.dir, "status", "--porcelain")).toBe("");
    await draft.getByRole("button", { name: "Start", exact: true }).click();
    await expect.poll(() => git(repo.dir, "branch", "--format=%(refname:short)")).toContain("feature/2-shaping");

    // AC1: the chat that drafted the feature has Feature progress; it opens the pane docked on the right.
    await page.getByRole("button", { name: "Feature progress", exact: true }).click();
    const progress = page.getByRole("complementary", { name: "FEAT-2 progress" });
    await expect(progress).toBeVisible();
    await expect(page.getByRole("complementary", { name: "FEAT-2 card" })).toHaveCount(0);
    // AC3: its counts, branch and stories, from the Work list.
    await expect(progress).toContainText("0 of 2 stories done");
    await expect(progress.locator(".fp-facts")).toContainText("feature/2-shaping");
    const stories = progress.getByRole("list", { name: "Stories" });
    await expect(stories.getByRole("button", { name: /Draft a feature/ })).toBeVisible();
    await expect(stories.getByRole("button", { name: /Review the draft/ })).toBeVisible();

    // AC5: a story added on the feature's branch shows in the open pane, with no agent turn.
    const side = join(repo.dir, "..", `${repo.dir.split(/[\\/]/).at(-1)}-side`);
    git(repo.dir, "worktree", "add", "-q", side, "feature/2-shaping");
    try {
      const at = new Date(Date.now() + 1000).toISOString();
      const added = newCard(
        { id: "STORY-3", type: "story", title: "Share the draft", status: "New", parent: "FEAT-2", origin: "added" },
        "user",
        at,
      );
      await writeFile(join(side, ".featra", "cards", "STORY-3-share-the-draft.md"), serializeCard(added), "utf8");
      git(side, "add", "-A");
      git(side, "commit", "-q", "-m", "STORY-3: added");
    } finally {
      git(repo.dir, "worktree", "remove", "--force", side);
    }
    await expect(stories.getByRole("button", { name: "STORY-3 Share the draft" })).toBeVisible({ timeout: 30_000 });
    await expect(progress).toContainText("+1 added: 1 story");
    await expect(progress).toContainText("0 of 3 stories done");

    // AC4: a story with no chat opens its card, which leads back to the pane; Escape closes it.
    await stories.getByRole("button", { name: "STORY-3 Share the draft" }).click();
    const card = page.getByRole("complementary", { name: "STORY-3 card" });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Back to FEAT-2 progress" }).click();
    await expect(progress).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(progress).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Feature progress", exact: true })).toBeFocused();

    // AC2: the feature's row in Work opens the same pane.
    await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Work" }).click();
    await page.getByRole("button", { name: "Feature progress of FEAT-2" }).click();
    await expect(progress).toBeVisible();
    await expect(progress).toContainText("0 of 3 stories done");

    // AC4: once a story has a session, the pane opens its chat.
    await page.getByRole("button", { name: "Shaping", exact: true }).click();
    const row = page.getByRole("row", { name: /Draft a feature/ });
    await row.getByRole("button", { name: /^Start STORY-\d+$/ }).click();
    await expect(row.getByRole("button", { name: /^Open the session of STORY-\d+$/ })).toBeVisible();
    await expect(progress).toContainText("In Progress");
    await stories.getByRole("button", { name: /Draft a feature/ }).click();
    await expect(page.getByRole("log", { name: "Chat" })).toContainText("You are working on");
    await app.close();
  } finally {
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
});
