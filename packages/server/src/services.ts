import type { AllowedProjects } from "./allowed-projects.ts";
import { createApi, type Api } from "./api.ts";
import { createCardActions } from "./card-actions.ts";
import { createChatManager } from "./chat-manager.ts";
import { locateClaude } from "./claude-locate.ts";
import { createClaudeProvider, type ClaudeDeps } from "./claude-provider.ts";
import { loadAgentQuery } from "./claude-sdk.ts";
import { createCopyActions } from "./copy-actions.ts";
import { createGit } from "./git.ts";
import { createRepoGit, type RepoGit } from "./repo-git.ts";
import { createRoleRegistry } from "./role-registry.ts";
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
  /** How the Claude adapter loads the Agent SDK and finds `claude`; the real ones by default. */
  claude?: ClaudeDeps;
}

/** The API with everything behind it, wired as the server process runs it. `close` ends watches and indexes. */
export function createServices({
  allowed,
  log,
  now = () => new Date(),
  gitCommand,
  repoGit = createRepoGit(gitCommand),
  claude = { loadQuery: () => loadAgentQuery(), locate: () => locateClaude() },
}: ServiceOptions): {
  api: Api;
  close: () => Promise<void>;
} {
  const scanner = createScanner(repoGit);
  const watches = createWorkWatches(scanner, log);
  const copies = createCopyActions({ git: repoGit, scan: watches.scan, now });
  const cards = createCardActions({ scan: watches.scan, now });
  const roles = createRoleRegistry();
  const chats = createChatManager({ providers: [createClaudeProvider(claude)], roles });
  const api = createApi({ git: createGit(gitCommand), allowed, watches, copies, cards, chats, roles });
  return {
    api,
    async close() {
      chats.close();
      watches.close();
      await scanner.close();
    },
  };
}
