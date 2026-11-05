import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import electronPath from "electron";

// No trailing separator: on Windows a trailing backslash escapes the closing quote of the argument.
const appDir = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

/** A temporary userData folder: the only storage the app sees. Fakes the platform's storage location. */
export async function tempUserData(): Promise<{ dir: string; dispose: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "featra-e2e-"));
  return { dir, dispose: () => rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }) }; // Electron helpers can hold files briefly after exit
}

/** Launches the built app (run `pnpm --filter @featra/desktop build` first; `test:e2e` does). */
export async function launch(userDataDir: string): Promise<{ app: ElectronApplication; page: Page }> {
  const env = { ...process.env, FEATRA_USER_DATA_DIR: userDataDir, FEATRA_E2E: "1" } as Record<string, string>;
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
  tray?: { emit(event: string): void; isDestroyed(): boolean };
  trayMenu?: { items: { label: string; click(): void }[] };
}
type MainGlobal = typeof globalThis & { featraTest: TestHooks };

export const windowVisible = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false);
export const windowFocused = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFocused() ?? false);
/** What the OS close button and Alt+F4 do to a frameless window: Electron's `BrowserWindow.close()`. */
export const closeFromOs = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
export const notices = (app: ElectronApplication) => app.evaluate(() => (globalThis as MainGlobal).featraTest.notices);
/** Files Help > Troubleshooting > Show Logs asked the OS to show in File Explorer. */
export const shownInFolder = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as MainGlobal).featraTest.shownInFolder);
export const trayExists = (app: ElectronApplication) =>
  app.evaluate(() => {
    const tray = (globalThis as MainGlobal).featraTest.tray;
    return tray !== undefined && !tray.isDestroyed();
  });
/** What a left-click on the tray icon does: Electron emits `click` on the real Tray. */
export const clickTray = (app: ElectronApplication) =>
  app.evaluate(() => void (globalThis as MainGlobal).featraTest.tray!.emit("click"));
export const trayMenuLabels = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as MainGlobal).featraTest.trayMenu!.items.map((i) => i.label));
/** Chooses an item from the real tray context menu (the right-click menu). */
export const chooseTrayItem = (app: ElectronApplication, label: string) =>
  app.evaluate((_e, wanted) => {
    (globalThis as MainGlobal).featraTest.trayMenu!.items.find((i) => i.label === wanted)!.click();
  }, label);
/** Resolves with the exit code once the app's process has exited. */
export const exited = (app: ElectronApplication) =>
  new Promise<number | null>((resolve) => {
    const proc = app.process();
    if (proc.exitCode !== null) return resolve(proc.exitCode);
    proc.once("exit", (code) => resolve(code));
  });

/** Starts Featra a second time on the same profile, as the Start menu would; resolves when that process ends. */
export function launchAgain(userDataDir: string): Promise<number | null> {
  const env = { ...process.env, FEATRA_USER_DATA_DIR: userDataDir, FEATRA_E2E: "1" } as Record<string, string>;
  delete env.FEATRA_CLIENT_URL;
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electronPath as unknown as string, [appDir], { env, stdio: "ignore" });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
}
