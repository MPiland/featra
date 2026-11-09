import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { FAKE_SDK, PATH_KEY, standInClaude, tempDir } from "./agent.ts";
import { launch, tempProject, tempUserData } from "./app.ts";

/**
 * STORY-6: roles in the real app with its real local server. Faked: a stand-in `claude` on the PATH, the Agent SDK's
 * `query` (fake-agent-sdk.mjs, which logs the options Featra passed it), and the providers' folders (CLAUDE_CONFIG_DIR, CODEX_HOME), so the developer's own
 * ~/.claude and ~/.codex are never read. The project's and the provider's files are real files on disk.
 */
const AGENT = "---\nname: reviewer\ndescription: Reviews code\nmodel: opus\n---\nYou review.";
const SETTINGS = JSON.stringify({ permissions: { defaultMode: "acceptEdits" } });

const rows = (page: Page, group: string) => page.getByRole("list", { name: group }).getByRole("button");
const editor = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

async function chooseFromMenu(page: Page, ...path: string[]) {
  await page.getByRole("button", { name: "Menu" }).click();
  const last = path.pop()!;
  for (const name of path) await page.getByRole("menuitem", { name, exact: true }).hover();
  await page
    .locator("[role=menuitem]")
    .filter({ hasText: new RegExp(`^${last}`) })
    .click();
}

async function put(path: string, text: string) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, text, "utf8");
}

test("Roles lists built-in, custom and provider roles, edits them as project files, and chats start from them (AC1 to AC7)", async () => {
  const userData = await tempUserData();
  const project = await tempProject("version: 1\n");
  const bin = await standInClaude();
  const home = await tempDir("featra-home-");
  const claudeHome = await tempDir("featra-claude-home-");
  const agentLog = join(bin.dir, "agent.log");
  await put(join(project.dir, ".claude", "agents", "reviewer.md"), AGENT);
  await put(join(claudeHome.dir, "settings.json"), SETTINGS);
  const roleFile = (id: string) => join(project.dir, ".featra", "roles", `${id}.md`);
  const { app, page } = await launch(userData.dir, {
    FEATRA_PROJECT_DIR: project.dir,
    FEATRA_E2E_AGENT_SDK: FAKE_SDK,
    FEATRA_E2E_AGENT_LOG: agentLog,
    CLAUDE_CONFIG_DIR: claudeHome.dir,
    CODEX_HOME: home.dir,
    [PATH_KEY]: bin.path,
  });
  try {
    await chooseFromMenu(page, "File", "Settings");
    await page
      .getByRole("navigation", { name: "Settings pages" })
      .getByRole("list", { name: "Project" })
      .getByRole("button", { name: "Roles" })
      .click();

    // AC1, AC4, AC7: every kind is listed, the provider's agent tagged with its source, each with the provider's mode.
    await expect(rows(page, "Built-in")).toHaveCount(5);
    await expect(rows(page, "Built-in").first()).toContainText("acceptEdits · from Claude settings");
    await expect(rows(page, "Claude agents")).toHaveText([/reviewerClaude · project/]);

    // AC2: editing a built-in writes the project's file; Reset deletes it.
    await rows(page, "Built-in").filter({ hasText: "QA" }).click();
    await editor(page, "QA")
      .getByRole("button", { name: /^Prompt: / })
      .click();
    await editor(page, "QA").getByRole("textbox", { name: "Prompt" }).fill("Be picky.");
    await editor(page, "QA").getByRole("textbox", { name: "Prompt" }).blur();
    await expect.poll(() => existsSync(roleFile("qa"))).toBe(true);
    expect(await readFile(roleFile("qa"), "utf8")).toContain("Be picky.");
    await expect(editor(page, "QA").getByText("Built-in · edited")).toBeVisible();

    // AC3: a custom role is created as a file, and deleted after a confirmation.
    await page.getByRole("button", { name: "New role" }).click();
    await page.getByRole("textbox", { name: "Name" }).fill("Tester");
    await page.getByRole("button", { name: "Create" }).click();
    await expect.poll(() => existsSync(roleFile("tester"))).toBe(true);
    await expect(rows(page, "Custom")).toHaveText([/TesterCustom/]);

    // AC4: Customize copies the agent into the project; the provider's own file is never touched.
    await rows(page, "Claude agents").first().click();
    await editor(page, "reviewer").getByRole("button", { name: "Customize" }).click();
    await expect(rows(page, "Custom")).toHaveCount(2);
    expect(await readFile(join(project.dir, ".claude", "agents", "reviewer.md"), "utf8")).toBe(AGENT);

    await rows(page, "Custom").filter({ hasText: "Tester" }).click();
    await editor(page, "Tester").getByRole("button", { name: "Delete" }).click();
    await editor(page, "Tester")
      .getByRole("group", { name: "Confirm delete" })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect.poll(() => existsSync(roleFile("tester"))).toBe(false);

    // AC2: Reset brings the built-in back.
    await rows(page, "Built-in").filter({ hasText: "QA" }).click();
    await editor(page, "QA").getByRole("button", { name: "Reset" }).click();
    await expect.poll(() => existsSync(roleFile("qa"))).toBe(false);

    // AC5, AC6, AC7: a chat started afterwards runs with the role's prompt, in the mode Claude's settings name.
    await rows(page, "Built-in").filter({ hasText: "QA" }).click();
    await editor(page, "QA")
      .getByRole("button", { name: /^Prompt: / })
      .click();
    await editor(page, "QA").getByRole("textbox", { name: "Prompt" }).fill("Be strict.");
    await editor(page, "QA").getByRole("textbox", { name: "Prompt" }).blur();
    await expect
      .poll(async () => (existsSync(roleFile("qa")) ? await readFile(roleFile("qa"), "utf8") : ""))
      .toContain("Be strict.");
    await page.keyboard.press("Control+N");
    await page.getByRole("dialog", { name: "New chat" }).getByRole("button", { name: /^QA/ }).click();
    const chat = page.getByRole("region", { name: "QA", exact: true });
    await expect(chat.locator(".chat-mode")).toHaveText("acceptEdits · from Claude settings");
    await expect(chat.getByText("Full access", { exact: false })).toHaveCount(0);
    await chat.getByRole("textbox", { name: "Message" }).fill("hello");
    await chat.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(chat.getByRole("log", { name: "Chat" })).toContainText("You said: hello");
    const queries = (await readFile(agentLog, "utf8"))
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(queries.at(-1)).toMatchObject({
      permissionMode: "acceptEdits",
      systemPrompt: { type: "preset", preset: "claude_code", append: "Be strict." },
    });
  } finally {
    await app.close();
    await userData.dispose();
    await project.dispose();
    await bin.dispose();
    await home.dispose();
    await claudeHome.dispose();
  }
});

test("a Claude agent with full access shows a warning in its chat, and an unknown model falls back with a note (AC5, AC6)", async () => {
  const userData = await tempUserData();
  const project = await tempProject("version: 1\n");
  const bin = await standInClaude();
  const home = await tempDir("featra-home-");
  const claudeHome = await tempDir("featra-claude-home-");
  await put(join(project.dir, ".claude", "agents", "scout.md"), "---\nname: scout\nmodel: gpt-5\n---\nLook around.");
  await put(
    join(project.dir, ".claude", "settings.local.json"),
    JSON.stringify({ permissions: { defaultMode: "bypassPermissions" } }),
  );
  const { app, page } = await launch(userData.dir, {
    FEATRA_PROJECT_DIR: project.dir,
    FEATRA_E2E_AGENT_SDK: FAKE_SDK,
    CLAUDE_CONFIG_DIR: claudeHome.dir,
    CODEX_HOME: home.dir,
    [PATH_KEY]: bin.path,
  });
  try {
    await page.keyboard.press("Control+N");
    await page
      .getByRole("dialog", { name: "New chat" })
      .getByRole("button", { name: /^scout/ })
      .click();
    const chat = page.getByRole("region", { name: "scout", exact: true });
    await expect(chat.locator(".chat-mode")).toHaveText("bypassPermissions · from Claude settings");
    await expect(chat.getByRole("status")).toContainText("Full access");
    await expect(chat.getByText("Claude doesn't have the model", { exact: false })).toBeVisible();
  } finally {
    await app.close();
    await userData.dispose();
    await project.dispose();
    await bin.dispose();
    await home.dispose();
    await claudeHome.dispose();
  }
});
