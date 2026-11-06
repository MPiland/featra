import { execFile } from "node:child_process";
import { join } from "node:path";
import { Menu, Tray, type BrowserWindow } from "electron";
import type { Lifecycle } from "./lifecycle.ts";
import { e2e, testHooks } from "./test-hooks.ts";
import { hasTrayHost, type RunCommand } from "./tray-support.ts";

const runCommand: RunCommand = (command, args) =>
  new Promise((resolve, reject) =>
    execFile(command, [...args], { timeout: 2000 }, (err, stdout) => (err ? reject(err) : resolve(stdout))),
  );

/**
 * Whether the desktop has a tray. E2E runs fake the answer (`FEATRA_E2E_TRAY=present|absent`, default present) so the
 * tray tests run on any desktop and the no-tray path can be proved too; otherwise the session bus is asked.
 */
export const trayAvailable = (): Promise<boolean> =>
  e2e
    ? Promise.resolve(process.env.FEATRA_E2E_TRAY !== "absent" && process.platform !== "darwin")
    : hasTrayHost(process.platform, runCommand);

/** Placeholder icon until there is a logo (see decisions.md). Electron picks tray@2x.png on high-DPI screens. */
export function createTray(win: BrowserWindow, lifecycle: Lifecycle): Tray {
  const tray = new Tray(join(__dirname, "../assets/tray.png"));
  tray.setToolTip("Featra");
  tray.on("click", () => lifecycle.reveal(win));
  const menu = Menu.buildFromTemplate(lifecycle.trayMenu(win).map(({ label, click }) => ({ label, click })));
  tray.setContextMenu(menu);
  testHooks.tray = tray;
  testHooks.trayMenu = menu;
  return tray;
}

export function destroyTray(tray: Tray) {
  tray.destroy();
  if (testHooks.tray === tray) {
    testHooks.tray = undefined;
    testHooks.trayMenu = undefined;
  }
}
