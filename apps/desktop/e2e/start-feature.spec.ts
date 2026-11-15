import { expect, test, type ElectronApplication } from "@playwright/test";
import { parseCard } from "@featra/work-format";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { draftInNewChat } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";

/**
 * STORY-52: the user starts an approved feature. The real app, its real local server, the real MCP process and real
 * git; only the platform and the agent are faked (agent.ts), as in approve-reject.spec.ts. The project has no hooks,
 * so the commit is plain. Main's checkout is never touched.
 */
test("Start makes feature/N-slug from main without touching main's checkout, and the feature is active on the branch", async () => {
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
    const main = git(repo.dir, "rev-parse", "main");

    // Start is offered where the approved feature shows, with no confirmation question.
    const start = draft.getByRole("button", { name: "Start", exact: true });
    await expect(start).toBeEnabled();
    await start.click();
    await expect(draft.getByRole("button", { name: "Start", exact: true })).toHaveCount(0);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    // AC1: the branch is made from main, the status change is its one commit, and main is as it was.
    await expect.poll(() => git(repo.dir, "branch", "--format=%(refname:short)")).toContain("feature/2-shaping");
    expect(git(repo.dir, "rev-list", "--count", "main..feature/2-shaping")).toBe("1");
    expect(git(repo.dir, "log", "-1", "--format=%s", "feature/2-shaping")).toBe("FEAT-2: started Shaping");
    expect(git(repo.dir, "rev-parse", "main")).toBe(main);
    expect(git(repo.dir, "symbolic-ref", "--short", "HEAD")).toBe("main");
    expect(git(repo.dir, "status", "--porcelain")).toBe("");
    expect(git(repo.dir, "remote")).toBe("");
    const started = parseCard(git(repo.dir, "show", "feature/2-shaping:.featra/cards/FEAT-2-shaping.md"));
    expect(started.status).toBe("active");
    expect(started.history.at(-1)).toMatchObject({ field: "status", from: "approved", to: "active", by: "user" });
    expect(git(repo.dir, "show", "main:.featra/cards/FEAT-2-shaping.md")).toContain("status: approved");

    // AC3: Work shows the feature as active, read from its branch; there is no way to start it twice.
    await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Work" }).click();
    await expect(page.getByRole("button", { name: "Open FEAT-2" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Work list" })).toContainText("Shaping");
    await app.close();
  } finally {
    // Close the app first: a failing step must fail on its own, not hang the cleanup on files the app still holds.
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
});
