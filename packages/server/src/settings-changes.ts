/**
 * What saving the app's settings changes for open projects (STORY-59, STORY-61): the app default for auto-merge, which a
 * project that sets none follows. Only a project whose setting in effect changed is scanned again, so its rows and
 * cards show Hold or not, and auto-merge looks at the stories again once any did.
 */
import { errorMessage } from "@featra/work-format";
import { autoMergeOver } from "./mcp-enabled.ts";

export interface SettingsChangesDeps {
  /** The app default for `autoMerge` as the settings file has it now (`readAppAutoMerge`). */
  appAutoMerge: () => Promise<boolean | undefined>;
  /** The open projects. */
  dirs: () => string[];
  /** Scans a project again, which tells its watchers. */
  scan: (dir: string) => Promise<unknown>;
  /** Auto-merge looks at every watched project's stories again. */
  recheck: () => void;
  log: (message: string) => void;
}

/** What the host calls each time the app's settings are saved. */
export function createSettingsChanges({ appAutoMerge, dirs, scan, recheck, log }: SettingsChangesDeps) {
  let last = appAutoMerge();
  /** The current look: a save made while one runs waits for it, so each compares with the one before. */
  let looking: Promise<void> = Promise.resolve();

  async function look(was: Promise<boolean | undefined>, now: Promise<boolean | undefined>) {
    const [before, after] = await Promise.all([was, now]);
    if (before === after) return;
    const changed: string[] = [];
    for (const dir of dirs()) {
      if ((await autoMergeOver(dir, before)) !== (await autoMergeOver(dir, after))) changed.push(dir);
    }
    if (changed.length === 0) return;
    recheck();
    for (const dir of changed) await scan(dir).catch((err: unknown) => log(errorMessage(err)));
  }

  return {
    saved: () => {
      const was = last;
      last = appAutoMerge();
      const now = last;
      looking = looking.then(() => look(was, now)).catch((err: unknown) => log(errorMessage(err)));
    },
    /** Waits for the looks still running. */
    idle: () => looking,
  };
}
