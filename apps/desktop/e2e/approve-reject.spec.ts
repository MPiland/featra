import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type ElectronApplication } from "@playwright/test";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { draftInNewChat, pane } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";

/**
 * STORY-51: the user approves a draft (its cards are committed to main, nothing is pushed) and rejects another (its
 * files are deleted). The real app, its real local server, the real MCP process and real git; only the platform and the
 * agent are faked (agent.ts), as in send-back.spec.ts. The project has no hooks, so the commit is plain.
 */
/** The draft's card files on disk, by id prefix. */
const onDisk = async (dir: string, prefix: string) =>
  (await readdir(join(dir, ".featra", "cards"))).filter((n) => n.startsWith(`${prefix}-`));

test("Approve commits the draft's cards to main without pushing and takes the buttons away; Reject deletes another draft's files", async () => {
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
    const before = git(repo.dir, "rev-list", "--count", "HEAD");
    const draft = await draftInNewChat(page, "FEAT-2");
    // A draft is uncommitted: git hasn't seen its cards.
    expect(git(repo.dir, "status", "--porcelain")).toContain("FEAT-2");

    // AC1: Approve acts at once (no question), and commits the feature and its stories to main.
    await draft.getByRole("button", { name: "Approve", exact: true }).click();
    await expect.poll(() => git(repo.dir, "rev-list", "--count", "HEAD")).toBe(String(Number(before) + 1));
    expect(git(repo.dir, "log", "-1", "--format=%s")).toBe("FEAT-2: approved Shaping");
    const committed = git(repo.dir, "show", "--name-only", "--format=", "HEAD").split("\n");
    expect(committed).toHaveLength(3);
    expect(committed.every((p) => p.startsWith(".featra/cards/"))).toBe(true);
    // Everything of the draft is in git, and git is clean.
    expect(git(repo.dir, "status", "--porcelain")).toBe("");
    expect(git(repo.dir, "show", "HEAD:.featra/cards/FEAT-2-shaping.md")).toContain("status: approved");
    expect(git(repo.dir, "show", "HEAD:.featra/cards/FEAT-2-shaping.md")).toContain("baseline:");
    expect(git(repo.dir, "remote")).toBe("");

    // AC3: Send back and Reject are gone, Approve too, and the chat stays open.
    for (const name of ["Approve", "Reject", "Send back…"])
      await expect(draft.getByRole("button", { name, exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Dev Lead" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Review draft FEAT-2" })).toHaveCount(0);

    // AC2: a second draft, rejected after a question: its files are gone and git has nothing from it.
    const second = await draftInNewChat(page, "FEAT-3");
    expect(git(repo.dir, "status", "--porcelain")).toContain("FEAT-3");
    await second.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(second.getByText("Delete FEAT-3 and its 2 stories?")).toBeVisible();
    await second.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(pane(page, "FEAT-3")).toHaveCount(0);
    await expect.poll(() => git(repo.dir, "status", "--porcelain")).toBe("");
    expect(await onDisk(repo.dir, "FEAT-3")).toEqual([]);
    expect(await onDisk(repo.dir, "FEAT-2")).toHaveLength(1);
    expect(git(repo.dir, "rev-list", "--count", "HEAD")).toBe(String(Number(before) + 1));
    await expect(page.getByRole("region", { name: "Dev Lead" })).toBeVisible();
    await app.close();
  } finally {
    // Close the app first: a failing step must fail on its own, not hang the cleanup on files the app still holds.
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
});
