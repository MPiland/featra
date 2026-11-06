/**
 * Setting a project up for Featra: git, then `.featra/` and the knowledge files. The local server detects and
 * writes (ADR 0012); this module holds the bridge's shape for it, the wording the offer uses, and how the client
 * calls the server.
 */
import { errorMessage } from "@featra/work-format/guards";
import {
  normalizeInitResult,
  normalizeProjectSetup,
  type InitResult,
  type ProjectSetup,
} from "@featra/work-format/protocol";
import type { ServerClient } from "./server-client.ts";

export type { InitResult, ProjectSetup };

export interface ProjectSetupBridge {
  /** Whether the folder is a git repository and holds `.featra/`. */
  status: (dir: string) => Promise<ProjectSetup>;
  /** `git init` in a folder that isn't in a repository yet; answers with the new status. */
  initGit: (dir: string) => Promise<ProjectSetup>;
  /** Scaffolds `.featra/` and the knowledge files that are missing. Never overwrites, never touches CLAUDE.md. */
  initFeatra: (dir: string) => Promise<InitResult>;
}

/** The offer's wording, per state. Short and standard: the full guided setup is STORY-33. */
export const SETUP_COPY = {
  "no-git": { message: "This folder isn't a git repository.", action: "Initialize Git" },
  "no-featra": { message: "Featra isn't set up in this project.", action: "Initialize Featra" },
  notNow: "Not now",
  region: "Project setup",
} as const;

const setupError = (err: unknown): ProjectSetup => ({ state: "error", error: errorMessage(err) });

/** The bridge's setup methods over the server client. Transport failures become errors the offer can show. */
export function serverSetup(server: ServerClient): ProjectSetupBridge {
  return {
    status: (dir) => server.call("project.setupStatus", { dir }).then(normalizeProjectSetup, setupError),
    initGit: (dir) => server.call("project.gitInit", { dir }).then(normalizeProjectSetup, setupError),
    initFeatra: (dir) =>
      server
        .call("project.init", { dir })
        .then(normalizeInitResult, (err: unknown): InitResult => ({ ok: false, error: errorMessage(err) })),
  };
}

/** A browser tab has no folders, so nothing to set up. */
export function noSetup(error: string): ProjectSetupBridge {
  return {
    status: async () => ({ state: "error", error }),
    initGit: async () => ({ state: "error", error }),
    initFeatra: async () => ({ ok: false, error }),
  };
}
