import { mkdir, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { expect, test, type ElectronApplication } from "./fixtures.ts";
import { evidenceState, FEATURE_END_MESSAGES, newCard, parseCard, serializeCard, setStatus } from "@featra/work-format";
import { checkRun, fakeGh } from "../../../packages/server/test/fake-gh.ts";
import { FAKE_SDK, PATH_KEY, standInClaude, tempDir } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { git, project } from "./draft-project.ts";
import { atReviewSize, uxShot } from "./ux-shot.ts";

const FEATURE = "feature/2-ship";
const PR = "https://github.com/acme/app/pull/1";
const AT = "2026-11-12T09:00:00Z";

/**
 * STORY-70: Approve on a feature's review screen records the user's Accept and merges the feature to main in one
 * click (it replaces STORY-14's Accept and Merge on the card pane). The real app, its real local server and real git;
 * only the platform, the agent (agent.ts) and GitHub are faked: `gh` is a stand-in on the PATH (fake-gh.cjs) and the
 * remote is a bare repository on disk whose path names github.com. FEAT-2 is in progress on its branch with its one
 * story Done, so its PR opens and its CI runs before Approve. Approve is off, saying why, until CI passes on the
 * branch's commit; then one click merges the PR with a merge commit, main has the feature Done with the Accept, and
 * the screen shows it merged.
 */
test("Approve a feature on its review screen: off until CI passes, then one click merges it to main", async () => {
  const userData = await tempUserData();
  const repo = await project("version: 1\nchecksWhere: ci\n");
  const github = await tempDir("featra-github-");
  const remote = join(github.dir, "github.com", "acme", "app.git").replace(/\\/g, "/");
  await mkdir(remote, { recursive: true });
  git(remote, "init", "-q", "--bare");
  git(repo.dir, "remote", "add", "origin", remote);

  // FEAT-2 in progress with its story Done, on main and on its branch, which has work of its own.
  const feature = setStatus(
    newCard({ id: "FEAT-2", type: "feature", title: "Ship", status: "approved" }, "user", AT),
    "active",
    "user",
    AT,
  );
  const story = newCard(
    { id: "STORY-2", type: "story", title: "Ship it", status: "Done", parent: "FEAT-2" },
    "user",
    AT,
  );
  const cards = join(repo.dir, ".featra", "cards");
  await writeFile(join(cards, "FEAT-2-ship.md"), serializeCard(feature), "utf8");
  await writeFile(join(cards, "STORY-2-ship-it.md"), serializeCard(story), "utf8");
  git(repo.dir, "add", "-A");
  git(repo.dir, "commit", "-q", "-m", "FEAT-2 in progress");
  git(repo.dir, "push", "-q", "origin", "main");
  git(repo.dir, "checkout", "-q", "-b", FEATURE);
  await writeFile(join(repo.dir, "feature.txt"), "the feature's work\n");
  git(repo.dir, "add", "feature.txt");
  git(repo.dir, "commit", "-q", "-m", "The feature's work");
  git(repo.dir, "checkout", "-q", "main");

  const gh = await fakeGh({ remote });
  const bin = await standInClaude();
  let running: ElectronApplication | undefined;
  try {
    const { app, page } = await launch(userData.dir, {
      FEATRA_PROJECT_DIR: repo.dir,
      FEATRA_E2E_AGENT_SDK: FAKE_SDK,
      // The stand-in gh comes first, so the real one and its login are never used.
      [PATH_KEY]: [gh.bin, bin.path].join(delimiter),
    });
    running = app;
    await atReviewSize(app, page);
    await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Work" }).click();
    await page.getByRole("button", { name: "Review FEAT-2" }).click();
    const screen = page.getByRole("region", { name: "Review FEAT-2" });
    await expect(screen.getByRole("heading", { name: "Review FEAT-2: Ship" })).toBeVisible();

    // Every story is finished, so the feature's PR to main opens on its own, before any Accept: its CI runs first.
    await expect.poll(async () => (await gh.load()).prs[0]?.url, { timeout: 30_000 }).toBe(PR);
    expect((await gh.load()).prs[0]).toMatchObject({ head: FEATURE, base: "main", state: "OPEN" });

    // AC2: Approve is off, with the reason beside it, while CI hasn't passed at the branch's commit.
    const approve = screen.getByRole("button", { name: "Approve FEAT-2" });
    await expect(approve).toBeDisabled({ timeout: 30_000 });
    await expect(screen.getByRole("group", { name: "Approve" })).toContainText(FEATURE_END_MESSAGES.pending, {
      timeout: 30_000,
    });
    await uxShot(page, "feat9-approve-waiting", approve);

    // CI passes on the PR, and the window regaining focus reads it again: Approve is on.
    await gh.change((s) => {
      for (const pr of s.prs) pr.checks = [checkRun("SUCCESS")];
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(approve).toBeEnabled({ timeout: 30_000 });
    await uxShot(page, "feat9-approve-ready", approve);
    const tip = git(repo.dir, "rev-parse", FEATURE);
    const base = git(remote, "rev-parse", "main");

    // AC1: one click, no confirmation, merges the PR with a merge commit at the commit CI passed on.
    await approve.click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect.poll(async () => (await gh.load()).prs[0]?.state, { timeout: 30_000 }).toBe("MERGED");
    const merged = (await gh.calls()).find((c) => c.args.slice(0, 2).join(" ") === "pr merge");
    expect(merged?.args).toEqual(["pr", "merge", PR, "--merge", "--match-head-commit", tip]);
    expect(git(remote, "log", "-1", "--format=%P", "main").split(" ")).toEqual([base, tip]);

    // AC5: main has the feature's work, and the feature Done with the user's Accept; the screen shows it merged.
    await expect
      .poll(() => parseCard(git(repo.dir, "show", "main:.featra/cards/FEAT-2-ship.md")).status, { timeout: 30_000 })
      .toBe("done");
    const done = parseCard(git(repo.dir, "show", "main:.featra/cards/FEAT-2-ship.md"));
    expect(evidenceState(done).accepted).toBe(true);
    expect(git(repo.dir, "show", "main:feature.txt")).toBe("the feature's work");
    await expect(screen.getByRole("status").filter({ hasText: "Merged to main" })).toBeVisible({ timeout: 30_000 });
    await expect(approve).toHaveCount(0);
    await expect(screen.getByRole("alert")).toHaveCount(0);
    await uxShot(page, "feat9-approve-merged", screen.getByRole("group", { name: "Approve" }));
    await app.close();
  } finally {
    // Close the app first: a failing step must fail on its own, not hang the cleanup on files the app still holds.
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await github.dispose();
    await gh.dispose();
    await bin.dispose();
  }
});
