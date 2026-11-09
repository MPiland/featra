import type { AllowedProjects } from "./allowed-projects.ts";
import { createApi, type Api } from "./api.ts";
import { createCardActions } from "./card-actions.ts";
import { createCopyActions } from "./copy-actions.ts";
import { createGit } from "./git.ts";
import { createRepoGit, type RepoGit } from "./repo-git.ts";
import { createWorkWatches } from "./work-watch.ts";
import { createScanner } from "./work-scan.ts";

export interface ServiceOptions {
  allowed: AllowedProjects;
  log: (message: string) => void;
  /** The clock history events are stamped with. */
  now?: () => Date;
  /** The git to run; the one on the PATH by default. */
  gitCommand?: string;
  /** The repository reads and restores; the real ones through `gitCommand` by default. */
  repoGit?: RepoGit;
}

/** The API with everything behind it, wired as the server process runs it. `close` ends watches and indexes. */
export function createServices({
  allowed,
  log,
  now = () => new Date(),
  gitCommand,
  repoGit = createRepoGit(gitCommand),
}: ServiceOptions): {
  api: Api;
  close: () => Promise<void>;
} {
  const scanner = createScanner(repoGit);
  const watches = createWorkWatches(scanner, log);
  const copies = createCopyActions({ git: repoGit, scan: watches.scan, now });
  const cards = createCardActions({ scan: watches.scan, now });
  const api = createApi({ git: createGit(gitCommand), allowed, watches, copies, cards });
  return {
    api,
    async close() {
      watches.close();
      await scanner.close();
    },
  };
}
