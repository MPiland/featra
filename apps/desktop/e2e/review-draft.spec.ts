import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { newCard, serializeCard } from "@featra/work-format";
import { launch, tempUserData } from "./app.ts";

/**
 * STORY-49: the Dev Lead drafts a feature and the user reviews it in the same chat. The real app, its real local
 * server, the real MCP process and real git; only the platform and the agent are faked (agent.ts), as in draft.spec.ts.
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
async function project() {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "featra-review-draft-e2e-")));
  await mkdir(join(dir, ".featra", "cards"), { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "core.autocrlf", "false");
  await writeFile(join(dir, ".featra", "config.yaml"), "version: 1\n");
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

const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
const work = (page: Page) => page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Work" });
const pane = (page: Page, id: string) => page.getByRole("complementary", { name: `${id} card` });

/** The story's card file as the owner has it on disk. */
async function storyFile(dir: string, id: string) {
  const cards = join(dir, ".featra", "cards");
  const name = (await readdir(cards)).find((f) => f.startsWith(`${id}-`)) ?? "";
  return readFile(join(cards, name), "utf8");
}

test("the chat that drafts shows the draft beside it, takes the feature's name, reopens from Work, and an edit saves with history", async () => {
  const userData = await tempUserData();
  const repo = await project();
  const bin = await standInClaude();
  try {
    const { app, page } = await launch(userData.dir, {
      FEATRA_PROJECT_DIR: repo.dir,
      FEATRA_E2E_AGENT_SDK: FAKE_SDK,
      [PATH_KEY]: bin.path,
    });
    await page.getByRole("button", { name: "New chat" }).click();
    await page
      .getByRole("dialog", { name: "New chat" })
      .getByRole("button", { name: /^Dev Lead/ })
      .click();
    await expect(page.getByRole("region", { name: "Dev Lead" })).toBeVisible();
    const row = page.getByRole("region", { name: "Chats" }).locator(".chat-row").first();
    await expect(row).toContainText("Dev Lead");

    // AC1, AC2: the draft opens as a pane beside the chat, and the chat is named for the feature.
    await composer(page).fill("draft a feature");
    await composer(page).press("Enter");
    await expect(pane(page, "FEAT-2")).toBeVisible();
    await expect(page.getByRole("region", { name: "Dev Lead" })).toBeVisible();
    // Full height: the pane spans the chat's height, top to bottom, and sits beside it, not over it.
    const paneBox = await pane(page, "FEAT-2").boundingBox();
    const chatBox = await page.getByRole("region", { name: "Dev Lead" }).boundingBox();
    expect(paneBox && chatBox).toBeTruthy();
    expect(Math.abs((paneBox?.y ?? 0) - (chatBox?.y ?? 99))).toBeLessThanOrEqual(1);
    expect(Math.abs((paneBox?.height ?? 0) - (chatBox?.height ?? 99))).toBeLessThanOrEqual(1);
    expect((paneBox?.x ?? 0) + 1).toBeGreaterThanOrEqual((chatBox?.x ?? 0) + (chatBox?.width ?? 0));
    await expect(row).toContainText("Shaping");

    // AC3: from Work, Review draft opens that chat with the draft pane (the chat was left, so the pane starts closed).
    await work(page).click();
    await expect(pane(page, "FEAT-2")).toHaveCount(0);
    await page.getByRole("region", { name: "Work list" }).getByRole("button", { name: "Review draft FEAT-2" }).click();
    await expect(page.getByRole("region", { name: "Dev Lead" })).toBeVisible();
    await expect(pane(page, "FEAT-2")).toBeFocused();

    // AC4: a story opens from the feature's list and its title is edited; the owner's file keeps the edit and who made it.
    await pane(page, "FEAT-2").getByRole("list", { name: "Stories" }).getByRole("button").first().click();
    const story = page.getByRole("complementary", { name: /^STORY-\d+ card$/ });
    await story.getByRole("button", { name: "Title: Draft a feature" }).click();
    await story.getByRole("textbox", { name: "Title" }).fill("Draft it well");
    await story.getByRole("textbox", { name: "Title" }).press("Enter");
    await expect(story.getByRole("button", { name: "Title: Draft it well" })).toBeVisible();
    await expect.poll(async () => storyFile(repo.dir, "STORY-1")).toContain("title: Draft it well");
    const saved = await storyFile(repo.dir, "STORY-1");
    expect(saved).toMatch(/field: content/);
    expect(saved).toMatch(/by: user/);
    await app.close();
  } finally {
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
});
