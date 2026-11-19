import type { App } from "electron";

/** The app's name, as menus and dialogs show it. */
export const APP_NAME = "Featra";

/** The app's id: the installers' appId, and the Windows AppUserModelID that notifications and the taskbar group by. */
export const APP_ID = "dev.featra.app";

/**
 * Names the app Featra. Run from source, Electron names it after the package, `@featra/desktop`, and macOS's app menu
 * then reads "About @featra/desktop" and "Quit @featra/desktop" (STORY-63). The userData folder must stay the one
 * named after the package, where existing profiles keep their projects and settings: it is read before the rename and
 * set again after, so it can't follow the new name. Must run before `ready`.
 *
 * Installed, the app's package is named Featra (packaging/stage.ts), so its userData folder is `Featra`, apart from a
 * source run's `@featra/desktop` (STORY-64): an installed Featra and one run from source each keep their own projects
 * and settings. Only one of them runs at a time (instance-lock.ts).
 */
export function nameApp(app: Pick<App, "getPath" | "setPath" | "setName">) {
  const userData = app.getPath("userData");
  app.setName(APP_NAME);
  app.setPath("userData", userData);
}
