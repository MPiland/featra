import { expect, test, type Page } from "@playwright/test";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { cardFile, project } from "./draft-project.ts";

/**
 * STORY-50: the user sends a draft back from the chat's draft pane. The real app, its real local server, the real MCP
 * process and real git; only the platform and the agent are faked (agent.ts), as in review-draft.spec.ts.
 */
const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
const pane = (page: Page, id: string) => page.getByRole("complementary", { name: `${id} card` });

test("Send back needs a reason, puts it in the chat as the user's message, and records it in the feature's history", async () => {
  const userData = await tempUserData();
  const repo = await project();
  const bin = await standInClaude();
  try {
    const { app, page } = await launch(userData.dir, {
      FEATRA_PROJECT_DIR: repo.dir,
      FEATRA_E2E_AGENT_SDK: FAKE_SDK,
      [PATH_KEY]: bin.path,
    });
    await page.getByRole("button", { name: "New chat" }).click();
    await page
      .getByRole("dialog", { name: "New chat" })
      .getByRole("button", { name: /^Dev Lead/ })
      .click();
    await composer(page).fill("draft a feature");
    await composer(page).press("Enter");
    const draft = pane(page, "FEAT-2");
    await expect(draft).toBeVisible();
    // The drafting turn has ended before the user answers it.
    await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0);

    // AC1: the form asks for a reason, and an empty or whitespace-only one can't be sent.
    await draft.getByRole("button", { name: "Send back…" }).click();
    const send = draft.getByRole("button", { name: "Send", exact: true });
    await expect(send).toBeDisabled();
    await draft.getByRole("textbox", { name: "Reason" }).fill("   ");
    await expect(send).toBeDisabled();
    expect(await cardFile(repo.dir, "FEAT-2")).not.toContain("sent-back");

    // AC2: with a reason, it reaches the chat as the user's message.
    await draft.getByRole("textbox", { name: "Reason" }).fill("Split the second story.");
    await expect(send).toBeEnabled();
    await send.click();
    await expect(
      page.locator(".chat-msg.user", { hasText: "Sent back FEAT-2: Split the second story." }),
    ).toBeVisible();
    await expect(draft.getByRole("form", { name: "Send back" })).toHaveCount(0);

    // AC3: the feature's history on disk records who sent it back and why.
    await expect.poll(async () => cardFile(repo.dir, "FEAT-2")).toContain("field: sent-back");
    const saved = await cardFile(repo.dir, "FEAT-2");
    expect(saved).toMatch(/field: sent-back\s+from: null\s+to: Split the second story\.\s+by: user/);
    await app.close();
  } finally {
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
});
