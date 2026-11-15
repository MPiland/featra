import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type ElectronApplication } from "@playwright/test";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { draftInNewChat } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";

/**
 * STORY-10: a story's agent updates its own card and the user sees it on the Work list, marked Reported. The real app,
 * its real local server, the real MCP process and real git; only the platform and the agent are faked (agent.ts). The
 * fake agent, told to report by FEATRA_E2E_REPORT, writes one evidence file and calls the real `update_card` tool.
 */
test("a story session's update_card shows on its Work row at once, marked Reported, and is not committed", async () => {
  const userData = await tempUserData();
  const repo = await project();
  const bin = await standInClaude();
  let running: ElectronApplication | undefined;
  try {
    const { app, page } = await launch(userData.dir, {
      FEATRA_PROJECT_DIR: repo.dir,
      FEATRA_E2E_AGENT_SDK: FAKE_SDK,
      FEATRA_E2E_REPORT: "1",
      [PATH_KEY]: bin.path,
    });
    running = app;
    const draft = await draftInNewChat(page, "FEAT-2");
    await draft.getByRole("button", { name: "Approve", exact: true }).click();
    await expect.poll(() => git(repo.dir, "status", "--porcelain"), { timeout: 30_000 }).toBe("");
    await draft.getByRole("button", { name: "Start", exact: true }).click();
    await expect.poll(() => git(repo.dir, "branch", "--format=%(refname:short)")).toContain("feature/2-shaping");

    await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Work" }).click();
    await page.getByRole("button", { name: "Shaping", exact: true }).click();
    const row = page.getByRole("row", { name: /Draft a feature/ });
    await expect(row).not.toContainText("Reported");
    await row.getByRole("button", { name: /^Start STORY-\d+$/ }).click();

    // The agent's report arrives on the list live: its stage, its counts and the mark.
    await expect(row).toContainText("Reported");
    await expect(row).toContainText("In Review");
    await expect(row).toContainText("1 / 1");
    await expect(row).toContainText("1 / 2");
    // The other story, which nobody reported on, is not marked.
    await expect(page.getByRole("row", { name: /Review the draft/ })).not.toContainText("Reported");

    // It was written to the owner copy in the worktree and left there, with its evidence: nothing was committed.
    const branch = git(repo.dir, "branch", "--format=%(refname:short)")
      .split("\n")
      .find((b) => b.startsWith("featra/story-"));
    const id = `STORY-${/story-(\d+)-/.exec(branch ?? "")?.[1]}`;
    const folder = join(repo.dir, ".claude", "worktrees", `${id}-draft-a-feature`);
    expect(existsSync(join(folder, ".featra", "evidence", "FEAT-2", id, "draft-shows.txt"))).toBe(true);
    expect(git(folder, "ls-files", "--modified", "--others", "--exclude-standard")).toContain(
      `.featra/evidence/FEAT-2/${id}/draft-shows.txt`,
    );
    expect(git(repo.dir, "status", "--porcelain")).toBe("");
    await app.close();
  } finally {
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
});
