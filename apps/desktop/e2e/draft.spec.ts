import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { newCard, serializeCard } from "@featra/work-format";
import { launch, tempUserData } from "./app.ts";

/**
 * STORY-8: the Dev Lead drafts a feature through the Featra MCP, in the real app with its real local server, the real
 * MCP process and real git. Only the platform and the agent are faked (agent.ts): fake-agent-sdk.mjs starts the MCP
 * from the options Featra gave the session and calls draft_cards, as an agent would.
 */
const env = (() => {
  const e: Record<string, string | undefined> = { ...process.env };
  for (const key of Object.keys(e)) if (key.startsWith("GIT_")) delete e[key];
  return {
    ...e,
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
})();
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** A project in git with one finished feature, so the draft's IDs are the next ones. */
async function project(config = "version: 1\n") {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "featra-draft-e2e-")));
  await mkdir(join(dir, ".featra", "cards"), { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "core.autocrlf", "false");
  await writeFile(join(dir, ".featra", "config.yaml"), config);
  const first = newCard(
    { id: "FEAT-1", type: "feature", title: "First", status: "done" },
    "user",
    "2026-11-01T00:00:00Z",
  );
  await writeFile(join(dir, ".featra", "cards", "FEAT-1-first.md"), serializeCard(first), "utf8");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "plan");
  return { dir, dispose: () => rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }) };
}

const cards = async (dir: string) => (await readdir(join(dir, ".featra", "cards"))).toSorted();
const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
const list = (page: Page) => page.getByRole("region", { name: "Work list" });

test("the Dev Lead drafts a feature: it shows in Work with a Review badge, is not committed, and a second call updates it in place", async () => {
  const userData = await tempUserData();
  const repo = await project();
  const bin = await standInClaude();
  try {
    const { app, page } = await launch(userData.dir, {
      FEATRA_PROJECT_DIR: repo.dir,
      FEATRA_E2E_AGENT_SDK: FAKE_SDK,
      [PATH_KEY]: bin.path,
    });
    const head = git(repo.dir, "rev-parse", "HEAD");
    await page.getByRole("button", { name: "New chat" }).click();
    await page
      .getByRole("dialog", { name: "New chat" })
      .getByRole("button", { name: /^Dev Lead/ })
      .click();
    await expect(page.getByRole("region", { name: "Dev Lead" })).toBeVisible();
    const log = page.getByRole("log", { name: "Chat" });

    // AC1, AC4: the call makes a Draft feature with its stories, from a chat that only has the MCP's tool.
    await composer(page).fill("draft a feature");
    await composer(page).press("Enter");
    await expect(log).toContainText(
      "Tool said: Drafted FEAT-2 with STORY-1, STORY-2. Not committed: the user reviews the draft in Work.",
    );
    expect(await cards(repo.dir)).toEqual([
      "FEAT-1-first.md",
      "FEAT-2-shaping.md",
      "STORY-1-draft-a-feature.md",
      "STORY-2-review-the-draft.md",
    ]);
    const first = await readFile(join(repo.dir, ".featra", "cards", "STORY-1-draft-a-feature.md"), "utf8");
    expect(first).toContain("The draft shows in Work");
    expect(first).not.toContain("The draft says Review");

    // AC1: the cards are not committed.
    expect(git(repo.dir, "rev-parse", "HEAD")).toBe(head);
    expect(git(repo.dir, "status", "--porcelain", "--untracked-files=all").split("\n")).toHaveLength(3);

    // AC2: the draft is in Work with a Review badge.
    await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Work" }).click();
    const row = list(page).locator("[data-card=FEAT-2]");
    await expect(row).toContainText("Shaping");
    await expect(row).toContainText("Draft");
    await expect(row.getByText("Review", { exact: true })).toBeVisible();
    await expect(list(page).locator("[data-card=FEAT-1]").getByText("Review", { exact: true })).toHaveCount(0);

    // AC3: the same chat calls again; the same feature and IDs are updated, with the change in the card's history.
    await page.getByRole("region", { name: "Chats" }).locator(".chat-row").first().click();
    await composer(page).fill("draft again");
    await composer(page).press("Enter");
    await expect(log).toContainText("Tool said: Updated FEAT-2 in place with STORY-1, STORY-2.");
    expect(await cards(repo.dir)).toHaveLength(4);
    const second = await readFile(join(repo.dir, ".featra", "cards", "STORY-1-draft-a-feature.md"), "utf8");
    expect(second).toContain("The draft says Review");
    expect(second).toMatch(/field: content/);
    expect(second).toContain("session:");
    expect(git(repo.dir, "rev-parse", "HEAD")).toBe(head);
    await app.close();
  } finally {
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
});
