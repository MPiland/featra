import { expect, test } from "./fixtures.ts";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempProject, tempUserData } from "./app.ts";

/**
 * BUG-40: the page's first request to the local server must not wait on loading the profile's cookies from disk. In a
 * persistent session Chromium loads the cookie database before any request may go, the local server's included: 0.2 s
 * on a CI runner, and once over 5 s, so the first answers missed their wait. The page stores nothing in its session
 * (its state goes through the main process), so its session keeps nothing on disk and has nothing to load.
 */
test("The page's first request reads nothing from the profile's cookie store", async () => {
  const userData = await tempUserData();
  const project = await tempProject("version: 1\n");
  const bin = await standInClaude();
  const { app, page } = await launch(userData.dir, {
    FEATRA_PROJECT_DIR: project.dir,
    FEATRA_E2E_AGENT_SDK: FAKE_SDK,
    [PATH_KEY]: bin.path,
  });
  try {
    // The provider group is the server's answer to the chat list, as in chat-list.spec.ts.
    await expect(page.getByRole("region", { name: "Chats" }).getByRole("group", { name: "Claude Code" })).toBeVisible();
    const persistent = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((w) => w.webContents.session.isPersistent()),
    );
    expect(persistent).toEqual([false]);
  } finally {
    await app.close();
    await userData.dispose();
    await project.dispose();
    await bin.dispose();
  }
});
