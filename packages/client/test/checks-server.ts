// The local server's checks side, as a fake: each project's Checks section held in memory, changed by the user's saves.
import { CHECKS_COPY, type ChecksPatch, type ChecksView } from "@featra/work-format";
import type { ChecksBridge } from "../src/checks-bridge.ts";

/** A project with no GitHub and nothing set: checks run on this computer, with no commands yet. */
export const NO_CHECKS: ChecksView = {
  where: "local",
  chosen: false,
  reason: CHECKS_COPY.noGithub,
  command: null,
  testCommand: null,
  proposals: [],
  error: null,
};

/** What the server does with a confirmed patch: it changes the project's config, and a saved field drops its proposals. */
function applied(now: ChecksView, patch: ChecksPatch): ChecksView {
  const saved = (field: "command" | "testCommand") => patch[field] !== undefined;
  return {
    ...now,
    ...(patch.where === undefined ? {} : { where: patch.where ?? now.where, chosen: patch.where !== null }),
    ...(patch.command === undefined ? {} : { command: patch.command }),
    ...(patch.testCommand === undefined ? {} : { testCommand: patch.testCommand }),
    proposals: now.proposals.filter((p) => !saved(p.field)),
  };
}

export function fakeChecksServer(given: Record<string, ChecksView>, calls: string[]): ChecksBridge {
  const views = new Map(Object.entries(given));
  const viewOf = (dir: string) => views.get(dir) ?? NO_CHECKS;
  return {
    load: async (dir) => viewOf(dir),
    set: async (dir, patch) => {
      calls.push(`checks.set:${dir}:${JSON.stringify(patch)}`);
      const next = applied(viewOf(dir), patch);
      views.set(dir, next);
      return next;
    },
  };
}
