import { mkdir, rm, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { expect, test, type ElectronApplication } from "./fixtures.ts";
import {
  appendHistory,
  newCard,
  provenEvent,
  ranEvent,
  recordEvidence,
  serializeCard,
  setStatus,
  type Card,
} from "@featra/work-format";
import { fakeGh } from "../../../packages/server/test/fake-gh.ts";
import { FAKE_SDK, PATH_KEY, standInClaude, tempDir } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { composer } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";
import { atReviewSize, uxShot } from "./ux-shot.ts";

const FEATURE = "feature/2-review";
const DONE_BRANCH = "featra/story-2-summary";
const WIP_BRANCH = "featra/story-3-proof";
const PR = "https://github.com/acme/app/pull/5";
const CI_RUN = "https://github.com/acme/app/actions/runs/77";
const AT = "2026-11-12T09:00:00Z";

const proven = (card: Card, run: string) =>
  recordEvidence(recordEvidence(card, provenEvent(1), "system", AT), ranEvent(1, run), "system", AT);

/** A story of FEAT-2 with one criterion and its test, as its session left it. */
const story = (id: string, title: string, status: string, branch: string, extra: Partial<Card> = {}): Card => ({
  ...newCard({ id, type: "story", title, status, parent: "FEAT-2" }, "user", AT),
  description: `As a reviewer, I want to ${title.toLowerCase()}.`,
  acs: [{ text: `${title} on the screen`, done: true, test: `test/${id}.test.ts::review > shows` }],
  branch,
  ...extra,
});

/**
 * STORY-69: a feature's review screen. The real app, its real local server, the real MCP process and real git; only
 * the platform, the agent (agent.ts) and GitHub are faked: `gh` is a stand-in on the PATH (fake-gh.cjs) and the remote
 * is a bare repository on disk whose path names github.com. FEAT-2 is in progress with STORY-2 Done (proven by a CI
 * run, merged by its PR) and STORY-3 in progress in its worktree (proven by a local run). Review on the feature's row
 * opens the screen: its summary from cards and git, each criterion's proof and run, and the Files changed links. The
 * Dev Lead then writes a summary through write_summary, and it shows on the open screen.
 */
test("Review a feature: summary, proof and run links, Files changed, then the Dev Lead's summary", async () => {
  const userData = await tempUserData();
  const repo = await project();
  const github = await tempDir("featra-github-");
  const remote = join(github.dir, "github.com", "acme", "app.git").replace(/\\/g, "/");
  await mkdir(remote, { recursive: true });
  git(remote, "init", "-q", "--bare");
  git(repo.dir, "remote", "add", "origin", remote);

  const feature = setStatus(
    newCard({ id: "FEAT-2", type: "feature", title: "Review", status: "approved" }, "user", AT),
    "active",
    "user",
    AT,
  );
  const done = appendHistory(proven(story("STORY-2", "Show the summary", "Done", DONE_BRANCH, { pr: PR }), CI_RUN), {
    at: AT,
    field: "merged",
    from: DONE_BRANCH,
    to: FEATURE,
    by: "system",
  });
  const wip = proven(story("STORY-3", "Show each proof", "In Progress", WIP_BRANCH), "local");
  const cards = join(repo.dir, ".featra", "cards");
  await writeFile(join(cards, "FEAT-2-review.md"), serializeCard(feature), "utf8");
  await writeFile(join(cards, "STORY-2-show-the-summary.md"), serializeCard(done), "utf8");
  await writeFile(join(cards, "STORY-3-show-each-proof.md"), serializeCard(wip), "utf8");
  git(repo.dir, "add", "-A");
  git(repo.dir, "commit", "-q", "-m", "FEAT-2 in progress");
  git(repo.dir, "push", "-q", "origin", "main");
  // STORY-2's work, merged into the feature's branch by its PR.
  git(repo.dir, "branch", FEATURE);
  git(repo.dir, "checkout", "-q", "-b", DONE_BRANCH, FEATURE);
  await mkdir(join(repo.dir, "src"), { recursive: true });
  await writeFile(
    join(repo.dir, "src", "summary.ts"),
    "export const a = 1;\nexport const b = 2;\nexport const c = 3;\n",
  );
  git(repo.dir, "add", "-A");
  git(repo.dir, "commit", "-q", "-m", "STORY-2: the summary");
  git(repo.dir, "checkout", "-q", FEATURE);
  git(repo.dir, "merge", "-q", "--no-ff", "-m", "Merge pull request #5 from acme/featra/story-2-summary", DONE_BRANCH);
  git(repo.dir, "checkout", "-q", "main");
  // STORY-3 in progress in its own worktree, with a commit.
  const side = `${repo.dir}-story-3`;
  git(repo.dir, "worktree", "add", "-q", "-b", WIP_BRANCH, side, FEATURE);
  await writeFile(join(side, "src", "proof.ts"), "export const proof = 1;\nexport const run = 2;\n");
  git(side, "add", "-A");
  git(side, "commit", "-q", "-m", "STORY-3: the proof");

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

    // AC1: Review on the active feature's row opens its review screen in place of the list.
    await page.getByRole("button", { name: "Review FEAT-2" }).click();
    const screen = page.getByRole("region", { name: "Review FEAT-2" });
    await expect(screen.getByRole("heading", { name: "Review FEAT-2: Review" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Work list" })).toHaveCount(0);

    // AC2: each story's user story and stage, and the files and lines it changed, from git.
    const doneItem = screen.locator('[data-card="STORY-2"]');
    const wipItem = screen.locator('[data-card="STORY-3"]');
    await expect(doneItem).toContainText("As a reviewer, I want to show the summary.");
    await expect(doneItem).toContainText("Done");
    await expect(wipItem).toContainText("In Progress");
    await expect(doneItem).toContainText("1 file · +3 −0", { timeout: 30_000 });
    await expect(wipItem).toContainText("1 file · +2 −0", { timeout: 30_000 });
    // AC3, AC4: each criterion's test and result, and the run that proved it.
    await expect(doneItem).toContainText("test/STORY-2.test.ts::review > shows");
    await expect(doneItem.getByRole("link", { name: "CI run" })).toHaveAttribute("href", CI_RUN);
    await expect(wipItem.getByText("Local run")).toBeVisible();
    // AC5: the feature's checks, and Files changed for the feature and for the merged story's PR.
    await expect(screen.getByRole("region", { name: "Checks" })).toContainText("No checks run yet");
    await expect(screen.getByRole("link", { name: "Files changed: FEAT-2" })).toHaveAttribute(
      "href",
      `https://github.com/acme/app/compare/main...${FEATURE}`,
      { timeout: 30_000 },
    );
    await expect(doneItem.getByRole("link", { name: "Files changed: STORY-2" })).toHaveAttribute("href", `${PR}/files`);
    // AC6: no summary written yet, so no heading for one.
    await expect(screen.getByRole("region", { name: "Summary" })).toHaveCount(0);
    await uxShot(page, "feat9-review-screen", screen);

    // AC6: the Dev Lead writes the summary through write_summary, onto the feature's branch; its review shows it.
    await page.getByRole("button", { name: "New chat" }).click();
    const picker = page.getByRole("dialog", { name: "New chat" });
    await picker.getByRole("button", { name: /^Dev Lead/ }).click();
    await expect(picker).toBeHidden({ timeout: 20_000 });
    await expect(composer(page)).toBeEditable();
    await composer(page).fill("write_summary");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByRole("log", { name: "Chat" })).toContainText("Tool said: Wrote the summary of FEAT-2.");
    await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Work" }).click();
    await page.getByRole("button", { name: "Review FEAT-2" }).click();
    const summary = screen.getByRole("region", { name: "Summary" });
    await expect(summary).toContainText("Both stories are built.", { timeout: 30_000 });
    await expect(summary).toContainText("Written by the Dev Lead");
    await uxShot(page, "feat9-review-summary", summary);
    expect(git(repo.dir, "log", "-1", "--format=%s", FEATURE)).toBe("FEAT-2: summary by the Dev Lead");

    // Back returns to the Work list.
    await screen.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("region", { name: "Work list" })).toBeVisible();
    await app.close();
  } finally {
    await running?.close().catch(() => {});
    git(repo.dir, "worktree", "remove", "--force", side);
    await rm(side, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    await userData.dispose();
    await repo.dispose();
    await github.dispose();
    await gh.dispose();
    await bin.dispose();
  }
});
