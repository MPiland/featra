import { createAgentBridge, type AgentBridge } from "./agent-bridge.ts";
import type { AllowedProjects } from "./allowed-projects.ts";
import { createApi, type Api } from "./api.ts";
import { createCardActions } from "./card-actions.ts";
import { createCardLane } from "./card-lane.ts";
import { createChatManager } from "./chat-manager.ts";
import { fileChatStore, memoryChatStore, type ChatStore } from "./chat-store.ts";
import { locateClaude } from "./claude-locate.ts";
import { createClaudeProvider, type ClaudeDeps } from "./claude-provider.ts";
import { loadAgentQuery } from "./claude-sdk.ts";
import { createDraftActions } from "./draft-actions.ts";
import { createDraftReview } from "./draft-review.ts";
import { createDraftWriter } from "./draft-writer.ts";
import { createFeatureStart } from "./feature-start.ts";
import { createStorySpawn } from "./story-spawn.ts";
import { createStoryStop } from "./story-stop.ts";
import { createCopyActions } from "./copy-actions.ts";
import { createGit } from "./git.ts";
import { createLogWriter, type LogWriterDeps } from "./log-writer.ts";
import { readKnowledge, readMcpEnabled, readMaxStoryAgents } from "./mcp-enabled.ts";
import { createRepoGit, type RepoGit } from "./repo-git.ts";
import { createClaudeReader } from "./claude-reader.ts";
import { createCodexReader } from "./codex-reader.ts";
import { createRoleRegistry } from "./role-registry.ts";
import { nodeRoleFs, type RoleFs } from "./role-fs.ts";
import { createRoleWatches } from "./role-watch.ts";
import { createWorkWatches, type WatchFolder } from "./work-watch.ts";
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
  /** How the role watches open folders, in place of `fs.watch`: tests count the watchers still open. */
  roleWatchFolder?: WatchFolder;
  /** The Featra MCP's script (`dist/mcp.cjs`); without it no agent gets the MCP (STORY-47). */
  mcpEntry?: string;
  /** The runtime that runs the MCP script: this process's by default. */
  mcpExecPath?: string;
  /** How entries agents log are written and dated: the real disk and clock by default. */
  logs?: LogWriterDeps;
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
  roleFs = nodeRoleFs({}, null, null),
  roleWatchFolder,
  mcpEntry,
  mcpExecPath,
  logs,
}: ServiceOptions): {
  api: Api;
  /** The agents' side of the server: their secrets, and what the agent socket answers (ADR 0019). */
  agents: AgentBridge;
  close: () => Promise<void>;
} {
  const scanner = createScanner(repoGit);
  const watches = createWorkWatches(scanner, log);
  const copies = createCopyActions({ git: repoGit, scan: watches.scan, now });
  // One lane for every card write: a draft that allocates IDs and a card edit never interleave (ADR 0002).
  const lane = createCardLane();
  const cards = createCardActions({ scan: watches.scan, now, lane });
  const roles = createRoleRegistry({
    fs: roleFs,
    readers: [createClaudeReader(roleFs), createCodexReader(roleFs)],
    log,
  });
  const roleWatches = createRoleWatches(roles, log, roleWatchFolder);
  const store = chatStore ?? (dataDir ? fileChatStore(dataDir) : memoryChatStore());
  // The bridge needs the chats and the chats need the bridge to give each agent the MCP, so the manager reaches it late.
  const chats = createChatManager({
    providers: [createClaudeProvider(claude)],
    roles,
    log,
    store,
    storyLimit: readMaxStoryAgents(dataDir),
    mcp: { attach: (chat) => agents.attach(chat), release: (chat) => agents.release(chat) },
  });
  const starts = createFeatureStart({ scan: watches.scan, now, lane, gitCommand });
  const spawns = createStorySpawn({ scan: watches.scan, now, lane, chats, gitCommand });
  const stops = createStoryStop({ scan: watches.scan, now, lane, chats });
  const drafts = createDraftActions({ scan: watches.scan, now, lane, chats });
  const agents = createAgentBridge({
    entry: mcpEntry ?? null,
    execPath: mcpExecPath,
    enabled: readMcpEnabled(dataDir),
    knowledge: readKnowledge(dataDir),
    log,
    chats,
    writer: createLogWriter({ now, ...logs }),
    drafts: createDraftWriter({ scan: watches.scan, now, lane }),
    starts,
    spawns,
  });
  // A project the user closed takes its chats with it.
  const stopClosing = allowed.onChange(() => {
    chats.closeProjects(allowed.has);
    roleWatches.closeProjects(allowed.has);
  });
  const api = createApi({
    git: createGit(gitCommand),
    allowed,
    watches,
    copies,
    cards,
    drafts,
    review: createDraftReview({ scan: watches.scan, now, lane, gitCommand }),
    starts,
    spawns,
    stops,
    chats,
    roles,
    roleWatches,
    agents,
  });
  return {
    api,
    agents,
    async close() {
      stopClosing();
      chats.close();
      await chats.flush();
      watches.close();
      roleWatches.close();
      await scanner.close();
    },
  };
}
