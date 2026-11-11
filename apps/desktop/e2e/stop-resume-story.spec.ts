import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type ElectronApplication } from "@playwright/test";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { draftInNewChat } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";

/**
 * STORY-53: the user watches a story's agent, stops it and resumes it. The real app, its real local server, the real MCP
 * process and real git; only the platform and the agent are faked (agent.ts, with a slow story turn that thinks first).
 * The session is read-only, Stop leaves the stage and the worktree as they are and marks the story Stopped, and Resume
 * goes on in the same session and clears the mark.
 */
test("Watch a story session, Stop it and Resume it: read-only, Stopped with the stage kept, then on in the same session", async () => {
  const userData = await tempUserData();
  const repo = await project();
  const bin = await standInClaude();
  let running: ElectronApplication | undefined;
  try {
    const { app, page } = await launch(userData.dir, {
      FEATRA_PROJECT_DIR: repo.dir,
      FEATRA_E2E_AGENT_SDK: FAKE_SDK,
      FEATRA_E2E_STORY_TURN: "slow",
      [PATH_KEY]: bin.path,
    });
    running = app;
    const draft = await draftInNewChat(page, "FEAT-2");
    await draft.getByRole("button", { name: "Approve", exact: true }).click();
    await expect.poll(() => git(repo.dir, "status", "--porcelain")).toBe("");
    await draft.getByRole("button", { name: "Start", exact: true }).click();
    await expect.poll(() => git(repo.dir, "branch", "--format=%(refname:short)")).toContain("feature/2-shaping");

    await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Work" }).click();
    await page.getByRole("button", { name: "Shaping", exact: true }).click();
    const row = page.getByRole("row", { name: /Draft a feature/ });
    await row.getByRole("button", { name: /^Start STORY-\d+$/ }).click();
    await expect
      .poll(() => git(repo.dir, "branch", "--format=%(refname:short)"))
      .toMatch(/featra\/story-\d+-draft-a-feature/);
    const branch = git(repo.dir, "branch", "--format=%(refname:short)")
      .split("\n")
      .find((b) => b.startsWith("featra/story-"));
    const id = `STORY-${/story-(\d+)-/.exec(branch ?? "")?.[1]}`;
    const folder = join(repo.dir, ".claude", "worktrees", `${id}-draft-a-feature`);

    // AC1: the session shows the live transcript with the agent's thinking, and has no composer.
    await row.getByRole("button", { name: `Open the session of ${id}` }).click();
    const log = page.getByRole("log", { name: "Chat" });
    await expect(log).toContainText("Starting the story.");
    await expect(log).toContainText("Thinking");
    await expect(log).toContainText("The worktree is clean.");
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveCount(0);

    // AC2: Stop, in the session, with no confirmation. The stage and the worktree stay; the story is Stopped.
    const session = page.getByRole("region", { name: "Developer" });
    const status = git(folder, "status", "--porcelain");
    await session.getByRole("button", { name: `Stop ${id}` }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(session.getByText("Stopped", { exact: true })).toBeVisible();
    await expect(log).toContainText("Stopped");
    expect(git(folder, "status", "--porcelain")).toBe(status);
    const file = git(folder, "ls-files", "--modified", "--others", "--exclude-standard")
      .split("\n")
      .find((l) => l.includes(id));
    const card = () => readFileSync(join(folder, file ?? ""), "utf8");
    await expect.poll(card).toMatch(/field: stopped/);
    expect(card()).toMatch(/status: In Progress/);

    // The Work row shows the mark too, with the stage kept.
    await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Work" }).click();
    // The list shows its features collapsed when it comes back.
    if ((await row.count()) === 0) await page.getByRole("button", { name: "Shaping", exact: true }).click();
    await expect(row.getByText("Stopped", { exact: true })).toBeVisible();
    await expect(row).toContainText("In Progress");

    // AC3: Resume, from the row. The same session goes on, and the mark is cleared.
    await row.getByRole("button", { name: `Resume ${id}` }).click();
    await expect(row.getByText("Stopped", { exact: true })).toHaveCount(0);
    await row.getByRole("button", { name: `Open the session of ${id}` }).click();
    await expect(log).toContainText("The worktree is clean.");
    await expect(log).toContainText("Continue from where you stopped.");
    await expect(log).toContainText("You said: Continue from where you stopped.");
    await expect.poll(card).toMatch(/from: stopped/);
    await app.close();
  } finally {
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
});
