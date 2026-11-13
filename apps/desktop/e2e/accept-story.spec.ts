import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type ElectronApplication, type Locator } from "@playwright/test";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { draftInNewChat, pane } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";

/**
 * STORY-23: the user accepts a story or sends it back. The real app, its real local server, the real MCP process and
 * real git; only the platform and the agent are faked (agent.ts). A story in Acceptance offers Accept and Send back in
 * its Work row, its card pane and the end of its session. Send back messages the session and returns the story to In
 * Progress; Accept records Accepted and takes both away, with the session left open.
 */
test("Send a story back from its session, then Accept it: the reason reaches the agent, and both buttons go after Accept", async () => {
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
    const file = () =>
      git(folder, "ls-files", "--modified", "--others", "--exclude-standard")
        .split("\n")
        .find((l) => l.includes(id)) ?? "";
    const card = () => readFileSync(join(folder, file()), "utf8");
    const accept = (scope: Locator) => scope.getByRole("button", { name: `Accept ${id}` });
    const sendBack = (scope: Locator) => scope.getByRole("button", { name: `Send back ${id}` });
    const toAcceptance = async () => {
      await pane(page, id).getByRole("button", { name: "Status: In Progress" }).click();
      await page.getByRole("listbox", { name: "Status" }).getByRole("option", { name: "Acceptance" }).click();
    };

    // The story is in progress: neither is offered. The user moves it to Acceptance from its card pane.
    await expect(accept(row)).toHaveCount(0);
    await row.getByRole("button", { name: "Draft a feature" }).click();
    await toAcceptance();

    // AC1: Accept and Send back are in the row, the pane and at the end of the session.
    await expect(accept(row)).toBeVisible();
    await expect(sendBack(row)).toBeVisible();
    await expect(accept(pane(page, id))).toBeVisible();
    await expect(sendBack(pane(page, id))).toBeVisible();
    await row.getByRole("button", { name: `Open the session of ${id}` }).click();
    const session = page.getByRole("region", { name: "Developer" });
    await expect(accept(session)).toBeVisible();

    // AC3: Send back needs a reason; with it, the session gets it as the user's message and the story is In Progress.
    await sendBack(session).click();
    const form = session.getByRole("form", { name: `Send back ${id}` });
    await expect(form.getByRole("button", { name: "Send" })).toBeDisabled();
    await form.getByRole("textbox", { name: "Reason" }).fill("It loses my work.");
    await form.getByRole("checkbox", { name: "Add as acceptance criterion" }).check();
    await form.getByRole("button", { name: "Send" }).click();
    const log = page.getByRole("log", { name: "Chat" });
    await expect(log).toContainText(`Sent back ${id}: It loses my work.`);
    await expect(log).toContainText(`You said: Sent back ${id}: It loses my work.`);
    await expect(accept(session)).toHaveCount(0);
    await expect.poll(card).toMatch(/field: sent-back/);
    expect(card()).toMatch(/status: In Progress/);
    expect(card()).toContain("It loses my work.");
    // The reason is now a new, unchecked acceptance criterion.
    expect(card()).toContain("- [ ] It loses my work.");

    // The story comes back to Acceptance. AC2: Accept records Accepted by the user, with no confirmation.
    await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Work" }).click();
    await page.getByRole("button", { name: "Shaping", exact: true }).click();
    await row.getByRole("button", { name: "Draft a feature" }).click();
    await toAcceptance();
    await accept(pane(page, id)).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect.poll(card).toMatch(/field: accepted/);

    // AC4: nothing offers Accept or Send back any more, and the session stays open.
    await expect(accept(row)).toHaveCount(0);
    await expect(sendBack(row)).toHaveCount(0);
    await expect(accept(pane(page, id))).toHaveCount(0);
    await expect(sendBack(pane(page, id))).toHaveCount(0);
    await row.getByRole("button", { name: `Open the session of ${id}` }).click();
    await expect(session).toBeVisible();
    await expect(log).toContainText(`Sent back ${id}: It loses my work.`);
    await expect(sendBack(session)).toHaveCount(0);
    await app.close();
  } finally {
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
});
