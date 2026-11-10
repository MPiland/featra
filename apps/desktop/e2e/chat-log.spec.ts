import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempProject, tempUserData } from "./app.ts";

/**
 * STORY-47: the agent logs a decision through the Featra MCP, in the real app with its real local server and the real
 * MCP process (bundled as dist/mcp.cjs, started over stdio). Only the platform and the agent are faked (agent.ts):
 * fake-agent-sdk.mjs starts the MCP from the options Featra gave the session and calls its tool, as Claude would.
 */
const log = (page: Page) => page.getByRole("log", { name: "Chat" });
const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
const decisions = (dir: string) => join(dir, "decisions.md");

async function chatting(config: string) {
  const userData = await tempUserData();
  const project = await tempProject(config);
  const bin = await standInClaude();
  const { app, page } = await launch(userData.dir, {
    FEATRA_PROJECT_DIR: project.dir,
    FEATRA_E2E_AGENT_SDK: FAKE_SDK,
    [PATH_KEY]: bin.path,
  });
  await page.getByRole("button", { name: "New chat" }).click();
  await page
    .getByRole("dialog", { name: "New chat" })
    .getByRole("button", { name: /^Developer/ })
    .click();
  await expect(page.getByRole("region", { name: "Developer" })).toBeVisible();
  return {
    app,
    page,
    project,
    dispose: async () => {
      await app.close();
      await userData.dispose();
      await project.dispose();
      await bin.dispose();
    },
  };
}

test("the agent logs a decision: it is written to decisions.md, shown in the chat, and Undo takes it back", async () => {
  const { page, project, dispose } = await chatting("version: 1\n");
  try {
    await composer(page).fill("decide where entries go");
    await composer(page).press("Enter");

    // AC2, AC5: the entry is in the working folder's decisions.md, and the chat says so with Undo.
    await expect(log(page).getByText("Logged to decisions.md", { exact: true })).toBeVisible();
    await expect(log(page)).toContainText("Tool said: Logged to decisions.md.");
    const text = await readFile(decisions(project.dir), "utf8");
    expect(text).toContain("Keep entries in the working folder");
    expect(text).toContain("  - Why: They are committed with the branch.");
    expect(text).toContain("  - Rejected: A central log: not versioned with the work");
    expect(text).toMatch(/  - Session: Developer chat \w{8}/);

    // AC5: Undo removes that entry, and the row says so.
    await log(page).getByRole("button", { name: "Undo" }).click();
    await expect(log(page).getByText("Undone", { exact: true })).toBeVisible();
    await expect(log(page).getByRole("button", { name: "Undo" })).toHaveCount(0);
    expect(await readFile(decisions(project.dir), "utf8")).not.toContain("Keep entries in the working folder");
  } finally {
    await dispose();
  }
});

test("with the MCP off in the project, the agent isn't offered the tools", async () => {
  const { page, project, dispose } = await chatting("version: 1\nmcp: false\n");
  try {
    await composer(page).fill("decide where entries go");
    await composer(page).press("Enter");
    await expect(log(page)).toContainText("No Featra MCP.");
    await expect(log(page).getByText(/Logged to/)).toHaveCount(0);
    await expect(readFile(decisions(project.dir), "utf8")).rejects.toThrow();
  } finally {
    await dispose();
  }
});
