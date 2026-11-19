import { join } from "node:path";

/** Where the installed app keeps its copy of the built client, in its app folder beside `dist/` (packaging/stage.ts). */
export const PACKAGED_CLIENT_DIR = "client";

/**
 * The built client the window loads (STORY-64). Run from source, it is the client package's own build in the
 * workspace, two folders up from the desktop app. Installed, it is the app folder's own copy.
 */
export function clientIndex({ appPath, packaged }: { appPath: string; packaged: boolean }): string {
  return packaged
    ? join(appPath, PACKAGED_CLIENT_DIR, "index.html")
    : join(appPath, "..", "..", "packages", "client", "dist", "index.html");
}
