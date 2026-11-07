/**
 * Setting a project up for Featra: git, then `.featra/` and the knowledge files. The local server detects and
 * writes (ADR 0012); this module holds the bridge's shape for it and how the client calls the server.
 */
import { errorMessage } from "@featra/work-format/guards";
import {
  normalizeInitResult,
  normalizeProjectSetup,
  type InitResult,
  type ProjectSetup,
} from "@featra/work-format/protocol";
import { normalizeSetupPlan, type SetupItemId, type SetupPlan } from "@featra/work-format/setup-plan";
import type { ServerClient } from "./server-client.ts";

export type { InitResult, ProjectSetup, SetupItemId, SetupPlan };

export interface ProjectSetupBridge {
  /** Whether the folder is a git repository and holds `.featra/`. */
  status: (dir: string) => Promise<ProjectSetup>;
  /** Whether the folder is a repository, and which setup items are already there (STORY-42). */
  plan: (dir: string) => Promise<SetupPlan>;
  /**
   * Sets the project up in one pass: `git init` if needed, then the required items and the chosen ones. Never
   * overwrites, never touches CLAUDE.md or AGENTS.md.
   */
  run: (dir: string, items: readonly SetupItemId[]) => Promise<InitResult>;
}

const setupError = (err: unknown): ProjectSetup => ({ state: "error", error: errorMessage(err) });
const failed = (err: unknown): { ok: false; error: string } => ({ ok: false, error: errorMessage(err) });

/** The bridge's setup methods over the server client. Transport failures become errors the page can show. */
export function serverSetup(server: ServerClient): ProjectSetupBridge {
  return {
    status: (dir) => server.call("project.setupStatus", { dir }).then(normalizeProjectSetup, setupError),
    plan: (dir) => server.call("project.setupPlan", { dir }).then(normalizeSetupPlan, failed),
    run: (dir, items) => server.call("project.setup", { dir, items: [...items] }).then(normalizeInitResult, failed),
  };
}

/** A browser tab has no folders, so nothing to set up. */
export function noSetup(error: string): ProjectSetupBridge {
  return {
    status: async () => ({ state: "error", error }),
    plan: async () => ({ ok: false, error }),
    run: async () => ({ ok: false, error }),
  };
}
