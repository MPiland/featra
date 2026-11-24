import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { watchQuit } from "./diag-procs.ts";
import { expect, test, type ElectronApplication } from "./fixtures.ts";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { draftInNewChat, pane } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";
import { freePort, setProof } from "./proof-setup.ts";
import { awaitStoryWorktree } from "./story-worktree.ts";
import { atReviewSize, uxShot } from "./ux-shot.ts";

/**
 * STORY-25: Featra captures the page a criterion lists when its story moves to review. The real app, its real local
 * server, the real MCP process, real git, a real dev server (fixture-dev-server.mjs, run by the command the user saved)
 * and Electron's own Chromium; only the platform and the agent are faked (agent.ts). The fake agent, told by
 * FEATRA_E2E_REPORT=proof, lists "/" for its criterion through the real `update_card` and moves the story to In Review;
 * it takes no screenshot itself.
 */
test("Screenshots: a story moved to review gets its page captured from the dev server, shown by its criterion", async () => {
  const userData = await tempUserData();
  const repo = await project();
  const bin = await standInClaude();
  const url = `http://127.0.0.1:${await freePort()}`;
  let running: ElectronApplication | undefined;
  try {
    const { app, page } = await launch(userData.dir, {
      FEATRA_PROJECT_DIR: repo.dir,
      FEATRA_E2E_AGENT_SDK: FAKE_SDK,
      FEATRA_E2E_REPORT: "proof",
      [PATH_KEY]: bin.path,
    });
    running = app;
    await atReviewSize(app, page);
    // AC1: the project's proof is a setting; the user sets it, and the dev server, in Project settings.
    await setProof(page, "Screenshots", url);
    await expect
      .poll(() => readFile(join(repo.dir, ".featra", "config.yaml"), "utf8"))
      .toMatch(/^proof: screenshots$/m);

    const draft = await draftInNewChat(page, "FEAT-2");
    await draft.getByRole("button", { name: "Approve", exact: true }).click();
    // Approve commits the draft's cards; the proof just set stays an uncommitted project setting, as Settings leaves it.
    await expect
      .poll(() => git(repo.dir, "status", "--porcelain", "--", ".featra/cards"), { timeout: 30_000 })
      .toBe("");
    await draft.getByRole("button", { name: "Start", exact: true }).click();
    await expect.poll(() => git(repo.dir, "branch", "--format=%(refname:short)")).toContain("feature/2-shaping");

    const nav = page.getByRole("navigation", { name: "Featra" });
    await nav.getByRole("button", { name: "Work" }).click();
    await page.getByRole("button", { name: "Shaping", exact: true }).click();
    const row = page.getByRole("row", { name: /Draft a feature/ });
    await row.getByRole("button", { name: /^Start STORY-\d+$/ }).click();

    // AC2, AC4: on the move to review Featra starts the dev server in the story's worktree and captures the listed page
    // in Electron's own Chromium; the screenshot lands in the story's evidence folder, linked to its criterion.
    const { id, folder } = await awaitStoryWorktree(repo.dir, "draft-a-feature");
    await row.getByRole("button", { name: "Draft a feature" }).click();
    const card = pane(page, id);
    const shot = card.getByRole("button", { name: "Open ac1-page.png" });
    await expect(shot).toBeVisible({ timeout: 60_000 });
    const png = await readFile(join(folder, ".featra", "evidence", "FEAT-2", id, "ac1-page.png"));
    expect([...png.subarray(1, 4)].map((b) => String.fromCharCode(b)).join("")).toBe("PNG");

    // AC5: the screenshot shows next to its criterion, as attached evidence does, and opens full size.
    await expect(card.getByRole("button", { name: "AC 1: The draft shows in Work" })).toBeVisible();
    await uxShot(page, "feat9-proof-thumbnail", shot);
    await shot.click();
    const viewer = page.getByRole("dialog", { name: "Screenshot ac1-page.png" });
    await expect(viewer.getByRole("img", { name: "ac1-page.png" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);

    // The capture is done before update_card answers: the agent's turn ends with that answer, and the Dev Lead hears it.
    await page.getByRole("region", { name: "Chats" }).locator(".chat-row").first().click();
    const log = page.getByRole("log", { name: "Chat" });
    await expect(log).toContainText(`${id} ended: Tool said:`, { timeout: 30_000 });
    await expect(log).toContainText("You said: [Featra notice");

    // TEMPORARY diagnostic (Windows close hang): lists which of the app's processes outlive its quit.
    await watchQuit(app);
    // Quitting stops the dev server Featra started.
    await app.close();
    await expect
      .poll(() =>
        fetch(url).then(
          () => "answers",
          () => "stopped",
        ),
      )
      .toBe("stopped");
  } finally {
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
});
