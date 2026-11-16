import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, join, relative } from "node:path";
import { expect, test, type ElectronApplication } from "@playwright/test";
import { parseCard, serializeCard } from "@featra/work-format";
import { checkRun, fakeGh, junitXml } from "../../../packages/server/test/fake-gh.ts";
import { FAKE_SDK, PATH_KEY, standInClaude, tempDir } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { draftInNewChat, pane } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";
import { awaitStoryWorktree } from "./story-worktree.ts";

/**
 * STORY-59: a Verified and Proven story merges into its feature on its own. The real app, its real local server and
 * real git; only the platform, the agent (agent.ts) and GitHub are faked: `gh` is a stand-in on the PATH
 * (fake-gh.cjs) whose workflow run for the PR's head holds a JUnit report, and the remote is a bare repository on disk
 * whose path names github.com. Auto-merge is on by default in Settings. The story goes to review (its PR opens), CI's
 * checks pass and its report proves every criterion, and the story merges with a merge commit without Merge or Accept.
 */
const FILE = "packages/app/test/open.test.ts";
const ACS = [
  { text: "It opens", done: false, test: `${FILE}::open > opens` },
  { text: "It saves", done: false, test: `${FILE}::open > saves` },
];

/** The story's criteria, as a session working on it would write them in its worktree. */
async function linkTests(file: string) {
  const card = parseCard(await readFile(file, "utf8"));
  await writeFile(file, serializeCard({ ...card, acs: ACS }), "utf8");
}

test("A Verified and Proven story merges into its feature on its own", async () => {
  const userData = await tempUserData();
  const repo = await project("version: 1\nchecksWhere: ci\ntestReportArtifact: test-report-*\n");
  const github = await tempDir("featra-github-");
  const remote = join(github.dir, "github.com", "acme", "app.git").replace(/\\/g, "/");
  await mkdir(remote, { recursive: true });
  git(remote, "init", "-q", "--bare");
  git(repo.dir, "remote", "add", "origin", remote);
  // GitHub's copy is the bare remote, so a PR's head commit is its branch's tip there, and a merge happens there.
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
    const nav = page.getByRole("navigation", { name: "Featra" });

    // AC4: Auto-merge is on by default, under the project's Workflow settings.
    await nav.getByRole("button", { name: "Settings" }).click();
    await page
      .getByRole("navigation", { name: "Settings pages" })
      .getByRole("list", { name: "Project" })
      .getByRole("button", { name: "Workflow" })
      .click();
    const review = page.getByRole("region", { name: "Progress and review" });
    await expect(review.getByRole("switch", { name: "Auto-merge stories" })).toHaveAttribute("aria-checked", "true");

    const draft = await draftInNewChat(page, "FEAT-2");
    await draft.getByRole("button", { name: "Approve", exact: true }).click();
    await expect.poll(() => git(repo.dir, "status", "--porcelain"), { timeout: 30_000 }).toBe("");
    await draft.getByRole("button", { name: "Start", exact: true }).click();
    await expect.poll(() => git(repo.dir, "branch", "--format=%(refname:short)")).toContain("feature/2-shaping");

    await nav.getByRole("button", { name: "Work" }).click();
    await page.getByRole("button", { name: "Shaping", exact: true }).click();
    const row = page.getByRole("row", { name: /Draft a feature/ });
    await row.getByRole("button", { name: /^Start STORY-\d+$/ }).click();
    const { branch, id, folder, file } = await awaitStoryWorktree(repo.dir, "draft-a-feature");

    // The story's work and its linked tests, committed in its worktree as its session would.
    await linkTests(file);
    await writeFile(join(folder, "work.txt"), "the story's work\n");
    git(folder, "add", "-A");
    git(folder, "commit", "-q", "-m", "Draft a feature");

    // It goes to review: its branch is pushed and its PR opened.
    await row.getByRole("button", { name: "Draft a feature" }).click();
    const card = pane(page, id);
    await card.getByRole("button", { name: "Status: In Progress" }).click();
    await page.getByRole("listbox", { name: "Status" }).getByRole("option", { name: "In Review" }).click();
    const section = card.getByRole("region", { name: "PR" });
    await expect(section.getByRole("link", { name: "#1", exact: true })).toBeVisible({ timeout: 30_000 });
    const story = git(remote, "rev-parse", branch);
    const base = git(remote, "rev-parse", "feature/2-shaping");

    // AC1, AC3: CI's checks pass for the PR's head and its report proves every criterion; the window regains focus.
    await gh.change((s) => {
      for (const pr of s.prs) pr.checks = [checkRun("SUCCESS")];
      s.runs = [
        {
          id: 41,
          headSha: story,
          artifacts: {
            "test-report-unit": {
              "unit.xml": junitXml([
                [FILE, "open > opens", "passed"],
                [FILE, "open > saves", "passed"],
              ]),
            },
          },
        },
      ];
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));

    // It merges on its own: no Merge, no Accept. The PR merges with a merge commit at the head CI checked.
    await expect(row).toContainText("Merged", { timeout: 30_000 });
    const merged = (await gh.calls()).find((c) => c.args.slice(0, 2).join(" ") === "pr merge");
    expect(merged?.args).toEqual([
      "pr",
      "merge",
      "https://github.com/acme/app/pull/1",
      "--merge",
      "--match-head-commit",
      story,
    ]);
    expect(git(remote, "log", "-1", "--format=%P", "feature/2-shaping").split(" ")).toEqual([base, story]);
    await expect(row.getByRole("button", { name: `Merge ${id}` })).toHaveCount(0);
    await expect.poll(() => existsSync(folder), { timeout: 30_000 }).toBe(false);
    const path = relative(folder, file).replace(/\\/g, "/");
    const onFeature = parseCard(git(repo.dir, "show", `feature/2-shaping:${path}`));
    expect(onFeature.history.findLast((e) => e.field === "merged")?.by).toBe("system");
    expect(onFeature.history.some((e) => e.field === "accepted")).toBe(false);
    await app.close();
  } finally {
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await github.dispose();
    await gh.dispose();
    await bin.dispose();
  }
});
