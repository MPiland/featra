import type { AllowedProjects } from "./allowed-projects.ts";
import { createApi, type Api } from "./api.ts";
import { createCardActions } from "./card-actions.ts";
import { createChatManager } from "./chat-manager.ts";
import { fileChatStore, memoryChatStore, type ChatStore } from "./chat-store.ts";
import { locateClaude } from "./claude-locate.ts";
import { createClaudeProvider, type ClaudeDeps } from "./claude-provider.ts";
import { loadAgentQuery } from "./claude-sdk.ts";
import { createCopyActions } from "./copy-actions.ts";
import { createGit } from "./git.ts";
import { createRepoGit, type RepoGit } from "./repo-git.ts";
import { createClaudeReader } from "./claude-reader.ts";
import { createCodexReader } from "./codex-reader.ts";
import { createRoleRegistry } from "./role-registry.ts";
import { nodeRoleFs, type RoleFs } from "./role-fs.ts";
import { createRoleWatches } from "./role-watch.ts";
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
  /** The app's data folder, where chats are saved (`chats.json`, STORY-44); without it they last until exit. */
  dataDir?: string;
  /** Where chats are kept, in place of `chats.json` in `dataDir`: tests give a slow or failing store. */
  chatStore?: ChatStore;
  /** The disk the roles and the providers' settings are read from; none by default (no home), so a test never reads the real one: `main.ts` gives it this machine's. */
  roleFs?: RoleFs;
}

/** The API with everything behind it, wired as the server process runs it. `close` ends watches and indexes. */
export function createServices({
  allowed,
  log,
  now = () => new Date(),
  gitCommand,
  repoGit = createRepoGit(gitCommand),
  claude = { loadQuery: () => loadAgentQuery(), locate: () => locateClaude() },
  dataDir,
  chatStore,
  roleFs = nodeRoleFs({}, null),
}: ServiceOptions): {
  api: Api;
  close: () => Promise<void>;
} {
  const scanner = createScanner(repoGit);
  const watches = createWorkWatches(scanner, log);
  const copies = createCopyActions({ git: repoGit, scan: watches.scan, now });
  const cards = createCardActions({ scan: watches.scan, now });
  const roles = createRoleRegistry({
    fs: roleFs,
    readers: [createClaudeReader(roleFs), createCodexReader(roleFs)],
    log,
  });
  const roleWatches = createRoleWatches(roles, log);
  const store = chatStore ?? (dataDir ? fileChatStore(dataDir) : memoryChatStore());
  const chats = createChatManager({ providers: [createClaudeProvider(claude)], roles, log, store });
  // A project the user closed takes its chats with it.
  const stopClosing = allowed.onChange(() => chats.closeProjects(allowed.has));
  const api = createApi({ git: createGit(gitCommand), allowed, watches, copies, cards, chats, roles, roleWatches });
  return {
    api,
    async close() {
      stopClosing();
      chats.close();
      await chats.flush();
      watches.close();
      await scanner.close();
    },
  };
}
