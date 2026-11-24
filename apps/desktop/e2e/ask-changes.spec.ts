import { expect, test, type ElectronApplication } from "./fixtures.ts";
import { changesOf, parseCard } from "@featra/work-format";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { composer, draftInNewChat } from "./draft-chat.ts";
import { git, project } from "./draft-project.ts";
import { atReviewSize, uxShot } from "./ux-shot.ts";

const FEATURE = "feature/2-shaping";
const CARD = `${FEATURE}:.featra/cards/FEAT-2-shaping.md`;
const REASON = "Rename the Save button to Keep.";
/** What the fake Dev Lead replies through mark_changes_handled (CHANGES_HANDLED in fake-agent-turns.mjs). */
const REPLY = "Renamed the Save button to Keep.";

/**
 * STORY-71: "Not yet" on a feature's review screen. The real app, its real local server, the real MCP process and real
 * git; only the platform and the agent are faked (agent.ts). A Dev Lead chat drafts FEAT-2, the user approves and
 * starts it, then says "Not yet" with a reason on its review screen: the reason reaches that chat as the user's
 * message, is logged on the feature's branch, and the screen shows "Changes asked" with it. The Dev Lead then marks
 * the changes handled through the MCP's mark_changes_handled: its reply shows on the screen and "Changes asked" clears.
 */
test("Not yet with a reason: Changes asked shows, the Dev Lead marks it handled, and its reply shows", async () => {
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
    await atReviewSize(app, page);
    const draft = await draftInNewChat(page, "FEAT-2");
    await draft.getByRole("button", { name: "Approve", exact: true }).click();
    await expect.poll(() => git(repo.dir, "status", "--porcelain"), { timeout: 30_000 }).toBe("");
    await draft.getByRole("button", { name: "Start", exact: true }).click();
    await expect.poll(() => git(repo.dir, "branch", "--format=%(refname:short)")).toContain(FEATURE);

    // AC1: "Not yet" beside Approve takes the reason.
    await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Work" }).click();
    await page.getByRole("button", { name: "Review FEAT-2" }).click();
    const screen = page.getByRole("region", { name: "Review FEAT-2" });
    const approve = screen.getByRole("button", { name: "Approve FEAT-2" });
    await expect(approve).toBeVisible();
    await screen.getByRole("button", { name: "Not yet" }).click();
    const form = screen.getByRole("form", { name: "Not yet" });
    await form.getByRole("textbox", { name: "What to change" }).fill(REASON);
    await form.getByRole("button", { name: "Send" }).click();

    // AC2: the reason is logged on the feature's branch, and the screen shows "Changes asked" with it.
    const asked = screen.getByRole("region", { name: "Changes asked" });
    await expect(asked).toContainText(REASON, { timeout: 30_000 });
    await expect(asked.getByRole("status")).toHaveText("Changes asked");
    // AC5: Approve stays where it was.
    await expect(approve).toBeVisible();
    expect(git(repo.dir, "log", "-1", "--format=%s", FEATURE)).toBe("FEAT-2: changes asked");
    expect(parseCard(git(repo.dir, "show", CARD)).history.at(-1)).toMatchObject({
      field: "changes-asked",
      to: REASON,
      by: "user",
    });
    await uxShot(page, "feat9-changes-asked", asked);

    // AC1: the reason reached the Dev Lead's chat as the user's message.
    await page.getByRole("region", { name: "Chats" }).locator(".chat-row").first().click();
    const log = page.getByRole("log", { name: "Chat" });
    await expect(log).toContainText(`Changes asked on FEAT-2: ${REASON}`);
    await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0, { timeout: 20_000 });

    // AC3: the Dev Lead marks the changes handled through the MCP, saying what it did.
    await expect(composer(page)).toBeEditable();
    await composer(page).fill("mark_changes_handled");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(log).toContainText("Tool said: Marked the changes on FEAT-2 handled.", { timeout: 30_000 });
    expect(git(repo.dir, "log", "-1", "--format=%s", FEATURE)).toBe("FEAT-2: changes handled by the Dev Lead");
    expect(changesOf(parseCard(git(repo.dir, "show", CARD)))?.reply?.text).toBe(REPLY);

    // The review screen shows the reply, and "Changes asked" is gone.
    await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Work" }).click();
    await page.getByRole("button", { name: "Review FEAT-2" }).click();
    const made = screen.getByRole("region", { name: "Changes made" });
    await expect(made).toContainText(REPLY, { timeout: 30_000 });
    await expect(made).toContainText("Written by the Dev Lead");
    await expect(screen.getByRole("region", { name: "Changes asked" })).toHaveCount(0);
    await expect(approve).toBeVisible();
    await uxShot(page, "feat9-changes-handled", made);
    await app.close();
  } finally {
    // Close the app first: a failing step must fail on its own, not hang the cleanup on files the app still holds.
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
});
