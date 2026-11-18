import type { App } from "electron";

/** The app's name, as menus and dialogs show it. */
export const APP_NAME = "Featra";

/**
 * Names the app Featra. Run from source, Electron names it after the package, `@featra/desktop`, and macOS's app menu
 * then reads "About @featra/desktop" and "Quit @featra/desktop" (STORY-63). Electron also names the userData folder
 * after the app, so the folder is kept where it was: an existing profile's projects and settings stay found. Must run
 * before `ready`.
 */
export function nameApp(app: Pick<App, "getPath" | "setPath" | "setName">) {
  const userData = app.getPath("userData");
  app.setName(APP_NAME);
  app.setPath("userData", userData);
}
