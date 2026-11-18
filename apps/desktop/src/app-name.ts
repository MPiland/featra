import type { App } from "electron";

/** The app's name, as menus and dialogs show it. */
export const APP_NAME = "Featra";

/**
 * Names the app Featra. Run from source, Electron names it after the package, `@featra/desktop`, and macOS's app menu
 * then reads "About @featra/desktop" and "Quit @featra/desktop" (STORY-63). The userData folder must stay the one
 * named after the package, where existing profiles keep their projects and settings: it is read before the rename and
 * set again after, so it can't follow the new name. Must run before `ready`.
 */
export function nameApp(app: Pick<App, "getPath" | "setPath" | "setName">) {
  const userData = app.getPath("userData");
  app.setName(APP_NAME);
  app.setPath("userData", userData);
}
