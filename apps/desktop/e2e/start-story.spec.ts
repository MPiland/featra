import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type ElectronApplication } from "@playwright/test";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { draftInNewChat } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";

/**
 * STORY-9: the user starts a story of a started feature from its row in Work. The real app, its real local server, the
 * real MCP process and real git; only the platform and the agent are faked (agent.ts), as in start-feature.spec.ts.
 * The session appears nested in the sidebar, in its own worktree, and the row shows its agent and model.
 */
test("Start on a story row makes its worktree, nests the session in the sidebar, and the row shows its agent and model", async () => {
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

    // The story's row offers Start, with no confirmation.
    await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Work" }).click();
    await page.getByRole("button", { name: "Shaping", exact: true }).click();
    const row = page.getByRole("row", { name: /Draft a feature/ });
    const start = row.getByRole("button", { name: /^Start STORY-\d+$/ });
    await expect(start).toBeVisible();
    await start.click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    // The worktree is where Claude keeps them, on the story's own branch, cut from the feature's.
    await expect
      .poll(() => git(repo.dir, "branch", "--format=%(refname:short)"))
      .toMatch(/featra\/story-\d+-draft-a-feature/);
    const branch = git(repo.dir, "branch", "--format=%(refname:short)")
      .split("\n")
      .find((b) => b.startsWith("featra/story-"));
    expect(branch).toBeDefined();
    const id = `STORY-${/story-(\d+)-/.exec(branch ?? "")?.[1]}`;
    const folder = join(repo.dir, ".claude", "worktrees", `${id}-draft-a-feature`);
    expect(existsSync(folder)).toBe(true);
    expect(git(repo.dir, "status", "--porcelain")).toBe("");

    // AC4: the row shows the agent and model with a link to the session, and the session is in the sidebar.
    await expect(row).toContainText("claude");
    await expect(row.getByRole("button", { name: `Open the session of ${id}` })).toBeVisible();
    await expect(row.getByRole("button", { name: /^Start STORY-/ })).toHaveCount(0);
    const chats = page.getByRole("region", { name: "Chats" });
    await expect(chats.getByRole("list", { name: /^Story sessions of / })).toContainText("Draft a feature");

    // The card in the worktree is the owner's copy, In Progress and uncommitted.
    const file = git(folder, "ls-files", "--modified", "--others", "--exclude-standard");
    expect(file).toContain(id);

    // The link opens the session, whose first message is the card.
    await row.getByRole("button", { name: `Open the session of ${id}` }).click();
    await expect(page.getByRole("log", { name: "Chat" })).toContainText(`You are working on ${id}`);
    await app.close();
  } finally {
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
});
