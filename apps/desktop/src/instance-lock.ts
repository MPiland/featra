import { join } from "node:path";
import type { App } from "electron";
import { APP_NAME } from "./app-name.ts";

/**
 * One Featra runs at a time, installed or run from source: one instance holds many projects, and a second launch of
 * either brings the running one forward (STORY-64, decisions.md 2026-11-18). Electron takes its single-instance lock in
 * the userData folder current when it is asked for, and the two keep their data apart (`Featra` and `@featra/desktop`,
 * app-name.ts), so both ask for it in the installed app's folder, `<appData>/Featra`, then go back to their own.
 *
 * A profile named with FEATRA_USER_DATA_DIR (`profile`), as tests and a second profile do, is its own instance, locked
 * in its own folder.
 */
export function takeInstanceLock(
  app: Pick<App, "getPath" | "setPath" | "requestSingleInstanceLock">,
  profile?: string,
): boolean {
  const own = app.getPath("userData");
  app.setPath("userData", profile || join(app.getPath("appData"), APP_NAME));
  try {
    return app.requestSingleInstanceLock();
  } finally {
    app.setPath("userData", own);
  }
}
