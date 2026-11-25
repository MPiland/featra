import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type ElectronApplication, type Page } from "./fixtures.ts";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { composer, draftInNewChat, pane } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";
import { freePort, proofSettings, setProof } from "./proof-setup.ts";
import { awaitStoryWorktree } from "./story-worktree.ts";
import { atReviewSize, uxShot } from "./ux-shot.ts";

/**
 * STORY-73: before a story with screenshots moves to Acceptance, the Dev Lead that delegated it reviews them. The real
 * app, its real local server, the real MCP process, real git and a real dev server (fixture-dev-server.mjs); only the
 * platform and the agents are faked (agent.ts, fake-agent-design.mjs). With FEATRA_E2E_REPORT=design the story's
 * session lists "/" for its criterion, moves the story to In Review, where Featra captures the page, then tries to move
 * it on to Acceptance; with design-plain it attaches a text file instead, so it has no screenshots. The Dev Lead's
 * "design findings STORY-N: <findings>" and "design clear STORY-N" call update_card's designReview.
 */

type Report = "design" | "design-plain";
/** The Dev Lead's findings on the story's screenshots. */
const FINDINGS = "The header wraps at 1280 px.";

/** Launches the app on a new project whose proof captures screenshots from the fixture's dev server. */
async function withProject(report: Report, journey: (page: Page, repo: { dir: string }) => Promise<void>) {
  const userData = await tempUserData();
  const repo = await project();
  const bin = await standInClaude();
  const url = `http://127.0.0.1:${await freePort()}`;
  let running: ElectronApplication | undefined;
  try {
    const { app, page } = await launch(userData.dir, {
      FEATRA_PROJECT_DIR: repo.dir,
      FEATRA_E2E_AGENT_SDK: FAKE_SDK,
      FEATRA_E2E_REPORT: report,
      [PATH_KEY]: bin.path,
    });
    running = app;
    await atReviewSize(app, page);
    await setProof(page, "Screenshots", url);
    await expect
      .poll(() => readFile(join(repo.dir, ".featra", "config.yaml"), "utf8"))
      .toMatch(/^proof: screenshots$/m);
    await journey(page, repo);
    await app.close();
  } finally {
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
}

/** Drafts, approves and starts FEAT-2, then starts its first story from its Work row; its ID and card pane. */
async function startStory(page: Page, dir: string) {
  const draft = await draftInNewChat(page, "FEAT-2");
  await draft.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => git(dir, "status", "--porcelain", "--", ".featra/cards"), { timeout: 30_000 }).toBe("");
  await draft.getByRole("button", { name: "Start", exact: true }).click();
  await expect.poll(() => git(dir, "branch", "--format=%(refname:short)")).toContain("feature/2-shaping");
  await openWork(page);
  await page
    .getByRole("row", { name: /Draft a feature/ })
    .getByRole("button", { name: /^Start STORY-\d+$/ })
    .click();
  const { id } = await awaitStoryWorktree(dir, "draft-a-feature");
  const card = await openCard(page, id);
  return { id, card };
}

async function openWork(page: Page) {
  await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Work" }).click();
  // The Work list's feature-group toggle: the Dev Lead's chat is also named "Shaping".
  await page.getByRole("main", { name: "Work" }).getByRole("button", { name: "Shaping", exact: true }).click();
}

/** Opens the story's card pane from its Work row. */
async function openCard(page: Page, id: string) {
  await page
    .getByRole("row", { name: /Draft a feature/ })
    .getByRole("button", { name: "Draft a feature" })
    .click();
  const card = pane(page, id);
  await expect(card).toBeVisible();
  return card;
}

/**
 * The Dev Lead's chat, the first row (the story's session nests under it), and the user's message to it, once it has
 * heard `heard` (a notice) and its turn on it has ended.
 */
async function toDevLead(page: Page, heard: string, text: string) {
  await page.getByRole("region", { name: "Chats" }).locator(".chat-row").first().click();
  const log = page.getByRole("log", { name: "Chat" });
  await expect(log).toContainText(heard, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0, { timeout: 20_000 });
  await expect(composer(page)).toBeEditable();
  await composer(page).fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  return log;
}

test("Design review: the Dev Lead's findings reach the story's session and keep it in review until the Dev Lead clears it", async () => {
  await withProject("design", async (page, repo) => {
    const { id, card } = await startStory(page, repo.dir);

    // AC1: the screenshot is captured on the move to review, and the story waits there for the Dev Lead's review.
    await expect(card.getByRole("button", { name: "Open ac1-page.png" })).toBeVisible({ timeout: 60_000 });
    const review = card.getByRole("group", { name: "Design review" });
    await expect(review).toContainText("Design review: waiting", { timeout: 30_000 });
    await expect(card.getByRole("button", { name: "Status: In Review" })).toBeVisible();
    await uxShot(page, "feat9-design-review-waiting", review);

    // The Dev Lead is told the story waits, naming its screenshots; it records its findings through update_card.
    const log = await toDevLead(
      page,
      `${id} waits for design review: Screenshots in`,
      `design findings ${id}: ${FINDINGS}`,
    );
    await expect(log).toContainText("ac1-page.png");
    await expect(log).toContainText(`Tool said: Updated ${id}`, { timeout: 30_000 });

    // AC2: the findings reach the story's session as a message from the Dev Lead, and the story stays in review.
    await openWork(page);
    const row = page.getByRole("row", { name: /Draft a feature/ });
    await row.getByRole("button", { name: `Open the session of ${id}` }).click();
    const session = page.getByRole("log", { name: "Chat" });
    await expect(session).toContainText(`Design review of ${id}'s screenshots found:`, { timeout: 30_000 });
    await expect(session).toContainText(FINDINGS);
    await expect(session).toContainText("You said: Message from the Dev Lead:");
    await openWork(page);
    const again = await openCard(page, id);
    const sent = again.getByRole("group", { name: "Design review" });
    await expect(sent).toContainText("Design review: findings sent");
    await expect(sent).toContainText(FINDINGS);
    await expect(again.getByRole("button", { name: "Status: In Review" })).toBeVisible();
    await uxShot(page, "feat9-design-review-findings", sent);

    // The Dev Lead clears the review and moves the story on to Acceptance, in one call.
    const lead = await toDevLead(page, `${id} ended: You said: Message from the Dev Lead`, `design clear ${id}`);
    await expect(lead).toContainText(`Tool said: Updated ${id}`, { timeout: 30_000 });
    await openWork(page);
    const done = await openCard(page, id);
    await expect(done.getByRole("button", { name: "Status: Acceptance" })).toBeVisible({ timeout: 30_000 });
    const cleared = done.getByRole("group", { name: "Design review" });
    await expect(cleared).toContainText("Design review: cleared");
    await uxShot(page, "feat9-design-review-cleared", cleared);
  });
});

test("Design review: a story with no screenshots moves on to Acceptance without it", async () => {
  await withProject("design-plain", async (page, repo) => {
    const { card } = await startStory(page, repo.dir);
    // AC3: its session's move to Acceptance stands, and its card shows no design review.
    await expect(card.getByRole("button", { name: "Status: Acceptance" })).toBeVisible({ timeout: 60_000 });
    await expect(card.getByRole("group", { name: "Design review" })).toHaveCount(0);
  });
});

test("Design review: turned off in Settings, a story with screenshots moves on to Acceptance", async () => {
  await withProject("design", async (page, repo) => {
    // AC4: the switch is next to the proof, on by default for screenshots; the user turns it off.
    const section = await proofSettings(page);
    const toggle = section.getByRole("switch", { name: "Design review of screenshots" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect
      .poll(() => readFile(join(repo.dir, ".featra", "config.yaml"), "utf8"))
      .toMatch(/^designReview: false$/m);
    await uxShot(page, "feat9-design-review-settings", toggle);

    const { card } = await startStory(page, repo.dir);
    await expect(card.getByRole("button", { name: "Open ac1-page.png" })).toBeVisible({ timeout: 60_000 });
    await expect(card.getByRole("button", { name: "Status: Acceptance" })).toBeVisible({ timeout: 30_000 });
    await expect(card.getByRole("group", { name: "Design review" })).toHaveCount(0);
  });
});
