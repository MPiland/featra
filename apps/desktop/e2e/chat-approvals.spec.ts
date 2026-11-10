import { expect, test, type Page } from "@playwright/test";
import { denyMessage } from "@featra/work-format";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempProject, tempUserData } from "./app.ts";

/**
 * STORY-45: inline tool approvals in the real app with its real local server. Only the platform and the agent are
 * faked (agent.ts): a stand-in `claude` on the PATH, and fake-agent-sdk.mjs as the Agent SDK's `query`, which asks
 * about each Bash call through canUseTool and waits for the answer.
 */
const log = (page: Page) => page.getByRole("log", { name: "Chat" });
const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
const prompt = (page: Page) => log(page).getByRole("group", { name: "Approve Bash" });
const bashRows = (page: Page) => log(page).getByRole("button", { name: /^Bash/ });
const dot = (page: Page) => page.getByRole("region", { name: "Chats" }).locator(".chat-dot");

test("the agent asks to run a tool: the chat waits with a dot, Deny sends a reason, and Allow for this chat covers the next call", async () => {
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

    // AC1, AC4: the call waits inline with its input and the choices, and the chat is marked waiting.
    await composer(page).fill("use a tool");
    await composer(page).press("Enter");
    await expect(prompt(page)).toContainText('"command": "npm test"');
    await expect(bashRows(page)).toHaveText(["Bashnpm testNeeds approval"]);
    await expect(dot(page)).toHaveAttribute("data-waiting", "approval");
    await expect(log(page)).not.toContainText("Done.");

    // AC1, AC2: Deny with a reason, from the keyboard; the agent gets the reason and goes on.
    await prompt(page).getByRole("textbox", { name: "Reason" }).fill("Run the unit tests only.");
    await prompt(page).getByRole("textbox", { name: "Reason" }).press("Enter");
    await expect(log(page)).toContainText("Done.");
    await expect(prompt(page)).toHaveCount(0);
    await expect(bashRows(page)).toHaveText(["Bashnpm testDenied"]);
    await expect(log(page)).toContainText("Run the unit tests only.");
    await bashRows(page).first().click();
    await expect(log(page)).toContainText(denyMessage("Run the unit tests only."));
    await expect(dot(page)).toHaveAttribute("data-waiting", "reply");

    // Allow for this chat on the first call; the second, the same command, runs without asking.
    await composer(page).fill("use a tool twice");
    await composer(page).press("Enter");
    await expect(dot(page)).toHaveAttribute("data-waiting", "approval");
    await prompt(page).getByRole("button", { name: "Allow for this chat" }).click();
    await expect(bashRows(page)).toHaveText([
      "Bashnpm testDenied",
      "Bashnpm testAllowed for this chat",
      "Bashnpm testAllowed for this chat",
    ]);
    await expect(prompt(page)).toHaveCount(0);
    await expect(dot(page)).toHaveAttribute("data-waiting", "reply");
  } finally {
    await app.close();
    await userData.dispose();
    await project.dispose();
    await bin.dispose();
  }
});
