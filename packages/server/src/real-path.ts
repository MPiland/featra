/**
 * Real paths for Featra's Allow for this chat rule on Write and Edit (STORY-45, ADR 0018): the rule decides where a
 * write really lands, so a link inside the working folder that points outside it isn't covered.
 */
import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { isRecord, type RealPath } from "@featra/work-format";

/**
 * A path with every link resolved. A path that doesn't exist yet (a new file, or a new folder for it) resolves through
 * its nearest existing folder. Null when it can't be resolved, including a link whose target is gone, since a write
 * through it would create the target wherever it points.
 */
export const realPath: RealPath = (path) => {
  try {
    return realpathSync.native(path);
  } catch (error) {
    if (!isRecord(error) || error.code !== "ENOENT") return null;
    if (lstatSync(path, { throwIfNoEntry: false })) return null;
    const parent = dirname(path);
    if (parent === path) return null;
    const real = realPath(parent);
    return real === null ? null : join(real, basename(path));
  }
};
