import { readFile, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { expect, test, type ElectronApplication } from "./fixtures.ts";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, openedFiles, tempUserData } from "./app.ts";
import { draftInNewChat, pane } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";
import { storyOf } from "./story-worktree.ts";
import { atReviewSize, uxShot } from "./ux-shot.ts";

/**
 * STORY-72: evidence an agent attached shows next to its criteria. The real app, its real local server, the real MCP
 * process and real git; only the platform and the agent are faked (agent.ts). The fake agent, told by
 * FEATRA_E2E_REPORT=evidence, writes two screenshots and a text file into its story's evidence folder and links one to
 * each criterion through the real `update_card` tool. One screenshot is then deleted, so its criterion says so.
 */
test("Evidence by its criteria: a thumbnail opens full size, Escape closes it, a file opens, a missing one says so", async () => {
  const userData = await tempUserData();
  const repo = await project();
  const bin = await standInClaude();
  let running: ElectronApplication | undefined;
  try {
    const { app, page } = await launch(userData.dir, {
      FEATRA_PROJECT_DIR: repo.dir,
      FEATRA_E2E_AGENT_SDK: FAKE_SDK,
      FEATRA_E2E_REPORT: "evidence",
      [PATH_KEY]: bin.path,
    });
    running = app;
    await atReviewSize(app, page);
    const draft = await draftInNewChat(page, "FEAT-2");
    await draft.getByRole("button", { name: "Approve", exact: true }).click();
    await expect.poll(() => git(repo.dir, "status", "--porcelain"), { timeout: 30_000 }).toBe("");
    await draft.getByRole("button", { name: "Start", exact: true }).click();
    await expect.poll(() => git(repo.dir, "branch", "--format=%(refname:short)")).toContain("feature/2-shaping");

    const nav = page.getByRole("navigation", { name: "Featra" });
    await nav.getByRole("button", { name: "Work" }).click();
    await page.getByRole("button", { name: "Shaping", exact: true }).click();
    const row = page.getByRole("row", { name: /Draft a feature/ });
    await row.getByRole("button", { name: /^Start STORY-\d+$/ }).click();
    // The agent's report has linked its evidence once the row is marked.
    await expect(row).toContainText("Reported");
    const { id, folder } = storyOf(repo.dir, "draft-a-feature");
    await rm(join(folder, ".featra", "evidence", "FEAT-2", id, "before.png"));

    // AC1, AC3, AC4 in the card pane: a thumbnail, a link, and a note where the file is gone, beside each criterion.
    await row.getByRole("button", { name: "Draft a feature" }).click();
    const card = pane(page, id);
    const shot = card.getByRole("button", { name: "Open draft.png" });
    await expect(shot).toBeVisible();
    await expect(card.getByRole("link", { name: "notes.txt" })).toBeVisible();
    await expect(card.getByText("Evidence missing")).toBeVisible();
    await expect(card.getByRole("button", { name: "AC 3: The old draft is kept" })).toBeVisible();
    await uxShot(page, "feat9-evidence-missing", card.getByText("Evidence missing"));

    // AC3: the link opens the server's copy of the file, in the data folder, with the OS.
    await card.getByRole("link", { name: "notes.txt" }).click();
    await expect.poll(async () => (await openedFiles(app)).length).toBe(1);
    const [opened] = await openedFiles(app);
    expect(opened?.how).toBe("open");
    expect(basename(opened?.file ?? "")).toBe("notes.txt");
    expect(opened?.file).toContain("evidence-open");
    expect(await readFile(opened?.file ?? "", "utf8")).toBe("Drafted FEAT-2 with two stories.\n");

    // AC2: the thumbnail opens the screenshot full size; Escape closes it and focus goes back to the thumbnail.
    await shot.click();
    const viewer = page.getByRole("dialog", { name: "Screenshot draft.png" });
    const full = viewer.getByRole("img", { name: "draft.png" });
    await expect(full).toBeVisible();
    await expect.poll(() => full.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(480);
    await uxShot(page, "feat9-evidence-overlay");
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
    await expect(shot).toBeFocused();
    await expect(card).toBeVisible();

    // The review screen shows the same evidence beside the same criteria.
    await page.getByRole("button", { name: "Review FEAT-2" }).click();
    const screen = page.getByRole("region", { name: "Review FEAT-2" });
    const item = screen.locator(`[data-card="${id}"]`);
    const reviewShot = item.getByRole("button", { name: "Open draft.png" });
    await expect(reviewShot).toBeVisible();
    await expect(item.getByRole("link", { name: "notes.txt" })).toBeVisible();
    await expect(item.getByText("Evidence missing")).toBeVisible();
    await uxShot(page, "feat9-evidence-thumbnails", item);
    await reviewShot.click();
    await expect(viewer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
    await expect(reviewShot).toBeFocused();
    await expect(screen).toBeVisible();
    await app.close();
  } finally {
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
});
