import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { expect, test, type ElectronApplication } from "@playwright/test";
import { parseCard, serializeCard } from "@featra/work-format";
import { checkRun, fakeGh, junitXml } from "../../../packages/server/test/fake-gh.ts";
import { FAKE_SDK, PATH_KEY, standInClaude, tempDir } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { draftInNewChat, pane } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";

/**
 * STORY-57: criteria proven from the test report CI uploads. The real app, its real local server and real git; only
 * the platform, the agent (agent.ts) and GitHub are faked: `gh` is a stand-in on the PATH (fake-gh.cjs) whose workflow
 * run for the PR's head holds a JUnit report, and the remote is a bare repository on disk whose path names github.com.
 * The user names the report in Project settings; the story's PR checks finish; on focus the report is read and each
 * criterion shows whether its linked test passed, failed, or isn't in the report.
 */
const FILE = "packages/app/test/open.test.ts";
const ACS = [
  { text: "It opens", done: false, test: `${FILE}::open > opens` },
  { text: "It saves", done: false, test: `${FILE}::open > saves` },
  { text: "It closes", done: false, test: `${FILE}::open > closes` },
];

/** The story's criteria, as a session working on it would write them in its worktree. */
async function linkTests(folder: string, id: string) {
  const cards = join(folder, ".featra", "cards");
  const name = (await readdir(cards)).find((f) => f.startsWith(`${id}-`)) ?? "";
  const card = parseCard(await readFile(join(cards, name), "utf8"));
  await writeFile(join(cards, name), serializeCard({ ...card, acs: ACS }), "utf8");
}

test("Name CI's test report, and a story's PR checks finishing prove its criteria from it", async () => {
  const userData = await tempUserData();
  const repo = await project("version: 1\nchecksWhere: ci\n");
  const github = await tempDir("featra-github-");
  const remote = join(github.dir, "github.com", "acme", "app.git").replace(/\\/g, "/");
  await mkdir(remote, { recursive: true });
  git(remote, "init", "-q", "--bare");
  git(repo.dir, "remote", "add", "origin", remote);
  // GitHub's copy is the bare remote, so a PR's head commit is its branch's tip there.
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

    const draft = await draftInNewChat(page, "FEAT-2");
    await draft.getByRole("button", { name: "Approve", exact: true }).click();
    await expect.poll(() => git(repo.dir, "status", "--porcelain"), { timeout: 30_000 }).toBe("");
    await draft.getByRole("button", { name: "Start", exact: true }).click();
    await expect.poll(() => git(repo.dir, "branch", "--format=%(refname:short)")).toContain("feature/2-shaping");

    await nav.getByRole("button", { name: "Work" }).click();
    await page.getByRole("button", { name: "Shaping", exact: true }).click();
    const row = page.getByRole("row", { name: /Draft a feature/ });
    await row.getByRole("button", { name: /^Start STORY-\d+$/ }).click();
    await expect
      .poll(() => git(repo.dir, "branch", "--format=%(refname:short)"))
      .toMatch(/featra\/story-\d+-draft-a-feature/);
    const branch =
      git(repo.dir, "branch", "--format=%(refname:short)")
        .split("\n")
        .find((b) => b.startsWith("featra/story-")) ?? "";
    const id = `STORY-${/story-(\d+)-/.exec(branch)?.[1]}`;
    await linkTests(join(repo.dir, ".claude", "worktrees", `${id}-draft-a-feature`), id);

    // AC1: the user names the artifact CI uploads its JUnit report in.
    await nav.getByRole("button", { name: "Settings" }).click();
    await page
      .getByRole("navigation", { name: "Settings pages" })
      .getByRole("list", { name: "Project" })
      .getByRole("button", { name: "Workflow" })
      .click();
    const checks = page.getByRole("region", { name: "Checks" });
    await expect(checks.getByRole("radio", { name: "CI" })).toBeChecked();
    await checks.getByRole("textbox", { name: "CI test report" }).fill("test-report-*");
    await checks.getByRole("button", { name: "Save" }).click();
    await expect(checks.getByText("Saved")).toBeVisible();
    await expect.poll(() => readFile(join(repo.dir, ".featra", "config.yaml"), "utf8")).toContain("testReportArtifact");
    await nav.getByRole("button", { name: "Work" }).click();
    await page.getByRole("button", { name: "Shaping", exact: true }).click();

    // The story goes to review: its branch is pushed and its PR opened.
    await row.getByRole("button", { name: "Draft a feature" }).click();
    const card = pane(page, id);
    const acs = card.getByRole("region", { name: "Acceptance criteria" });
    await expect(acs).toContainText("It closes");
    await expect(acs).not.toContainText("Test passed");
    await card.getByRole("button", { name: "Status: In Progress" }).click();
    await page.getByRole("listbox", { name: "Status" }).getByRole("option", { name: "In Review" }).click();
    const section = card.getByRole("region", { name: "PR" });
    await expect(section.getByRole("link", { name: "#1", exact: true })).toBeVisible({ timeout: 30_000 });

    // AC2, AC3: CI's checks finish for the PR's head, with its report uploaded; the window regains focus.
    const head = git(remote, "rev-parse", branch);
    await gh.change((s) => {
      for (const pr of s.prs) pr.checks = [checkRun("FAILURE")];
      s.runs = [
        {
          id: 31,
          headSha: head,
          artifacts: {
            "test-report-unit": {
              "unit.xml": junitXml([
                [FILE, "open > opens", "passed"],
                [FILE, "open > saves", "failed"],
              ]),
            },
          },
        },
      ];
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(section).toContainText("Checks failing", { timeout: 30_000 });
    const ac = (text: string) => acs.getByRole("listitem").filter({ hasText: text });
    await expect(ac("It opens")).toContainText("Test passed", { timeout: 30_000 });
    await expect(ac("It saves")).toContainText("Test failed");
    await expect(ac("It closes")).toContainText("Not in the report");
    const report = section.getByRole("group", { name: "Test report" });
    await expect(report).toContainText('AC 2: "open saves" failed.');
    await expect(report).toContainText('AC 3: No test named "open closes" ran.');
    expect((await gh.calls()).some((c) => c.args.slice(0, 2).join(" ") === "run download")).toBe(true);
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
