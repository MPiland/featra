import { expect, test, type Page } from "@playwright/test";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempProject, tempUserData } from "./app.ts";

/**
 * STORY-46: an agent's question as a card, in the real app with its real local server. Only the platform and the agent
 * are faked (agent.ts): a stand-in `claude` on the PATH, and fake-agent-sdk.mjs as the Agent SDK's `query`, which asks an
 * AskUserQuestion through canUseTool, waits for the answers, and says back what it was given.
 */
const log = (page: Page) => page.getByRole("log", { name: "Chat" });
const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
const card = (page: Page) => log(page).getByRole("form", { name: "Question" });
const set = (page: Page, question: string) => card(page).getByRole("group", { name: new RegExp(question) });
const dot = (page: Page) => page.getByRole("region", { name: "Chats" }).locator(".chat-dot");

test("the agent asks a question: the chat waits with a dot, the card takes the answers, and the agent goes on", async () => {
  const userData = await tempUserData();
  const project = await tempProject("version: 1\n");
  const bin = await standInClaude();
  const { app, page } = await launch(userData.dir, {
    FEATRA_PROJECT_DIR: project.dir,
    FEATRA_E2E_AGENT_SDK: FAKE_SDK,
    [PATH_KEY]: bin.path,
  });
  try {
    await page.getByRole("button", { name: "New chat" }).click();
    await page
      .getByRole("dialog", { name: "New chat" })
      .getByRole("button", { name: /^Developer/ })
      .click();
    await expect(page.getByRole("region", { name: "Developer" })).toBeVisible();

    // AC1, AC4: the card shows each question with its options and Other, and the chat is marked waiting.
    await composer(page).fill("question me");
    await composer(page).press("Enter");
    await expect(card(page)).toBeVisible();
    await expect(set(page, "Which colour").getByRole("radio")).toHaveCount(2);
    await expect(set(page, "Which features").getByRole("checkbox")).toHaveCount(2);
    await expect(set(page, "Which features").getByRole("textbox", { name: "Other" })).toBeVisible();
    await expect(dot(page)).toHaveAttribute("data-waiting", "question");
    await expect(log(page)).not.toContainText("Got:");
    await expect(card(page).getByRole("button", { name: "Submit" })).toBeDisabled();

    // AC2: one choice, several choices and the user's own words; Submit sends them, and the same turn goes on.
    await set(page, "Which colour").getByRole("radio", { name: /Red/ }).check();
    await set(page, "Which features")
      .getByRole("checkbox", { name: /Search/ })
      .check();
    await set(page, "Which features").getByRole("textbox", { name: "Other" }).fill("Print");
    await card(page).getByRole("button", { name: "Submit" }).click();
    await expect(log(page)).toContainText(
      'Got: "Which colour do you prefer?"="Red", "Which features?"="Search, Print"',
    );

    // AC3: the answered card collapses to the chosen answers, and the dot waits on the reply instead.
    await expect(card(page)).toHaveCount(0);
    await expect(log(page).getByText("Answered")).toBeVisible();
    await expect(log(page).locator(".chat-question-answers")).toHaveText(
      "Which colour do you prefer?RedWhich features?Search, Print",
    );
    await expect(dot(page)).toHaveAttribute("data-waiting", "reply");
  } finally {
    await app.close();
    await userData.dispose();
    await project.dispose();
    await bin.dispose();
  }
});
