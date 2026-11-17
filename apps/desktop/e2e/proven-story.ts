import { mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { expect, type ElectronApplication, type Page } from "@playwright/test";
import { parseCard, serializeCard } from "@featra/work-format";
import { checkRun, fakeGh, junitXml, type FakeGhState } from "../../../packages/server/test/fake-gh.ts";
import { FAKE_SDK, PATH_KEY, standInClaude, tempDir } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { atReviewSize } from "./ux-shot.ts";
import { draftInNewChat, pane } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";
import { awaitStoryWorktree } from "./story-worktree.ts";

/**
 * The auto-merge journeys' world (STORY-59, STORY-60): the real app, its real local server and real git; only the
 * platform, the agent (agent.ts) and GitHub are faked: `gh` is a stand-in on the PATH (fake-gh.cjs) whose workflow run
 * for the PR's head holds a JUnit report, and the remote is a bare repository on disk whose path names github.com.
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

/** The app open on a project whose remote is GitHub's stand-in, with `gh` answering from `state`. */
export async function githubApp(state: Partial<FakeGhState> = {}) {
  const disposers: (() => Promise<unknown>)[] = [];
  const userData = await tempUserData();
  disposers.push(userData.dispose);
  const repo = await project("version: 1\nchecksWhere: ci\ntestReportArtifact: test-report-*\n");
  disposers.push(repo.dispose);
  const github = await tempDir("featra-github-");
  disposers.push(github.dispose);
  const remote = join(github.dir, "github.com", "acme", "app.git").replace(/\\/g, "/");
  await mkdir(remote, { recursive: true });
  git(remote, "init", "-q", "--bare");
  git(repo.dir, "remote", "add", "origin", remote);
  // GitHub's copy is the bare remote, so a PR's head commit is its branch's tip there, and a merge happens there.
  const gh = await fakeGh({ remote, ...state });
  disposers.push(gh.dispose);
  const bin = await standInClaude();
  disposers.push(bin.dispose);
  let app: ElectronApplication | undefined;
  const dispose = async () => {
    await app?.close().catch(() => {});
    for (const d of disposers.toReversed()) await d();
  };
  try {
    const launched = await launch(userData.dir, {
      FEATRA_PROJECT_DIR: repo.dir,
      FEATRA_E2E_AGENT_SDK: FAKE_SDK,
      // The stand-in gh comes first, so the real one and its login are never used.
      [PATH_KEY]: [gh.bin, bin.path].join(delimiter),
    });
    app = launched.app;
    // Its journeys take screens for design review, at the size they are reviewed at.
    await atReviewSize(app, launched.page);
    return { app, page: launched.page, repo, remote, gh, dispose };
  } catch (err) {
    await dispose();
    throw err;
  }
}

/**
 * A story of a started feature, with its work and linked tests committed in its worktree, moved to review (its PR
 * opens), whose CI checks then pass for the PR's head with a report that proves every criterion.
 */
export async function provenStory({ page, repo, remote, gh }: Awaited<ReturnType<typeof githubApp>>, at: Page = page) {
  const nav = at.getByRole("navigation", { name: "Featra" });
  const draft = await draftInNewChat(at, "FEAT-2");
  await draft.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => git(repo.dir, "status", "--porcelain"), { timeout: 30_000 }).toBe("");
  await draft.getByRole("button", { name: "Start", exact: true }).click();
  await expect.poll(() => git(repo.dir, "branch", "--format=%(refname:short)")).toContain("feature/2-shaping");

  await nav.getByRole("button", { name: "Work" }).click();
  await at.getByRole("button", { name: "Shaping", exact: true }).click();
  const row = at.getByRole("row", { name: /Draft a feature/ });
  await row.getByRole("button", { name: /^Start STORY-\d+$/ }).click();
  const { branch, id, folder, file } = await awaitStoryWorktree(repo.dir, "draft-a-feature");

  // The story's work and its linked tests, committed in its worktree as its session would.
  await linkTests(file);
  await writeFile(join(folder, "work.txt"), "the story's work\n");
  git(folder, "add", "-A");
  git(folder, "commit", "-q", "-m", "Draft a feature");

  // It goes to review: its branch is pushed and its PR opened.
  await row.getByRole("button", { name: "Draft a feature" }).click();
  const card = pane(at, id);
  await card.getByRole("button", { name: "Status: In Progress" }).click();
  await at.getByRole("listbox", { name: "Status" }).getByRole("option", { name: "In Review" }).click();
  const section = card.getByRole("region", { name: "PR" });
  await expect(section.getByRole("link", { name: "#1", exact: true })).toBeVisible({ timeout: 30_000 });
  const story = git(remote, "rev-parse", branch);
  const base = git(remote, "rev-parse", "feature/2-shaping");

  // CI's checks pass for the PR's head and its report proves every criterion; the window regains focus.
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
  await at.evaluate(() => window.dispatchEvent(new Event("focus")));
  return { row, card, id, branch, folder, file, story, base };
}
