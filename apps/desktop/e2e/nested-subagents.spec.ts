import { expect, test } from "@playwright/test";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempProject, tempUserData } from "./app.ts";

/**
 * STORY-55: a subagent the session spawns, in the real app with its real local server. Only the platform and the agent
 * are faked (agent.ts): a stand-in `claude` on the PATH, and fake-agent-sdk.mjs as the Agent SDK's `query`, whose
 * "subagent" script spawns a background subagent that asks to run a Bash call as itself and then waits for stopTask.
 */
test("a subagent nests under its session with a live read-only transcript, names itself on its approval, and Stop ends it alone", async () => {
  const userData = await tempUserData();
  const project = await tempProject("version: 1\n");
  const bin = await standInClaude();
  const { app, page } = await launch(userData.dir, {
    FEATRA_PROJECT_DIR: project.dir,
    FEATRA_E2E_AGENT_SDK: FAKE_SDK,
    [PATH_KEY]: bin.path,
  });
  const log = page.getByRole("log", { name: "Chat" });
  const chats = page.getByRole("region", { name: "Chats" });
  const nest = chats.getByRole("list", { name: /^Subagents of/ });
  try {
    await page.getByRole("button", { name: "New chat" }).click();
    await page
      .getByRole("dialog", { name: "New chat" })
      .getByRole("button", { name: /^Developer/ })
      .click();
    await expect(page.getByRole("region", { name: "Developer" })).toBeVisible();

    // AC3: the subagent's Bash waits in the session's chat, and says which subagent asked.
    const composer = page.getByRole("textbox", { name: "Message" });
    await composer.fill("spawn a subagent");
    await composer.press("Enter");
    const prompt = log.getByRole("group", { name: "Approve Bash" });
    await expect(prompt).toContainText("Asked by the subagent Review the diff");

    // AC1: it is nested under the session in the sidebar.
    await expect(nest.getByRole("button")).toHaveText(["Review the diff"]);

    // Approve: the subagent goes on, and its transcript is live and read-only.
    await prompt.getByRole("button", { name: "Allow", exact: true }).click();
    await nest.getByRole("button", { name: /Review the diff/ }).click();
    const sub = page.getByRole("region", { name: "reviewer" });
    await expect(sub.getByRole("log", { name: "Chat" })).toContainText("Tests ran, still reviewing.");
    await expect(sub.getByRole("log", { name: "Chat" })).toContainText("Reading the diff.");
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveCount(0);

    // AC2: Stop ends the subagent alone; the session's own turn then finishes.
    await sub.getByRole("button", { name: "Stop reviewer" }).click();
    await expect(sub.getByRole("button", { name: "Stop reviewer" })).toHaveCount(0);
    await chats.getByRole("button", { name: "spawn a subagent" }).click();
    await expect(log).toContainText("Subagent stopped.");

    // The ended subagent stays nested, marked ended, until the user archives it.
    await expect(nest).toContainText("Ended");
    await chats.getByRole("button", { name: "Archive Review the diff" }).click();
    await expect(nest).toHaveCount(0);
  } finally {
    await app.close();
    await userData.dispose();
    await project.dispose();
    await bin.dispose();
  }
});
