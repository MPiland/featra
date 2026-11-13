// The local server's bug filing (STORY-13), as a fake: proposals by suspected cause, and the filing answers in turn.
import { BUG_COPY } from "@featra/work-format/bug-copy";
import type { BugBridge, BugProposal, FiledBug } from "../src/bugs.ts";
import type { HostOptions } from "./harness-options.ts";

const ONLY_PROJECT: BugProposal = {
  ok: true,
  placements: { proposed: "project", choices: [{ key: "project", label: BUG_COPY.project }] },
};
const FILED: FiledBug = { ok: true, kind: "card", id: "BUG-1" };

/** Each answer in turn, the last one again once they run out. */
function inTurn<T>(answers: T | T[] | undefined, fallback: T): () => T {
  const queue = answers === undefined ? [fallback] : Array.isArray(answers) ? [...answers] : [answers];
  return () => (queue.length > 1 ? queue.shift()! : (queue[0] ?? fallback));
}

export function fakeBugServer(calls: string[], host: HostOptions): BugBridge {
  const proposals = new Map<string, () => BugProposal>();
  const filed = inTurn(host.filedBug, FILED);
  return {
    proposeBug: async (dir, cause) => {
      calls.push(`proposeBug:${dir}:${cause ?? ""}`);
      const key = cause ?? "";
      let next = proposals.get(key);
      if (!next) {
        const given = host.bugPlacements?.[key];
        const answers = given === undefined ? undefined : Array.isArray(given) ? given : [given];
        next = inTurn(
          answers?.map((a): BugProposal => ("ok" in a ? a : { ok: true, placements: a })),
          ONLY_PROJECT,
        );
        proposals.set(key, next);
      }
      return next();
    },
    fileBug: async (dir, report, placement) => {
      calls.push(`fileBug:${dir}:${JSON.stringify(report)}:${placement}`);
      return filed();
    },
  };
}
