import { readdir, readFile, readlink, realpath, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join, sep } from "node:path";
import { expect, test, type Page } from "../fixtures.ts";
import { FAKE_SDK, PATH_KEY, standInClaude, tempDir } from "../agent.ts";
import { launchExecutable, tempProject, tempUserData } from "../app.ts";
import { icons, installerFiles } from "../../packaging/config.ts";
import { DESKTOP } from "../../packaging/paths.ts";
import { install, openDmg, sameBytes, startMenuShortcut, type Installed } from "./install.ts";
import * as check from "./platform-checks.ts";

/**
 * STORY-64: the installer `pnpm package` built, installed as a tester would, and the installed app launched (never
 * `electron .`). Faked, as in the e2e journeys: the agent (a stand-in `claude` and fake-agent-sdk.mjs as the SDK's
 * `query`), the project, the profile and Claude's session folder. The local server, the Featra MCP and the Agent SDK's
 * session reader are the installed app's own.
 */
const ASSETS = join(DESKTOP, "assets");
const mac = process.platform === "darwin";
const windows = process.platform === "win32";
const linux = process.platform === "linux";

let installed: Installed;
test.beforeAll(async () => {
  test.setTimeout(300_000);
  installed = await install();
});
test.afterAll(async () => {
  await installed?.uninstall();
});

const open = (userData: string, env: Record<string, string>) =>
  launchExecutable(installed.executable, [], userData, { ...installed.env, ...env });
const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
const chatLog = (page: Page) => page.getByRole("log", { name: "Chat" });

async function newDeveloperChat(page: Page) {
  await page.getByRole("button", { name: "New chat" }).click();
  await page
    .getByRole("dialog", { name: "New chat" })
    .getByRole("button", { name: /^Developer/ })
    .click();
  await expect(page.getByRole("region", { name: "Developer" })).toBeVisible();
}

async function send(page: Page, text: string) {
  await composer(page).fill(text);
  await composer(page).press("Enter");
}

/** The options each agent was started with, as fake-agent-sdk.mjs logs them. */
const queries = async (agentLog: string): Promise<unknown[]> =>
  (await readFile(agentLog, "utf8"))
    .trim()
    .split("\n")
    .map((line): unknown => JSON.parse(line));
/** One agent, started with this `claude`. */
const startedWith = (claude: string) => [expect.objectContaining({ pathToClaudeCodeExecutable: claude })];

test("pnpm package built the installer, named with the version and architecture, and it installs Featra", async () => {
  // AC1, AC7: the files the package job uploads.
  expect(installed.installers.map((file) => basename(file))).toEqual(
    installerFiles(installed.platform, installed.version),
  );
  expect(existsSync(installed.executable)).toBe(true);
  if (windows) {
    // Per user: under the user's own programs folder, registered to uninstall, with a Start menu shortcut.
    expect(installed.installedAt.startsWith(join(process.env.LOCALAPPDATA ?? "", "Programs"))).toBe(true);
    expect(existsSync(startMenuShortcut())).toBe(true);
    expect(check.windowsUninstallEntry()).toEqual({ name: "Featra", location: installed.installedAt });
  }
});

test("the installed app opens a project, starts its local server, and chats with claude and the Featra MCP", async () => {
  const userData = await tempUserData();
  const project = await tempProject("version: 1\n");
  const bin = await standInClaude();
  const claudeHome = await tempDir("featra-claude-home-");
  const agentLog = join(bin.dir, "agent.log");
  const env = {
    FEATRA_PROJECT_DIR: project.dir,
    FEATRA_E2E_AGENT_SDK: FAKE_SDK,
    FEATRA_E2E_AGENT_LOG: agentLog,
    CLAUDE_CONFIG_DIR: claudeHome.dir,
    [PATH_KEY]: bin.path,
  };
  try {
    const first = await open(userData.dir, env);
    try {
      // AC2: the window opens on the project.
      await expect(first.page.getByRole("banner").locator(".ttl-proj")).toHaveText(`· ${basename(project.dir)}`);
      expect(await first.app.evaluate(({ app }) => app.isPackaged)).toBe(true);

      // AC4: a chat starts with the user's claude, and the agent is given the Featra MCP, which writes to the project
      // through the local server.
      await newDeveloperChat(first.page);
      await send(first.page, "decide where entries go");
      await expect(chatLog(first.page).getByText("Logged to decisions.md", { exact: true })).toBeVisible();
      expect(await readFile(join(project.dir, "decisions.md"), "utf8")).toContain("Keep entries in the working folder");
      await send(first.page, "hello");
      await expect(chatLog(first.page)).toContainText("You said: hello");
      expect(await queries(agentLog)).toEqual(startedWith(bin.claude));
    } finally {
      await first.app.close();
    }

    // The installed Agent SDK reads the chat back after a restart.
    const again = await open(userData.dir, env);
    try {
      const rows = again.page.getByRole("region", { name: "Chats" }).locator(".chat-row-title");
      await rows.filter({ hasText: "decide where entries go" }).click();
      await expect(chatLog(again.page)).toContainText("You said: hello");
    } finally {
      await again.app.close();
    }
  } finally {
    await userData.dispose();
    await project.dispose();
    await bin.dispose();
    await claudeHome.dispose();
  }
});

test("opened from Finder, the Dock or a desktop menu, it finds claude on the login shell's PATH", async () => {
  test.skip(windows, "Windows gives an app the user's PATH; there is no login shell to read it from");
  const userData = await tempUserData();
  const project = await tempProject("version: 1\n");
  const bin = await standInClaude();
  const rc = await tempDir("featra-shell-");
  const agentLog = join(bin.dir, "agent.log");
  const binDir = dirname(bin.claude);
  // The login shell adds the stand-in's folder, as a user's shell profile adds Homebrew's or ~/.local/bin.
  const line = `PATH="${binDir}:$PATH"; export PATH\n`;
  // zsh, macOS's, reads $ZDOTDIR/.zprofile as a login shell; dash, Ubuntu's sh, reads $ENV as an interactive one.
  const profile = join(rc.dir, mac ? ".zprofile" : "env.sh");
  const shellEnv: Record<string, string> = mac
    ? { SHELL: "/bin/zsh", ZDOTDIR: rc.dir }
    : { SHELL: "/bin/sh", ENV: profile };
  await writeFile(profile, line);
  try {
    // AC5: what Finder, the Dock and a desktop menu give an app: the system's folders, not the terminal's PATH.
    const { app, page } = await open(userData.dir, {
      ...shellEnv,
      FEATRA_PROJECT_DIR: project.dir,
      FEATRA_E2E_AGENT_SDK: FAKE_SDK,
      FEATRA_E2E_AGENT_LOG: agentLog,
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    });
    try {
      // git, gh and claude are looked up on this PATH, by the app, its server and the agents it starts.
      const path = await app.evaluate(() => process.env.PATH ?? "");
      expect(path.split(":")).toContain(binDir);
      await newDeveloperChat(page);
      await send(page, "hello");
      await expect(chatLog(page)).toContainText("You said: hello");
      expect(await queries(agentLog)).toEqual(startedWith(bin.claude));
      const logs = join(userData.dir, "logs");
      const text = (await Promise.all((await readdir(logs)).map((f) => readFile(join(logs, f), "utf8")))).join("");
      expect(text).toContain(`PATH from the login shell (${shellEnv.SHELL})`);
    } finally {
      await app.close();
    }
  } finally {
    await userData.dispose();
    await project.dispose();
    await bin.dispose();
    await rc.dispose();
  }
});

test("the installed app is named Featra, keeps its data in the Featra folder, and carries the Featra icon", async () => {
  const icon = icons(ASSETS);
  // Electron picks the profile folder itself here; on macOS and Linux in a fake home (Windows reads AppData from the shell).
  const home = await tempUserData();
  const { app } = await open(
    "",
    windows ? {} : { HOME: home.dir, CFFIXED_USER_HOME: home.dir, XDG_CONFIG_HOME: join(home.dir, ".config") },
  );
  try {
    const paths = await app.evaluate(({ app: electronApp }) => ({
      name: electronApp.getName(),
      appData: electronApp.getPath("appData"),
      userData: electronApp.getPath("userData"),
    }));
    expect(paths.name).toBe("Featra");
    expect(paths.userData).toBe(join(paths.appData, "Featra"));
    if (!windows) expect(await realpath(paths.userData)).toContain(`${await realpath(home.dir)}${sep}`);

    // AC6: the window's icon (Windows' taskbar, Linux's) is the app's.
    expect(
      await sameBytes(
        join(installed.appFolder, "assets", basename(windows ? icon.win : icon.linux)),
        windows ? icon.win : icon.linux,
      ),
    ).toBe(true);
    if (linux) {
      // The desktop menu's entry and icon.
      const entry = await check.desktopEntry(installed.installedAt);
      expect(entry).toMatchObject({ Name: "Featra", Icon: "featra" });
      const [largest] = await check.hicolorIcons(installed.installedAt, "featra");
      expect(largest).toBeDefined();
      const same = await app.evaluate(
        ({ nativeImage }, [a, b]) => {
          const x = nativeImage.createFromPath(a!);
          const y = nativeImage.createFromPath(b!);
          return { size: x.getSize(), equal: x.toBitmap().equals(y.toBitmap()) };
        },
        [largest!, icon.linux],
      );
      expect(same).toEqual({ size: { width: 512, height: 512 }, equal: true });
    }
  } finally {
    await app.close();
    await home.dispose();
  }
  if (windows) {
    // The executable's icon (Explorer, the Start menu and the taskbar), and the installer's.
    expect(check.windowsIconDiff(installed.executable, icon.win)).toMatchObject({ differing: 0 });
    expect(check.windowsIconDiff(installed.installers[0]!, icon.win)).toMatchObject({ differing: 0 });
  }
  if (mac) {
    // The Dock and Finder take the bundle's name and icon; the DMG shows the icon as its own, beside Applications.
    expect(check.plistValue(installed.installedAt, "CFBundleName")).toBe("Featra");
    const file = check.plistValue(installed.installedAt, "CFBundleIconFile");
    const bundled = join(
      installed.installedAt,
      "Contents",
      "Resources",
      file.endsWith(".icns") ? file : `${file}.icns`,
    );
    expect(await sameBytes(bundled, icon.mac)).toBe(true);
    const dmg = await openDmg(installed.installers[0]!);
    try {
      expect(existsSync(join(dmg.mount, "Featra.app"))).toBe(true);
      expect(await readlink(join(dmg.mount, "Applications"))).toBe("/Applications");
      expect(await sameBytes(join(dmg.mount, ".VolumeIcon.icns"), icon.mac)).toBe(true);
    } finally {
      dmg.detach();
    }
  }
});

test("the macOS app holds both Apple silicon and Intel code, runs as each, and is ad-hoc signed", () => {
  test.skip(!mac, "macOS only");
  // AC3: one universal app, the executable and Electron's framework both, each slice runnable.
  const framework = join(
    installed.installedAt,
    "Contents",
    "Frameworks",
    "Electron Framework.framework",
    "Electron Framework",
  );
  expect(check.machArchs(installed.executable)).toEqual(["arm64", "x86_64"]);
  expect(check.machArchs(framework)).toEqual(["arm64", "x86_64"]);
  expect(check.runsAs(installed.executable, "arm64")).toBe("arm64");
  expect(check.runsAs(installed.executable, "x86_64")).toBe("x64");
  // Ad-hoc: signed, with no Developer ID and so no team.
  const signature = check.codeSignature(installed.installedAt);
  expect(signature.verify).toMatch(/^exit 0:/);
  expect(signature.details).toContain("Signature=adhoc");
  expect(signature.details).toContain("TeamIdentifier=not set");
});
