import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type ElectronApplication } from "@playwright/test";
import { newCard, parseCard, serializeCard, setStatus } from "@featra/work-format";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { draftInNewChat } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";

/**
 * STORY-16: the burn-up in a feature's progress pane. The real app, its real local server, the real MCP process and
 * real git; only the platform and the agent are faked (agent.ts). Before Start the pane says when the chart starts;
 * after Start it shows the chart; then a story is moved to Done and another is added in a checkout of the feature's
 * branch, with no commit, and the chart's numbers follow.
 */
test("The burn-up starts when the feature goes in progress and follows card changes nobody committed", async () => {
  const userData = await tempUserData();
  const repo = await project();
  const bin = await standInClaude();
  const side = join(repo.dir, "..", `${repo.dir.split(/[\\/]/).at(-1)}-burn-up`);
  let checkedOut = false;
  let running: ElectronApplication | undefined;
  try {
    const { app, page } = await launch(userData.dir, {
      FEATRA_PROJECT_DIR: repo.dir,
      FEATRA_E2E_AGENT_SDK: FAKE_SDK,
      [PATH_KEY]: bin.path,
    });
    running = app;
    const draft = await draftInNewChat(page, "FEAT-2");
    await draft.getByRole("button", { name: "Approve", exact: true }).click();
    await expect.poll(() => git(repo.dir, "status", "--porcelain")).toBe("");

    // AC6: before the feature goes in progress, the pane says the chart starts then.
    await page.getByRole("button", { name: "Feature progress", exact: true }).click();
    const progress = page.getByRole("complementary", { name: "FEAT-2 progress" });
    await expect(progress).toContainText("The chart starts when the feature goes in progress.");
    await expect(progress.getByRole("img", { name: /^Scope / })).toHaveCount(0);

    // Start, from the feature's card, which the pane opens.
    await progress.getByRole("button", { name: "FEAT-2 card" }).click();
    const card = page.getByRole("complementary", { name: "FEAT-2 card" });
    await card.getByRole("button", { name: "Start", exact: true }).click();
    await expect.poll(() => git(repo.dir, "branch", "--format=%(refname:short)")).toContain("feature/2-shaping");

    // AC1, AC3: after Start the chart shows, from the baseline, counting the feature's two stories.
    await page.getByRole("button", { name: "Feature progress", exact: true }).click();
    await expect(progress).toBeVisible();
    await expect(progress.getByRole("region", { name: "Burn-up chart" })).toBeVisible();
    await expect(progress.getByRole("img", { name: /^Scope 2 · Done 0, since \w{3} \d{1,2}$/ })).toBeVisible();
    await expect(progress).not.toContainText("The chart starts when the feature goes in progress.");

    // AC4: in a checkout of the feature's branch, a story moves to Done and a story is added, and nothing is committed.
    git(repo.dir, "worktree", "add", "-q", side, "feature/2-shaping");
    checkedOut = true;
    const at = new Date(Date.now() + 1000).toISOString();
    const first =
      git(side, "ls-files", ".featra/cards")
        .split("\n")
        .find((f) => f.includes("STORY-1-")) ?? "";
    const done = setStatus(parseCard(git(side, "show", `HEAD:${first}`)), "Done", "user", at);
    const added = newCard(
      { id: "STORY-3", type: "story", title: "Share the draft", status: "New", parent: "FEAT-2", origin: "added" },
      "user",
      at,
    );
    await mkdir(join(side, ".featra", "cards"), { recursive: true });
    const chart = progress.getByRole("img", { name: /^Scope 3 · Done 1, since / });
    // The server watches the new checkout once it has seen it; writing again covers an edit made before that.
    await expect(async () => {
      await writeFile(join(side, first), serializeCard(done), "utf8");
      await writeFile(join(side, ".featra", "cards", "STORY-3-share-the-draft.md"), serializeCard(added), "utf8");
      await expect(chart).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
    expect(git(side, "status", "--porcelain")).not.toBe("");
    // AC2: the chart ends at the feature's own count.
    await expect(progress).toContainText("1 of 3 stories done");
    await app.close();
  } finally {
    await running?.close().catch(() => {});
    if (checkedOut) {
      try {
        git(repo.dir, "worktree", "remove", "--force", side);
      } catch {
        // The temporary repository goes with it below.
      }
    }
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
});
