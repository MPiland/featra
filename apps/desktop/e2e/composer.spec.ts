import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { BUILT_IN_ROLES } from "@featra/work-format";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempProject, tempUserData } from "./app.ts";

/**
 * STORY-22: the composer's controls and the context meter, in the real app with its real local server. Only the
 * platform and the agent are faked (ADR 0013): the Agent SDK's `query` is fake-agent-sdk.mjs, which logs the options
 * Featra passed each agent, reports token use on each assistant message, and names the model's window on each result
 * (none for the model haiku).
 */
const role = (id: string) => BUILT_IN_ROLES.find((r) => r.id === id)!;
const DEVELOPER = role("developer");
const QA = role("qa");

const log = (page: Page) => page.getByRole("log", { name: "Chat" });
const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });

async function pick(page: Page, control: string, option: string) {
  await page.getByRole("button", { name: new RegExp(`^${control}:`) }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** Sends a message, waits for the agent's reply to it, and for the turn to be over. */
async function turn(page: Page, text: string) {
  await composer(page).fill(text);
  await composer(page).press("Enter");
  await expect(log(page)).toContainText(`You said: ${text}`);
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
}

test("a chat's role, model, effort and mode change from the composer for the next turn, and the meter follows each turn", async () => {
  const userData = await tempUserData();
  const project = await tempProject("version: 1\n");
  const bin = await standInClaude();
  const agentLog = join(bin.dir, "agent.log");
  const { app, page } = await launch(userData.dir, {
    FEATRA_PROJECT_DIR: project.dir,
    FEATRA_E2E_AGENT_SDK: FAKE_SDK,
    FEATRA_E2E_AGENT_LOG: agentLog,
    [PATH_KEY]: bin.path,
  });
  try {
    await page.getByRole("button", { name: "New chat" }).click();
    await page
      .getByRole("dialog", { name: "New chat" })
      .getByRole("button", { name: /^Developer/ })
      .click();
    await expect(page.getByRole("button", { name: `Model: ${DEVELOPER.model}` })).toBeVisible();
    await expect(page.getByRole("button", { name: `Effort: ${DEVELOPER.effort}` })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mode: default (Ask)" })).toBeVisible();
    // AC2: nothing to show before a turn has used any context.
    await expect(page.getByText(/^Context:/)).toHaveCount(0);

    // AC2 and AC3: the first turn's use is shown against the model's window, from the session's own messages.
    await turn(page, "hello");
    await expect(page.getByText("Context: 1.2k / 200k tokens")).toBeVisible();

    // AC1: model, effort and mode change, and the next turn runs with them.
    await pick(page, "Model", "opus");
    await pick(page, "Effort", "low");
    await pick(page, "Mode", "plan");
    await expect(page.getByRole("region", { name: "Developer" })).toContainText("opus · low · plan");
    await turn(page, "again");
    await expect(page.getByText("Context: 2.2k / 200k tokens")).toBeVisible();

    // AC1: another role's prompt and its own settings, from the turn after.
    await pick(page, "Role", QA.name);
    await expect(page.getByRole("region", { name: QA.name })).toBeVisible();
    await expect(page.getByRole("button", { name: `Model: ${QA.model}` })).toBeVisible();
    await turn(page, "third");
    await expect(page.getByText("Context: 3.2k / 200k tokens")).toBeVisible();

    // AC2: a model the provider names no window for shows the tokens alone: Featra doesn't guess.
    await pick(page, "Model", "haiku");
    await turn(page, "fourth");
    await expect(page.getByText("Context: 4.2k tokens")).toBeVisible();
    await expect(page.getByRole("meter")).toHaveCount(0);

    const queries = (await readFile(agentLog, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(queries).toHaveLength(4);
    expect(queries[0]).toMatchObject({ model: DEVELOPER.model, effort: DEVELOPER.effort, permissionMode: "default" });
    expect(queries[0]).not.toHaveProperty("resume");
    // The same session goes on, with the new settings.
    expect(queries[1]).toMatchObject({ model: "opus", effort: "low", permissionMode: "plan", resume: "fake-session" });
    expect(queries[2]).toMatchObject({
      model: QA.model,
      effort: QA.effort,
      permissionMode: "default",
      systemPrompt: { type: "preset", preset: "claude_code", append: QA.prompt },
      resume: "fake-session",
    });
    expect(queries[3]).toMatchObject({ model: "haiku", effort: QA.effort, resume: "fake-session" });
  } finally {
    await app.close();
    await userData.dispose();
    await project.dispose();
    await bin.dispose();
  }
});
