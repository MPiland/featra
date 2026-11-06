import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import electronPath from "electron";
import { foregroundWindow, grantForeground } from "./foreground.ts";

// No trailing separator: on Windows a trailing backslash escapes the closing quote of the argument.
const appDir = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

/** A temporary userData folder: the only storage the app sees. Fakes the platform's storage location. */
export async function tempUserData(): Promise<{ dir: string; dispose: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "featra-e2e-"));
  return { dir, dispose: () => rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }) }; // Electron helpers can hold files briefly after exit
}

/** A temporary project folder holding `.featra/config.yaml` with `config`: the project Featra opens. */
export async function tempProject(
  config: string,
): Promise<{ dir: string; config: string; dispose: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "featra-project-"));
  await mkdir(join(dir, ".featra"));
  const file = join(dir, ".featra", "config.yaml");
  await writeFile(file, config, "utf8");
  return {
    dir,
    config: file,
    dispose: () => rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }),
  };
}

/** Launches the built app (run `pnpm --filter @featra/desktop build` first; `test:e2e` does). */
export async function launch(
  userDataDir: string,
  extraEnv: Record<string, string> = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  // No project unless a test gives one: Featra would otherwise find this repo's own .featra from the working folder.
  const env = {
    ...process.env,
    FEATRA_USER_DATA_DIR: userDataDir,
    FEATRA_E2E: "1",
    FEATRA_PROJECT_DIR: "",
    ...extraEnv,
  } as Record<string, string>;
  delete env.FEATRA_CLIENT_URL;
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [appDir],
    env,
  });
  const page = await app.firstWindow();
  await page.getByRole("banner").waitFor();
  return { app, page };
}

/**
 * The main process's test hooks (set when FEATRA_E2E=1): recorded notices and the real tray. `app.evaluate` runs
 * its function inside the main process, so each helper reads them from there.
 */
interface TestHooks {
  notices: string[];
  shownInFolder: string[];
  folderPicks: string[];
  folderDialogs: string[];
  tray?: { emit: (event: string) => void; isDestroyed: () => boolean };
  trayMenu?: { items: { label: string; click: () => void }[] };
}
type MainGlobal = typeof globalThis & { featraTest: TestHooks };

export const windowVisible = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false);
export const windowFocused = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFocused() ?? false);
/**
 * Whether the window is the OS foreground window, the one the user sees in front and types into. `windowFocused` is
 * Chromium's own view, which can say true while another app is in front (BUG-2), so tests about focus check both.
 * Where the window manager doesn't track an active window (xvfb), there is no OS answer and Chromium's is used.
 */
export async function windowInForeground(app: ElectronApplication): Promise<boolean> {
  if (!windowManagerSupports("_NET_ACTIVE_WINDOW")) return windowFocused(app);
  const handle = await app.evaluate(({ BrowserWindow }) => {
    const buf = BrowserWindow.getAllWindows()[0]?.getNativeWindowHandle();
    if (buf === undefined) return undefined;
    return (buf.length >= 8 ? buf.readBigUInt64LE() : BigInt(buf.readUInt32LE())).toString();
  });
  return handle !== undefined && (await foregroundWindow()) === BigInt(handle);
}
/** Featra's main process, which owns its windows. */
const mainPid = (app: ElectronApplication) => app.evaluate(() => process.pid);
/** What the OS close button and Alt+F4 do to a frameless window: Electron's `BrowserWindow.close()`. */
export const closeFromOs = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
export const notices = (app: ElectronApplication) => app.evaluate(() => (globalThis as MainGlobal).featraTest.notices);
/** Files Help > Troubleshooting > Show Logs asked the OS to show in File Explorer. */
export const shownInFolder = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as MainGlobal).featraTest.shownInFolder);
/** Queues the folders the next folder dialogs return (Playwright can't drive the OS picker); then they cancel. */
export const queueFolderPicks = (app: ElectronApplication, ...dirs: string[]) =>
  app.evaluate((_e, picks) => {
    (globalThis as MainGlobal).featraTest.folderPicks.push(...picks);
  }, dirs);
/** Titles of the folder dialogs Featra opened. */
export const folderDialogs = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as MainGlobal).featraTest.folderDialogs);
export const trayExists = (app: ElectronApplication) =>
  app.evaluate(() => {
    const tray = (globalThis as MainGlobal).featraTest.tray;
    return tray !== undefined && !tray.isDestroyed();
  });
/**
 * What a left-click on the tray icon does: the OS lets Featra take the foreground (faked: see foreground.ts), then
 * Electron emits `click` on the real Tray.
 */
export async function clickTray(app: ElectronApplication) {
  await grantForeground(await mainPid(app));
  await app.evaluate(() => {
    (globalThis as MainGlobal).featraTest.tray!.emit("click");
  });
}
export const trayMenuLabels = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as MainGlobal).featraTest.trayMenu!.items.map((i) => i.label));
/**
 * Chooses an item from the real tray context menu (the right-click menu). The user's click lands in Featra's own menu,
 * which lets Featra take the foreground (faked: see foreground.ts).
 */
export async function chooseTrayItem(app: ElectronApplication, label: string) {
  await grantForeground(await mainPid(app));
  await app.evaluate((_e, wanted) => {
    (globalThis as MainGlobal).featraTest.trayMenu!.items.find((i) => i.label === wanted)!.click();
  }, label);
}
/**
 * Whether the desktop's window manager can minimise windows. Windows always can. On X11, minimising is a request to
 * the window manager, and one that doesn't list `_NET_WM_STATE_HIDDEN` in `_NET_SUPPORTED` ignores it: WSLg's
 * doesn't, and xvfb has no window manager at all. There, even a framed Electron window stays unminimised.
 */
export const windowManagerCanMinimize = () => windowManagerSupports("_NET_WM_STATE_HIDDEN");

/** Likewise for maximising (`_NET_WM_STATE_MAXIMIZED_VERT`): WSLg's window manager can; xvfb, with none, can't. */
export const windowManagerCanMaximize = () => windowManagerSupports("_NET_WM_STATE_MAXIMIZED_VERT");

function windowManagerSupports(atom: string): boolean {
  if (process.platform !== "linux") return true;
  try {
    return execFileSync("xprop", ["-root", "_NET_SUPPORTED"], { encoding: "utf8" }).includes(atom);
  } catch {
    return false;
  }
}

/** Records the window's `minimize()` calls: the request Featra makes of the window manager. */
export const recordMinimize = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]!;
    const g = globalThis as { minimizeCalls?: number };
    g.minimizeCalls = 0;
    const real = win.minimize.bind(win);
    win.minimize = () => {
      g.minimizeCalls!++;
      real();
    };
  });
export const minimizeCalls = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as { minimizeCalls?: number }).minimizeCalls ?? 0);

/** Resolves with the exit code once the app's process has exited. */
export const exited = (app: ElectronApplication) =>
  new Promise<number | null>((resolve) => {
    const proc = app.process();
    if (proc.exitCode !== null) return resolve(proc.exitCode);
    proc.once("exit", (code) => resolve(code));
  });

/**
 * Starts Featra a second time on the same profile, as the Start menu would; resolves when that process ends. A Start
 * menu launch is the foreground process, and hands `running` the right to take the foreground along with the
 * command line (Chromium's single-instance lock does that); the harness launches from the background, so it fakes the
 * grant (see foreground.ts).
 */
export async function launchAgain(userDataDir: string, running: ElectronApplication): Promise<number | null> {
  await grantForeground(await mainPid(running));
  const env = { ...process.env, FEATRA_USER_DATA_DIR: userDataDir, FEATRA_E2E: "1", FEATRA_PROJECT_DIR: "" } as Record<
    string,
    string
  >;
  delete env.FEATRA_CLIENT_URL;
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electronPath as unknown as string, [appDir], { env, stdio: "ignore" });
  return new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
}
