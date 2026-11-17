import { mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, join, relative } from "node:path";
import { expect, test, type ElectronApplication } from "@playwright/test";
import { evidenceState, parseCard, provenAt, serializeCard } from "@featra/work-format";
import { checkRun, fakeGh, junitXml } from "../../../packages/server/test/fake-gh.ts";
import { FAKE_SDK, PATH_KEY, standInClaude, tempDir } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { draftInNewChat, pane } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";
import { awaitStoryWorktree } from "./story-worktree.ts";
import { uxShot } from "./ux-shot.ts";

/**
 * STORY-61: holding a story back from auto-merge. The real app, its real local server and real git; only the platform,
 * the agent (agent.ts) and GitHub are faked: `gh` is a stand-in on the PATH (fake-gh.cjs) whose workflow run for the
 * PR's head holds a JUnit report, and the remote is a bare repository on disk whose path names github.com. Auto-merge
 * is on by default. The user holds the story on its Work row while it is in review; CI passes and proves every
 * criterion, and it doesn't merge. Hold turned off in its card pane, it merges on its own.
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

test("A held story doesn't merge on its own until Hold is turned off", async () => {
  const userData = await tempUserData();
  const repo = await project("version: 1\nchecksWhere: ci\ntestReportArtifact: test-report-*\n");
  const github = await tempDir("featra-github-");
  const remote = join(github.dir, "github.com", "acme", "app.git").replace(/\\/g, "/");
  await mkdir(remote, { recursive: true });
  git(remote, "init", "-q", "--bare");
  git(repo.dir, "remote", "add", "origin", remote);
  const gh = await fakeGh({ remote });
  const bin = await standInClaude();
  let running: ElectronApplication | undefined;
  try {
    const { app, page } = await launch(userData.dir, {
      FEATRA_PROJECT_DIR: repo.dir,
      FEATRA_E2E_AGENT_SDK: FAKE_SDK,
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
    const { branch, id, folder, file } = await awaitStoryWorktree(repo.dir, "draft-a-feature");

    await linkTests(file);
    await writeFile(join(folder, "work.txt"), "the story's work\n");
    git(folder, "add", "-A");
    git(folder, "commit", "-q", "-m", "Draft a feature");

    await row.getByRole("button", { name: "Draft a feature" }).click();
    const card = pane(page, id);
    await card.getByRole("button", { name: "Status: In Progress" }).click();
    await page.getByRole("listbox", { name: "Status" }).getByRole("option", { name: "In Review" }).click();
    await expect(card.getByRole("region", { name: "PR" }).getByRole("link", { name: "#1", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    const story = git(remote, "rev-parse", branch);

    // AC1, AC4: Hold on the story's row; the row says Held, and the card's history has the user's turn of it.
    const rowHold = row.getByRole("button", { name: `Hold ${id}` });
    await expect(rowHold).toHaveAttribute("aria-pressed", "false");
    await uxShot(page, "feat-8-hold-off-row-and-card", row);
    await rowHold.click();
    await expect(rowHold).toHaveAttribute("aria-pressed", "true");
    await expect(row).toContainText("Held");
    await expect
      .poll(async () => parseCard(await readFile(file, "utf8")).history.findLast((e) => e.field === "held"))
      .toMatchObject({ to: "held", by: "user" });
    await uxShot(page, "feat-8-hold-on-row-and-card", row);

    // AC2: CI passes for the PR's head and its report proves every criterion, and still it doesn't merge.
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
    await expect
      .poll(
        async () => {
          const now = parseCard(await readFile(file, "utf8"));
          return evidenceState(now).verified && provenAt(now, story);
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    // Auto-merge has had the proven story in front of it; give it time to (wrongly) act. A fixed wait, as nothing
    // deterministic says it is done: a held story is never picked, so auto-merge logs nothing, and the app exposes no
    // idle of its own. The merge world's tests prove the same with `idle()` (packages/server/test/story-hold.test.ts).
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(5_000);
    expect((await gh.calls()).some((c) => c.args.slice(0, 2).join(" ") === "pr merge")).toBe(false);
    await expect(row).not.toContainText("Merged");
    await expect(row.getByRole("button", { name: `Merge ${id}` })).toBeVisible();
    await uxShot(page, "feat-8-hold-on-proven-not-merged", row);

    // AC3: Hold turned off in the card pane, the story merges on its own.
    const paneHold = card.getByRole("button", { name: `Hold ${id}` });
    await expect(paneHold).toHaveAttribute("aria-pressed", "true");
    await paneHold.click();
    await expect(row).toContainText("Merged", { timeout: 30_000 });
    await uxShot(page, "feat-8-hold-off-merged-on-its-own", row);
    const merged = (await gh.calls()).find((c) => c.args.slice(0, 2).join(" ") === "pr merge");
    expect(merged?.args).toContain("--merge");
    const path = relative(folder, file).replace(/\\/g, "/");
    const onFeature = parseCard(git(repo.dir, "show", `feature/2-shaping:${path}`));
    expect(onFeature.history.filter((e) => e.field === "held").map((e) => [e.to, e.by])).toEqual([
      ["held", "user"],
      [null, "user"],
    ]);
    expect(onFeature.history.findLast((e) => e.field === "merged")?.by).toBe("system");
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
