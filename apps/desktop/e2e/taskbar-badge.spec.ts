import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { NEEDS_COPY } from "@featra/client/bridge";
import { newCard, serializeCard } from "@featra/work-format";
import { expect, test, type ElectronApplication, type Page } from "./fixtures.ts";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import {
  clickDock,
  clickTray,
  closeFromOs,
  launch,
  queueFolderPicks,
  tempProject,
  tempUserData,
  windowVisible,
} from "./app.ts";
import { git, project } from "./draft-project.ts";
import { pressShortcut } from "./keys.ts";

/**
 * STORY-67: the taskbar and Dock badge counts the agents waiting on the user across two projects, in the real app with
 * its real local server and git. Only the platform and the agent are faked (agent.ts). The badge is read where each OS
 * lets a test read it: macOS's Dock badge from the Dock itself; the Windows overlay and the Linux launcher count from
 * the calls Featra made (test-hooks.ts), as no API reads them back. The Inbox wait is 3 seconds (settings.json).
 */
interface Shown {
  /** The number on the badge; "" when there is none. */
  text: string;
  /** What a screen reader hears for the Windows overlay. */
  description?: string;
}

interface BadgeHooks {
  calls: { on: "badge" | "tray"; shows: string; visible: boolean; dot?: boolean }[];
  dock?: string;
  launcher?: number;
  overlay?: { label: string; description: string; width: number; height: number; empty: boolean } | null;
}

/** The badge as the OS has it. */
const badge = (app: ElectronApplication): Promise<Shown> =>
  app.evaluate(({ app: electron }): Shown => {
    const hooks = (globalThis as typeof globalThis & { featraTest: { badge: BadgeHooks } }).featraTest.badge;
    if (process.platform === "darwin") return { text: electron.dock?.getBadge() ?? "" };
    if (process.platform === "win32") {
      const o = hooks.overlay;
      // The overlay Electron took: a 16-point image with something in it.
      return o
        ? { text: o.empty || o.width !== 16 || o.height !== 16 ? "?" : o.label, description: o.description }
        : { text: "" };
    }
    return { text: hooks.launcher ? String(hooks.launcher) : "" };
  });

/** The badge calls Featra has made, in order. */
const badgeCalls = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as typeof globalThis & { featraTest: { badge: BadgeHooks } }).featraTest.badge.calls);

/** The tray icon's calls Featra has made, in order: its tooltip, whether it had the dot, and whether the window showed. */
const trayCalls = async (app: ElectronApplication) => (await badgeCalls(app)).filter((c) => c.on === "tray");

/** The tray icon for `n` waiting agents: the dot and the count in the tooltip, or the plain icon. */
const trayShowing = (n: number) =>
  n === 0 ? { dot: false, shows: "Featra" } : { dot: true, shows: NEEDS_COPY.waiting(n) };

/** Featra keeps a tray on Windows and Linux; macOS has the Dock instead. */
const hasTray = process.platform !== "darwin";

/** What the badge shows for `n` waiting agents on this OS. */
const showing = (n: number): Shown =>
  n === 0
    ? { text: "" }
    : process.platform === "win32"
      ? { text: String(n), description: NEEDS_COPY.waiting(n) }
      : { text: String(n) };

const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
const approval = (page: Page) => page.getByRole("log", { name: "Chat" }).getByRole("group", { name: "Approve Bash" });

/** Starts a Developer chat in the current project that asks to run a tool, and waits for its approval. */
async function agentAsks(page: Page) {
  await page.getByRole("button", { name: "New chat" }).click();
  await page
    .getByRole("dialog", { name: "New chat" })
    .getByRole("button", { name: /^Developer/ })
    .click();
  await composer(page).fill("use a tool");
  await composer(page).press("Enter");
  await expect(approval(page)).toBeVisible();
}

test("the badge counts the agents waiting across projects, leaves reviews out, and clears as they are answered", async () => {
  const userData = await tempUserData();
  await writeFile(join(userData.dir, "settings.json"), JSON.stringify({ inboxWaitMinutes: 0.05 }), "utf8");
  const busy = await project();
  // A feature drafted for the user to review: the switcher marks it, the badge doesn't count it.
  const draft = newCard(
    { id: "FEAT-2", type: "feature", title: "Second", status: "draft" },
    "dev-lead",
    "2026-11-02T00:00:00Z",
  );
  await writeFile(
    join(busy.dir, ".featra", "cards", "FEAT-2-second.md"),
    serializeCard({ ...draft, extra: { "drafted-by": "chat-1" } }),
    "utf8",
  );
  git(busy.dir, "add", "-A");
  git(busy.dir, "commit", "-q", "-m", "draft");
  const other = await tempProject("version: 1\n");
  const bin = await standInClaude();
  const { app, page } = await launch(userData.dir, {
    FEATRA_PROJECT_DIR: busy.dir,
    FEATRA_E2E_AGENT_SDK: FAKE_SDK,
    [PATH_KEY]: bin.path,
  });
  try {
    // AC3: no badge while nothing waits.
    expect(await badge(app)).toEqual(showing(0));

    // AC1, AC4: one agent waits in a project that also has a draft to review: the badge says 1, not 2.
    await agentAsks(page);
    await expect.poll(() => badge(app)).toEqual(showing(1));
    const switcher = page
      .getByRole("navigation", { name: "Featra" })
      .getByRole("button", { name: /^Switch project: / });
    await switcher.click();
    await expect(
      page
        .getByRole("menu", { name: "Projects" })
        .getByRole("menuitemradio", { name: new RegExp(`^${basename(busy.dir)}`) }),
    ).toHaveAccessibleName(`${basename(busy.dir)}, 1 agent waiting, to review`);
    await page.keyboard.press("Escape");
    expect(await badge(app)).toEqual(showing(1));

    // AC1, AC3: an agent in another project asks too: the badge counts both, live.
    await queueFolderPicks(app, other.dir);
    await pressShortcut(page, "openFolder");
    await expect(switcher).toHaveAccessibleName(new RegExp(`^Switch project: ${basename(other.dir)}`));
    await agentAsks(page);
    await expect.poll(() => badge(app)).toEqual(showing(2));
    // AC5: the tray icon has the dot, and its tooltip says how many.
    if (hasTray) await expect.poll(async () => (await trayCalls(app)).at(-1)).toMatchObject(trayShowing(2));

    // AC1, regression (review): a window hidden to the tray and brought back has its badge set again once it shows,
    // as Windows drops the overlay of a taskbar button that is made again.
    await closeFromOs(app);
    await expect.poll(() => windowVisible(app)).toBe(false);
    const before = (await badgeCalls(app)).length;
    if (process.platform === "darwin") await clickDock(app);
    else await clickTray(app);
    await expect.poll(() => windowVisible(app)).toBe(true);
    await expect
      .poll(async () => (await badgeCalls(app)).slice(before).filter((c) => c.visible && c.shows === "2").length)
      .toBeGreaterThanOrEqual(2);
    expect(await badge(app)).toEqual(showing(2));

    // AC3: answering one, inline, takes the badge down by one.
    await approval(page).getByRole("button", { name: "Allow", exact: true }).click();
    await expect(approval(page)).toHaveCount(0);
    await expect.poll(() => badge(app)).toEqual(showing(1));

    // AC3: answering the other project's agent from the Inbox clears the badge.
    await page.getByRole("button", { name: /^Inbox/ }).click();
    const item = page.getByRole("region", { name: "Waiting for you" }).getByRole("listitem");
    await expect(item).toHaveCount(1, { timeout: 15_000 });
    if (hasTray) expect((await trayCalls(app)).at(-1)).toMatchObject(trayShowing(1));
    // AC5: with the window hidden to the tray, the answer (sent from the hidden page, as the OS can't click it)
    // takes the tray back to the plain icon.
    await closeFromOs(app);
    await expect.poll(() => windowVisible(app)).toBe(false);
    const hidden = (await trayCalls(app)).length;
    await item.getByRole("button", { name: "Allow", exact: true }).dispatchEvent("click");
    await expect.poll(() => badge(app)).toEqual(showing(0));
    if (hasTray)
      await expect
        .poll(async () => (await trayCalls(app)).slice(hidden))
        .toEqual([{ on: "tray", visible: false, ...trayShowing(0) }]);
  } finally {
    await app.close();
    await userData.dispose();
    await busy.dispose();
    await other.dispose();
    await bin.dispose();
  }
});
