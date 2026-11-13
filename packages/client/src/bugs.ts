/**
 * Filing a bug from Work (STORY-13): where it would go, then filing it where the user placed it. The server allocates
 * the ID and writes the owner's copy; this only calls it and reads its answer.
 */
import { normalizeBugPlacements, type BugPlacements, type BugReport } from "@featra/work-format/bug-copy";
import { errorMessage, isRecord } from "@featra/work-format/guards";
import type { ServerClient } from "./server-client.ts";

export type BugProposal = { ok: true; placements: BugPlacements } | { ok: false; error: string };
export type FiledBug = { ok: true; kind: "card" | "task"; id: string } | { ok: false; error: string };

export interface BugBridge {
  /** Where a bug believed to come from `cause` (or null) would go, and every place it can go. */
  proposeBug: (dir: string, cause: string | null) => Promise<BugProposal>;
  /** Files `report` at `placement`: a bug card, or a task on a story. */
  fileBug: (dir: string, report: BugReport, placement: string) => Promise<FiledBug>;
}

const UNEXPECTED = "Featra gave an unexpected answer.";

export function serverBugs(server: ServerClient): BugBridge {
  return {
    proposeBug: (dir, cause) =>
      server.call("bug.propose", { dir, cause }).then(
        (raw): BugProposal => {
          const placements = normalizeBugPlacements(raw);
          return placements ? { ok: true, placements } : { ok: false, error: UNEXPECTED };
        },
        (err: unknown) => ({ ok: false, error: errorMessage(err) }),
      ),
    fileBug: (dir, report, placement) =>
      server.call("bug.file", { dir, ...report, placement }).then(
        (raw: unknown): FiledBug =>
          isRecord(raw) && (raw.kind === "card" || raw.kind === "task") && typeof raw.id === "string"
            ? { ok: true, kind: raw.kind, id: raw.id }
            : { ok: false, error: UNEXPECTED },
        (err: unknown) => ({ ok: false, error: errorMessage(err) }),
      ),
  };
}

/** A browser tab has no folders, so no bugs to file. */
export function noBugs(error: string): BugBridge {
  return {
    proposeBug: async () => ({ ok: false, error }),
    fileBug: async () => ({ ok: false, error }),
  };
}
