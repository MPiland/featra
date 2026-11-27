import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "./fixtures.ts";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempProject, tempUserData } from "./app.ts";

/**
 * BUG-40: the page's socket to the local server must not wait on the system's proxy settings. Chromium decides a proxy
 * for every request, the local server's included, and on Windows the system's settings can make it look for one first
 * (WPAD), which took up to 4.75 s on CI runners. Here the platform's proxy setting is faked: a proxy script whose URL
 * never answers, which Chromium would wait 30 s on before giving up.
 */
async function stalledProxyScript() {
  const asked: string[] = [];
  const held: IncomingMessage[] = [];
  const server = createServer((req) => {
    asked.push(req.url ?? "");
    held.push(req); // never answered
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/proxy.pac`,
    asked,
    dispose: () =>
      new Promise<void>((resolve) => {
        for (const req of held) req.socket.destroy();
        server.close(() => resolve());
      }),
  };
}

test("The first answers come from the local server without waiting on the system's proxy settings", async () => {
  const userData = await tempUserData();
  const project = await tempProject("version: 1\n");
  const bin = await standInClaude();
  const proxy = await stalledProxyScript();
  const { app, page } = await launch(
    userData.dir,
    { FEATRA_PROJECT_DIR: project.dir, FEATRA_E2E_AGENT_SDK: FAKE_SDK, [PATH_KEY]: bin.path },
    [`--proxy-pac-url=${proxy.url}`],
  );
  try {
    // The provider group is the server's answer to the chat list, as in chat-list.spec.ts.
    await expect(page.getByRole("region", { name: "Chats" }).getByRole("group", { name: "Claude Code" })).toBeVisible();
    expect(proxy.asked).toEqual([]);
    // Nor in the second after: nothing in the app fetches the proxy script in the background.
    await page.waitForTimeout(1000);
    expect(proxy.asked).toEqual([]);
  } finally {
    await app.close();
    await proxy.dispose();
    await userData.dispose();
    await project.dispose();
    await bin.dispose();
  }
});
