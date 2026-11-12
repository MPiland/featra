/**
 * The checks bridge (STORY-56): Settings > Project > Workflow > Checks reads where checks run and the two commands from
 * the local server, and writes the user's confirmed values through it. The server writes only the project's config.
 */
import { errorMessage } from "@featra/work-format/guards";
import { normalizeChecksView, type ChecksPatch, type ChecksView } from "@featra/work-format/checks";
import type { ServerClient } from "./server-client.ts";

export type { ChecksPatch, ChecksView };

export interface ChecksBridge {
  /** Where checks run for the project, its two commands and the commands proposed to it. */
  load: (dir: string) => Promise<ChecksView>;
  /** Saves the user's confirmed values; answers with the section as it is after, or why not (`error`). */
  set: (dir: string, patch: ChecksPatch) => Promise<ChecksView>;
}

const failed = (error: string): ChecksView => ({
  where: "local",
  chosen: false,
  reason: "",
  command: null,
  testCommand: null,
  proposals: [],
  unconfirmed: [],
  error,
});

const read = (call: Promise<unknown>) => call.then(normalizeChecksView, (err: unknown) => failed(errorMessage(err)));

/** The bridge's checks methods over the server client. */
export function serverChecks(server: ServerClient): ChecksBridge {
  return {
    load: (dir) => read(server.call("checks.load", { dir })),
    set: (dir, patch) => read(server.call("checks.set", { dir, patch })),
  };
}

/** A browser tab has no folders, so no checks. */
export function noChecks(error: string): ChecksBridge {
  return { load: async () => failed(error), set: async () => failed(error) };
}

export const CHECKS_PAGE_COPY = {
  title: "Checks",
  intro: "Checks prove a story's work. They run where you choose.",
  where: "Where checks run",
  ci: "CI",
  local: "This computer",
  command: "Check command",
  commandHint: "Runs in the story's worktree. For example: pnpm test",
  testCommand: "Linked test command",
  testHint:
    "Runs a criterion's linked tests, once per file. Use {file}, {namePattern} (or {name} for one test) and {report}: the runner must write a JUnit report there, or nothing is proven. Tests under e2e aren't run.",
  changed: "Changed in the project's config",
  confirm: "Confirm",
  proposed: (source: string) => (source === "dev-lead" ? "Proposed by the Dev Lead" : "Found in package.json"),
  use: "Use this",
  save: "Save",
  saved: "Saved",
  loading: "Loading…",
} as const;
