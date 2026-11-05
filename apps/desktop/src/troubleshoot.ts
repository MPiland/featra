/**
 * Help > Troubleshooting's restart actions. Free of Electron imports: main.ts hands in Electron's session and its
 * relaunch-and-quit, and tests hand in fakes of those.
 */
import type { Log } from "./log.ts";

export interface TroubleshootDeps {
  /** Electron's `session.defaultSession`. */
  session: { clearCache(): Promise<void>; clearStorageData(): Promise<void> };
  /** Featra's own state files (window chrome, app state). */
  stores: readonly { remove(): Promise<void> }[];
  log: Log;
  /** Starts a new instance and quits this one for real. */
  restart(): void;
}

/** Clear Cache and Restart: Chromium's HTTP cache only; stored settings stay. */
export async function clearCacheAndRestart(d: TroubleshootDeps): Promise<void> {
  await d.session.clearCache();
  d.log.info("Cache cleared; restarting");
  await d.log.flush();
  d.restart();
}

/** Reset App Data…: web storage, cache and Featra's state files go; the logs stay for troubleshooting. */
export async function resetAppData(d: TroubleshootDeps): Promise<void> {
  await d.session.clearStorageData();
  await d.session.clearCache();
  await Promise.all(d.stores.map((s) => s.remove()));
  d.log.info("App data reset; restarting");
  await d.log.flush();
  d.restart();
}
