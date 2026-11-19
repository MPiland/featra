import { readFile } from "node:fs/promises";
import { expect, type Page } from "../fixtures.ts";
import { composer } from "../draft-chat.ts";

/** The installed app's smoke test (STORY-64) chats as the e2e journeys do: a Developer chat, sent with Enter. */
export const chatLog = (page: Page) => page.getByRole("log", { name: "Chat" });

export async function newDeveloperChat(page: Page) {
  await page.getByRole("button", { name: "New chat" }).click();
  await page
    .getByRole("dialog", { name: "New chat" })
    .getByRole("button", { name: /^Developer/ })
    .click();
  await expect(page.getByRole("region", { name: "Developer" })).toBeVisible();
}

export async function send(page: Page, text: string) {
  await composer(page).fill(text);
  await composer(page).press("Enter");
}

/** The options each agent was started with, as fake-agent-sdk.mjs logs them. */
export const queries = async (agentLog: string): Promise<unknown[]> =>
  (await readFile(agentLog, "utf8"))
    .trim()
    .split("\n")
    .map((line): unknown => JSON.parse(line));

/** One agent, started with this `claude`. */
export const startedWith = (claude: string) => [expect.objectContaining({ pathToClaudeCodeExecutable: claude })];
