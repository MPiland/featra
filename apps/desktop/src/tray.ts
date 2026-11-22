import { execFile } from "node:child_process";
import { join } from "node:path";
import { Menu, nativeImage, Tray, type BrowserWindow, type NativeImage } from "electron";
import { withDot } from "./badge-image.ts";
import type { Lifecycle } from "./lifecycle.ts";
import { e2e, testHooks } from "./test-hooks.ts";
import { TRAY_TOOLTIP, type TrayBadge, type TrayLook } from "./tray-badge.ts";
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
const TRAY_ICON = join(__dirname, "../assets/tray.png");
/** The tray icon's size in points. */
const TRAY_PT = 16;

/** The tray icon with the red dot (STORY-67), drawn once from the high-DPI icon's pixels. */
let dotted: NativeImage | undefined;
function dottedIcon(): NativeImage {
  if (dotted) return dotted;
  const bitmap = nativeImage.createFromPath(join(__dirname, "../assets/tray@2x.png")).toBitmap({ scaleFactor: 2 });
  const px = Math.round(Math.sqrt(bitmap.length / 4));
  dotted = nativeImage.createFromBitmap(withDot(bitmap, px), { width: px, height: px, scaleFactor: px / TRAY_PT });
  return dotted;
}

/** Sets `tray` to `look`: the dotted icon or the plain one, and the tooltip. E2E runs record each call. */
function setLook(tray: Tray, win: BrowserWindow, look: TrayLook) {
  tray.setImage(look.dot ? dottedIcon() : TRAY_ICON);
  tray.setToolTip(look.tooltip);
  if (e2e) {
    const visible = !win.isDestroyed() && win.isVisible();
    testHooks.badge.calls.push({ on: "tray", shows: look.tooltip, dot: look.dot, visible });
  }
}

/** The tray icon, with `badge` showing on it how many agents wait (STORY-67). */
export function createTray(win: BrowserWindow, lifecycle: Lifecycle, badge: TrayBadge): Tray {
  const tray = new Tray(TRAY_ICON);
  tray.setToolTip(TRAY_TOOLTIP);
  badge.attach((look) => setLook(tray, win, look));
  tray.on("click", () => lifecycle.reveal(win));
  const menu = Menu.buildFromTemplate(lifecycle.trayMenu(win).map(({ label, click }) => ({ label, click })));
  tray.setContextMenu(menu);
  testHooks.tray = tray;
  testHooks.trayMenu = menu;
  return tray;
}

export function destroyTray(tray: Tray, badge: TrayBadge) {
  badge.attach(undefined);
  tray.destroy();
  if (testHooks.tray === tray) {
    testHooks.tray = undefined;
    testHooks.trayMenu = undefined;
  }
}
