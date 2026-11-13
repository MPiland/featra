/**
 * The local API's bug methods (STORY-13): Work's New bug asks where a bug would go, then files it where the user
 * placed it. Always the user's click; without the filing module both are refused.
 */
import { bugFileParams, bugProposeParams } from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import type { BugFiling } from "./bug-filing.ts";

export interface BugApiDeps {
  bugs?: Pick<BugFiling, "propose" | "file">;
  /** The project folder, once it is known to be open; throws otherwise. */
  allow: (dir: string) => string;
}

export type BugMethod = "bug.propose" | "bug.file";

export function createBugApi({ bugs, allow }: BugApiDeps) {
  return async (method: BugMethod, params: unknown) => {
    if (!bugs) throw new ApiError("Filing bugs isn't available.");
    if (method === "bug.propose") {
      const p = bugProposeParams(params);
      if (!p) throw new ApiError("Expected { dir, cause }.");
      return bugs.propose(allow(p.dir), p.cause);
    }
    const p = bugFileParams(params);
    if (!p.ok) throw new ApiError(p.error);
    return bugs.file(allow(p.dir), p.report, p.placement, "user");
  };
}
