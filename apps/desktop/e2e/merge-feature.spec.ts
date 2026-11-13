import { mkdir, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { expect, test, type ElectronApplication } from "@playwright/test";
import { newCard, parseCard, serializeCard, setStatus } from "@featra/work-format";
import { checkRun, fakeGh } from "../../../packages/server/test/fake-gh.ts";
import { FAKE_SDK, PATH_KEY, standInClaude, tempDir } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { pane } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";

const FEATURE = "feature/2-ship";
const PR = "https://github.com/acme/app/pull/1";
const AT = "2026-11-12T09:00:00Z";

/**
 * STORY-14: accepting a feature and merging it to main. The real app, its real local server and real git; only the
 * platform, the agent (agent.ts) and GitHub are faked: `gh` is a stand-in on the PATH (fake-gh.cjs) and the remote is
 * a bare repository on disk whose path names github.com. FEAT-2 is in progress on its branch with its one story Done.
 * Accept on its card opens its PR to main; once CI passes on the branch's commit, Merge to main merges the PR with a
 * merge commit, and main has the feature Done.
 */
test("Accept a feature: its PR to main opens, and once CI passes Merge to main merges it with a merge commit", async () => {
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
    await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Work" }).click();

    // AC1: every story is Done, so the feature's card opens from its row and offers Accept, with no confirmation.
    await page.getByRole("button", { name: "Open FEAT-2" }).click();
    const card = pane(page, "FEAT-2");
    await card.getByRole("button", { name: "Accept FEAT-2" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    // AC2: accepting pushes the feature branch and opens its PR to main.
    const section = card.getByRole("region", { name: "PR" });
    await expect(section.getByRole("link", { name: "#1", exact: true })).toBeVisible({ timeout: 30_000 });
    const [opened] = (await gh.load()).prs;
    expect(opened).toMatchObject({ url: PR, head: FEATURE, base: "main", state: "OPEN" });
    expect(parseCard(git(repo.dir, "show", `${FEATURE}:.featra/cards/FEAT-2-ship.md`)).pr).toBe(PR);

    // AC3: Merge to main shows once accepted, off with the reason while CI hasn't passed at the branch's commit.
    const merge = card.getByRole("button", { name: "Merge FEAT-2 to main" });
    await expect(merge).toBeDisabled({ timeout: 30_000 });
    await expect(card).toContainText("Checks haven't passed on its latest commit yet.", { timeout: 30_000 });

    // CI passes on the PR, and the window regaining focus reads it again: Merge to main is on.
    await gh.change((s) => {
      for (const pr of s.prs) pr.checks = [checkRun("SUCCESS")];
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(merge).toBeEnabled({ timeout: 30_000 });
    const tip = git(repo.dir, "rev-parse", FEATURE);
    const base = git(remote, "rev-parse", "main");

    // AC3: the merge is the PR's, with a merge commit, at the commit CI passed on.
    await merge.click();
    await expect.poll(async () => (await gh.load()).prs[0]?.state, { timeout: 30_000 }).toBe("MERGED");
    const merged = (await gh.calls()).find((c) => c.args.slice(0, 2).join(" ") === "pr merge");
    expect(merged?.args).toEqual(["pr", "merge", PR, "--merge", "--match-head-commit", tip]);
    expect(git(remote, "log", "-1", "--format=%P", "main").split(" ")).toEqual([base, tip]);

    // AC5: main has the feature's work and its cards, and the feature is Done there; its branch is kept.
    await expect
      .poll(() => parseCard(git(repo.dir, "show", "main:.featra/cards/FEAT-2-ship.md")).status, { timeout: 30_000 })
      .toBe("done");
    expect(git(repo.dir, "show", "main:feature.txt")).toBe("the feature's work");
    expect(git(repo.dir, "branch", "--list", FEATURE)).toContain(FEATURE);
    await expect(card.getByRole("button", { name: "Merge FEAT-2 to main" })).toHaveCount(0, { timeout: 30_000 });
    await expect(card.getByRole("alert")).toHaveCount(0);
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
