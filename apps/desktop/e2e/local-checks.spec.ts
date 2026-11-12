import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type ElectronApplication } from "@playwright/test";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { draftInNewChat, pane } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";

/**
 * STORY-56: checks run on this computer. The real app, its real local server, real git and a real child process; only
 * the platform and the agent are faked (agent.ts). The user confirms a check command in Project settings, moves the
 * story to In Review, and sees the checks fail with their output; once the failure is fixed, Re-run passes and the
 * story is Verified.
 */
const CHECK =
  "node -e \"if(require('fs').existsSync('ok.txt'))process.exit(0);console.log('missing ok.txt');process.exit(1)\"";

test("Confirm a check command, move a story to review: it fails with its output, then Re-run passes and Verifies it", async () => {
  const userData = await tempUserData();
  const repo = await project("version: 1\nchecksWhere: local\n");
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

    const nav = page.getByRole("navigation", { name: "Featra" });
    await nav.getByRole("button", { name: "Work" }).click();
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

    // AC2: the user confirms the check command in Project settings.
    await nav.getByRole("button", { name: "Settings" }).click();
    await page
      .getByRole("navigation", { name: "Settings pages" })
      .getByRole("list", { name: "Project" })
      .getByRole("button", { name: "Workflow" })
      .click();
    const checks = page.getByRole("region", { name: "Checks" });
    await expect(checks.getByRole("radio", { name: "This computer" })).toBeChecked();
    await checks.getByRole("textbox", { name: "Check command" }).fill(CHECK);
    await checks.getByRole("button", { name: "Save" }).click();
    await expect(checks.getByText("Saved")).toBeVisible();

    // AC3, AC4: moving the story to In Review runs the check in its worktree; it fails and the card shows why.
    await nav.getByRole("button", { name: "Work" }).click();
    await page.getByRole("button", { name: "Shaping", exact: true }).click();
    await row.getByRole("button", { name: "Draft a feature" }).click();
    const card = pane(page, id);
    await card.getByRole("button", { name: "Status: In Progress" }).click();
    await page.getByRole("listbox", { name: "Status" }).getByRole("option", { name: "In Review" }).click();
    const section = card.getByRole("region", { name: "Checks" });
    await expect(section.getByRole("status")).toContainText("Checks failed", { timeout: 30_000 });
    await expect(section.getByLabel("Failing output")).toContainText("missing ok.txt");
    await expect(card.getByRole("list", { name: "Evidence" })).not.toContainText("Verified: yes");

    // The fix is in the worktree; Re-run passes and the story is Verified.
    writeFileSync(join(folder, "ok.txt"), "ok\n");
    await section.getByRole("button", { name: "Re-run" }).click();
    await expect(section.getByRole("status")).toContainText("Checks passed", { timeout: 30_000 });
    await expect(section.getByLabel("Failing output")).toHaveCount(0);
    await expect(card.getByRole("list", { name: "Evidence" })).toContainText("Verified: yes");
    await app.close();
  } finally {
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
});
