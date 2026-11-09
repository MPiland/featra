import { readFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { BUILT_IN_ROLES, CHAT_MESSAGES } from "@featra/work-format";
import { FAKE_SDK, PATH_KEY, pathWithoutClaude, standInClaude } from "./agent.ts";
import { launch, tempProject, tempUserData } from "./app.ts";

/**
 * STORY-5: start a chat from a role and stream it, in the real app with its real local server. Only the platform
 * and the agent are faked: a stand-in `claude` sits on the PATH (it is found, never run), and the Agent SDK's `query`
 * is fake-agent-sdk.mjs (ADR 0013), which logs the options Featra passed it.
 */
const DEVELOPER = BUILT_IN_ROLES.find((r) => r.id === "developer")!;

const log = (page: Page) => page.getByRole("log", { name: "Chat" });
const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });

async function newChat(page: Page, role: string) {
  await page.getByRole("button", { name: "New chat" }).click();
  await page
    .getByRole("dialog", { name: "New chat" })
    .getByRole("button", { name: new RegExp(`^${role}`) })
    .click();
  await expect(page.getByRole("region", { name: role })).toBeVisible();
}

test("a Developer chat streams replies, shows tool rows, denies what needs approval, and stops", async () => {
  const userData = await tempUserData();
  const project = await tempProject("version: 1\n");
  const bin = await standInClaude();
  const claude = bin.claude;
  const agentLog = join(bin.dir, "agent.log");
  const { app, page } = await launch(userData.dir, {
    FEATRA_PROJECT_DIR: project.dir,
    FEATRA_E2E_AGENT_SDK: FAKE_SDK,
    FEATRA_E2E_AGENT_LOG: agentLog,
    [PATH_KEY]: bin.path,
  });
  try {
    await newChat(page, "Developer");
    await expect(page.getByRole("region", { name: "Developer" })).toContainText(
      `${DEVELOPER.model} · ${DEVELOPER.effort} · Ask`,
    );

    // AC2: Shift+Enter adds a line, Enter sends, and the reply streams in.
    await composer(page).fill("hello");
    await composer(page).press("Shift+Enter");
    await composer(page).pressSequentially("there");
    await expect(composer(page)).toHaveValue("hello\nthere");
    await composer(page).press("Enter");
    await expect(composer(page)).toHaveValue("");
    await expect(log(page)).toContainText("You said: hello\nthere");

    // AC3 and AC5: each tool is one collapsed row; the one that needs approval is denied, visibly.
    await composer(page).fill("use a tool");
    await composer(page).press("Enter");
    await expect(log(page)).toContainText("Done.");
    const read = log(page).getByRole("button", { name: /^Read/ });
    await expect(read).toHaveText("ReadREADME.md");
    await expect(read).toHaveAttribute("aria-expanded", "false");
    await read.click();
    await expect(log(page)).toContainText("# Demo project");
    const bash = log(page).getByRole("button", { name: /^Bash/ });
    await expect(bash).toHaveText("Bashnpm testDenied");
    await bash.click();
    await expect(log(page)).toContainText(CHAT_MESSAGES.denied);

    // AC2: Stop interrupts the running turn.
    await composer(page).fill("slow");
    await composer(page).press("Enter");
    await expect(log(page)).toContainText("Thinking it over");
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(log(page).getByRole("status")).toHaveText("Stopped.");
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();

    // AC1: one agent for the chat, started with the user's claude, in the project, with the role's settings.
    const queries = (await readFile(agentLog, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(queries).toHaveLength(1);
    expect(queries[0]).toEqual({
      cwd: project.dir,
      model: DEVELOPER.model,
      effort: DEVELOPER.effort,
      systemPrompt: { type: "preset", preset: "claude_code", append: DEVELOPER.prompt },
      pathToClaudeCodeExecutable: claude,
      permissionMode: "default",
    });
  } finally {
    await app.close();
    await userData.dispose();
    await project.dispose();
    await bin.dispose();
  }
});

test("without claude on the PATH, a chat says so in one line and offers no login", async () => {
  const userData = await tempUserData();
  const project = await tempProject("version: 1\n");
  const { app, page } = await launch(userData.dir, {
    FEATRA_PROJECT_DIR: project.dir,
    FEATRA_E2E_AGENT_SDK: FAKE_SDK,
    [PATH_KEY]: pathWithoutClaude().join(delimiter),
  });
  try {
    await newChat(page, "QA");
    await composer(page).fill("hello");
    await composer(page).press("Enter");
    await expect(log(page).getByRole("status")).toHaveText("Claude Code isn't installed.");
    await expect(page.getByRole("button", { name: /log ?in|sign ?in/i })).toHaveCount(0);
  } finally {
    await app.close();
    await userData.dispose();
    await project.dispose();
  }
});
