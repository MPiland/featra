import { expect, test, type ElectronApplication } from "@playwright/test";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { draftInNewChat } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";

/**
 * STORY-54: a story agent ends a turn and the Dev Lead that drafted the feature is told, in its own chat. The real app,
 * its real local server, the real MCP process and real git; only the platform and the agent are faked (agent.ts).
 * The notice is written by the app, labelled as not the user's, and the Dev Lead's agent answers it.
 */
test("A story session's turn ends and a notice appears in the Dev Lead's chat", async () => {
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

    // The story's turn is over at once with the fake agent; the Dev Lead's chat is the first row, the session nests under it.
    await page.getByRole("region", { name: "Chats" }).locator(".chat-row").first().click();
    const log = page.getByRole("log", { name: "Chat" });
    await expect(log).toContainText("[Featra notice, written by the app, not the user]");
    await expect(log).toContainText(`${id} ended: You said: You are working on ${id}`);
    // The Dev Lead's agent heard it and answered it.
    await expect(log).toContainText("You said: [Featra notice");
    await app.close();
  } finally {
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
});
