import type { ElectronApplication, Page } from "@playwright/test";
import { expect } from "./fixtures.ts";
import { browserUrl, inBrowserPage } from "./browser-page.ts";
import { draftInNewChat, pane } from "./draft-chat.ts";
import { git } from "./draft-project.ts";
import { awaitStoryWorktree } from "./story-worktree.ts";

/**
 * The FEAT-10 journeys' way in (STORY-74, STORY-75): FEAT-2 drafted, approved and started, its story started, and the
 * Browser pane opened from the story's card, with the story's dev server (fixture-dev-server.mjs at `url`) shown in it.
 */
export async function openStoryBrowser(app: ElectronApplication, page: Page, repo: string, url: string) {
  const draft = await draftInNewChat(page, "FEAT-2");
  await draft.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => git(repo, "status", "--porcelain", "--", ".featra/cards"), { timeout: 30_000 }).toBe("");
  await draft.getByRole("button", { name: "Start", exact: true }).click();
  await expect.poll(() => git(repo, "branch", "--format=%(refname:short)")).toContain("feature/2-shaping");

  await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Work" }).click();
  await page.getByRole("button", { name: "Shaping", exact: true }).click();
  const row = page.getByRole("row", { name: /Draft a feature/ });
  await row.getByRole("button", { name: /^Start STORY-\d+$/ }).click();
  const { id } = await awaitStoryWorktree(repo, "draft-a-feature");
  await row.getByRole("button", { name: "Draft a feature" }).click();
  const card = pane(page, id);

  // Browser, from the story's card: the pane docks beside it, the dev server starts and its page shows.
  await card.getByRole("button", { name: "Browser", exact: true }).click();
  const browser = page.getByRole("complementary", { name: `${id} browser` });
  await expect(browser).toBeVisible();
  await expect(browser.getByText(`Browser · ${id}`, { exact: true })).toBeVisible();
  await expect.poll(() => browserUrl(app), { timeout: 60_000 }).toBe(`${url}/`);
  await expect.poll(() => inBrowserPage(app, "document.querySelector('h1')?.textContent")).toBe("Draft a feature");
  return { id, card, browser };
}
