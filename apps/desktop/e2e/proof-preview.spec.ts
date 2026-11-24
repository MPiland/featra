import { expect, test, type ElectronApplication } from "./fixtures.ts";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, previews, tempUserData } from "./app.ts";
import { draftInNewChat, pane } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";
import { freePort, setProof } from "./proof-setup.ts";
import { awaitStoryWorktree } from "./story-worktree.ts";
import { atReviewSize, uxShot } from "./ux-shot.ts";

/**
 * STORY-25: Preview starts a story's dev server in its worktree and opens it in a Featra window. The real app, its real
 * local server, real git and a real dev server (fixture-dev-server.mjs, run by the command the user saved); only the
 * platform and the agent are faked (agent.ts).
 */
test("Preview: the story's dev server starts in its worktree and opens in a Featra window", async () => {
  const userData = await tempUserData();
  const repo = await project();
  const bin = await standInClaude();
  const url = `http://127.0.0.1:${await freePort()}`;
  let running: ElectronApplication | undefined;
  try {
    const { app, page } = await launch(userData.dir, {
      FEATRA_PROJECT_DIR: repo.dir,
      FEATRA_E2E_AGENT_SDK: FAKE_SDK,
      [PATH_KEY]: bin.path,
    });
    running = app;
    await atReviewSize(app, page);
    await setProof(page, "Preview", url);

    const draft = await draftInNewChat(page, "FEAT-2");
    await draft.getByRole("button", { name: "Approve", exact: true }).click();
    // Approve commits the draft's cards; the proof just set stays an uncommitted project setting, as Settings leaves it.
    await expect
      .poll(() => git(repo.dir, "status", "--porcelain", "--", ".featra/cards"), { timeout: 30_000 })
      .toBe("");
    await draft.getByRole("button", { name: "Start", exact: true }).click();
    await expect.poll(() => git(repo.dir, "branch", "--format=%(refname:short)")).toContain("feature/2-shaping");

    await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Work" }).click();
    await page.getByRole("button", { name: "Shaping", exact: true }).click();
    const row = page.getByRole("row", { name: /Draft a feature/ });
    await row.getByRole("button", { name: /^Start STORY-\d+$/ }).click();
    const { id } = await awaitStoryWorktree(repo.dir, "draft-a-feature");
    await row.getByRole("button", { name: "Draft a feature" }).click();
    const card = pane(page, id);
    const preview = card.getByRole("button", { name: "Preview", exact: true });
    await expect(preview).toBeVisible();
    await uxShot(page, "feat9-proof-preview-button", preview);

    // Preview: the dev server answers at its URL, and a Featra window shows it, titled for the story.
    await preview.click();
    await expect.poll(() => previews(app), { timeout: 60_000 }).toEqual([{ url, title: `Preview ${id}` }]);
    const shown = () => app.windows().find((w) => w.url().startsWith(url));
    await expect.poll(() => shown() !== undefined).toBe(true);
    const window = shown()!;
    await expect(window.getByRole("heading", { name: "Draft a feature" })).toBeVisible();
    await uxShot(window, "feat9-proof-preview");

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
