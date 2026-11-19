import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { newCard, serializeCard } from "@featra/work-format";
import { expect, test, type Page } from "./fixtures.ts";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, queueFolderPicks, tempProject, tempUserData } from "./app.ts";
import { git, project } from "./draft-project.ts";
import { pressShortcut } from "./keys.ts";
import { atReviewSize, uxShot } from "./ux-shot.ts";

/**
 * STORY-66: the project switcher shows which projects need the user, across two projects in the real app with its real
 * local server, scanner and git. Only the platform and the agent are faked (agent.ts); the Inbox wait is 3 seconds
 * (settings.json), so the real server clock passes it.
 */
const switcher = (page: Page) =>
  page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: /^Switch project: / });
const dot = (page: Page) => switcher(page).locator(".proj-dot");
const projectMenu = (page: Page) => page.getByRole("menu", { name: "Projects" });
const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
const inboxEntry = (page: Page) => page.getByRole("button", { name: /^Inbox/ });

/** A feature the Dev Lead drafted, for the user to review, with `status`. */
const draftFeature = (status: "draft" | "approved") =>
  serializeCard({
    ...newCard({ id: "FEAT-2", type: "feature", title: "Second", status }, "dev-lead", "2026-11-02T00:00:00Z"),
    extra: { "drafted-by": "chat-1" },
  });

test("another project's waiting agent and draft to review show on the switcher and in its menu, live, until answered", async () => {
  const userData = await tempUserData();
  await writeFile(join(userData.dir, "settings.json"), JSON.stringify({ inboxWaitMinutes: 0.05 }), "utf8");
  const busy = await project();
  const draftFile = join(busy.dir, ".featra", "cards", "FEAT-2-second.md");
  await writeFile(draftFile, draftFeature("draft"), "utf8");
  git(busy.dir, "add", "-A");
  git(busy.dir, "commit", "-q", "-m", "draft");
  const quiet = await tempProject("version: 1\n");
  const bin = await standInClaude();
  const busyName = basename(busy.dir);
  const quietName = basename(quiet.dir);
  const { app, page } = await launch(userData.dir, {
    FEATRA_PROJECT_DIR: busy.dir,
    FEATRA_E2E_AGENT_SDK: FAKE_SDK,
    [PATH_KEY]: bin.path,
  });
  try {
    await atReviewSize(app, page);
    // An agent in the busy project asks for a tool approval.
    await page.getByRole("button", { name: "New chat" }).click();
    await page
      .getByRole("dialog", { name: "New chat" })
      .getByRole("button", { name: /^Developer/ })
      .click();
    await composer(page).fill("use a tool");
    await composer(page).press("Enter");
    await expect(page.getByRole("log", { name: "Chat" }).getByRole("group", { name: "Approve Bash" })).toBeVisible();

    // AC3: the current project's own waiting agent and review show no dot.
    await expect(switcher(page)).toHaveAccessibleName(`Switch project: ${busyName}`);
    await expect(dot(page)).toHaveCount(0);

    // AC3, AC5: from another project, the closed switcher shows the dot and says what it means.
    await queueFolderPicks(app, quiet.dir);
    await pressShortcut(page, "openFolder");
    await expect(switcher(page)).toHaveAccessibleName(`Switch project: ${quietName}, another project needs you`);
    await expect(dot(page)).toBeVisible();
    await uxShot(page, "feat20-switcher-dot", switcher(page));

    // AC1, AC2, AC5: the menu shows the busy project's one waiting agent and its review mark; the quiet one has none.
    await switcher(page).click();
    const busyItem = projectMenu(page).getByRole("menuitemradio", { name: new RegExp(`^${busyName}`) });
    const quietItem = projectMenu(page).getByRole("menuitemradio", { name: new RegExp(`^${quietName}`) });
    await expect(busyItem).toHaveAccessibleName(`${busyName}, 1 agent waiting, to review`);
    await expect(quietItem).toHaveAccessibleName(quietName);
    await expect(busyItem.locator(".mmark:not(.quiet)")).toHaveText("1");
    await expect(busyItem.locator(".mmark.quiet")).toBeVisible();
    await uxShot(page, "feat20-switcher-menu-marks", projectMenu(page));

    // AC4: the draft approved on disk clears its review mark in the open menu.
    await writeFile(draftFile, draftFeature("approved"), "utf8");
    await expect(busyItem).toHaveAccessibleName(`${busyName}, 1 agent waiting`);
    await expect(busyItem.locator(".mmark.quiet")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(projectMenu(page)).toHaveCount(0);

    // AC4: answering the request from the Inbox clears the count and the dot, without switching projects.
    await inboxEntry(page).click();
    const item = page.getByRole("region", { name: "Waiting for you" }).getByRole("listitem");
    await expect(item).toHaveCount(1, { timeout: 15_000 });
    await item.getByRole("button", { name: "Allow", exact: true }).click();
    await expect(switcher(page)).toHaveAccessibleName(`Switch project: ${quietName}`);
    await expect(dot(page)).toHaveCount(0);
    await switcher(page).click();
    await expect(busyItem).toHaveAccessibleName(busyName);
  } finally {
    await app.close();
    await userData.dispose();
    await busy.dispose();
    await quiet.dispose();
    await bin.dispose();
  }
});
