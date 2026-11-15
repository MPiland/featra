import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type ElectronApplication } from "@playwright/test";
import { newCard, parseCard, serializeCard, setStatus } from "@featra/work-format";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { draftInNewChat } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";

/**
 * STORY-15: a started feature's bar says what it stands for, and a story added after Start shows as added scope. The
 * real app, its real local server, the real MCP process and real git; only the platform and the agent are faked
 * (agent.ts). The feature's branch moves on as a story session would move it: a commit in another worktree that adds
 * a story and starts one of the planned ones.
 */
test("A started feature's bar shows its breakdown on focus, and a story added after Start counts as added", async () => {
  const userData = await tempUserData();
  const repo = await project();
  const bin = await standInClaude();
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
    await expect.poll(() => git(repo.dir, "status", "--porcelain"), { timeout: 30_000 }).toBe("");
    await draft.getByRole("button", { name: "Start", exact: true }).click();
    await expect.poll(() => git(repo.dir, "branch", "--format=%(refname:short)")).toContain("feature/2-shaping");

    await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Work" }).click();
    const work = page.getByRole("region", { name: "Work list" });
    const row = work.getByRole("row", { name: /Shaping/ }).first();
    // AC2: the stories drafted before Start are planned scope.
    await expect(row.getByRole("img", { name: "2 not started" })).toBeVisible();
    await expect(row.getByRole("cell").last()).toHaveText("—");

    // After Start, a story is added to the feature and a planned one goes in progress, on the feature's branch.
    const side = join(repo.dir, "..", `${repo.dir.split(/[\\/]/).at(-1)}-side`);
    git(repo.dir, "worktree", "add", "-q", side, "feature/2-shaping");
    try {
      const cards = join(side, ".featra", "cards");
      const at = new Date(Date.now() + 1000).toISOString();
      const first =
        git(side, "ls-files", ".featra/cards")
          .split("\n")
          .find((f) => f.includes("STORY-1-")) ?? "";
      const moved = setStatus(parseCard(git(side, "show", `HEAD:${first}`)), "In Progress", "user", at);
      await writeFile(join(side, first), serializeCard(moved), "utf8");
      const added = newCard(
        { id: "STORY-3", type: "story", title: "Share the draft", status: "New", parent: "FEAT-2", origin: "added" },
        "user",
        at,
      );
      await writeFile(join(cards, "STORY-3-share-the-draft.md"), serializeCard(added), "utf8");
      git(side, "add", "-A");
      git(side, "commit", "-q", "-m", "STORY-3: added");
    } finally {
      git(repo.dir, "worktree", "remove", "--force", side);
    }

    // AC4: the Scope cell says what was added, and the story row says it was added.
    await expect(row.getByRole("cell").last()).toHaveText("+1 added: 1 story", { timeout: 30_000 });
    await work.getByRole("button", { name: "Shaping", exact: true }).click();
    await expect(work.getByRole("row", { name: /Share the draft/ })).toContainText("added");

    // AC1: the bar is a Tab stop named by its breakdown, and shows it while focused; Escape hides it.
    const bar = row.getByRole("img", { name: "1 in progress · 2 not started" });
    await bar.focus();
    const tip = row.locator(".pbar-tip");
    await expect(tip).toHaveText("1 in progress · 2 not started");
    await page.keyboard.press("Escape");
    await expect(tip).toHaveCount(0);
    await bar.blur();
    await bar.hover();
    await expect(tip).toBeVisible();

    // AC1: the features with no epic say theirs by status.
    await expect(
      page.getByRole("region", { name: "No epic" }).getByRole("img", { name: "1 done · 1 in progress" }),
    ).toBeVisible();
    await app.close();
  } finally {
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
});
