/** What the server process gives `createServices`: the platform it runs on, which tests stand in for. */
import type { AgentBridge } from "./agent-bridge.ts";
import type { AllowedProjects } from "./allowed-projects.ts";
import type { Api } from "./api.ts";
import type { ChatStore } from "./chat-store.ts";
import type { DevServerDeps, DevServers } from "./dev-servers.ts";
import type { CapturePage } from "./host-capture.ts";
import type { ClaudeDeps } from "./claude-provider.ts";
import type { Timers } from "./inbox.ts";
import type { LogWriterDeps } from "./log-writer.ts";
import type { ProjectNeeds } from "./project-needs.ts";
import type { RepoGit } from "./repo-git.ts";
import type { RoleFs } from "./role-fs.ts";
import type { WatchFolder } from "./work-watch.ts";

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
  /** How long Stop waits for a provider to end the turn it interrupts; ten seconds by default. */
  interruptMs?: number;
  /** The GitHub CLI to ask whether a repo is public; the one on the PATH by default (STORY-56). */
  ghCommand?: string;
  /** How long a `gh` call may take before it is given up; 15 seconds by default. */
  ghTimeoutMs?: number;
  /** How long a check command may run before it is killed (STORY-56). */
  checkTimeoutMs?: number;
  /** The timers PR reads wait on (STORY-11); the real ones by default. */
  prTimers?: Timers;
  /** Captures a page of a story's dev server: the desktop host's in the app (STORY-25); without it none is captured. */
  capturePage?: CapturePage;
  /** How stories' dev servers start and are waited on; the real process, network and clock by default. */
  devServers?: DevServerDeps;
}

/** What `createServices` gives the server process. `close` ends watches and indexes. */
export interface Services {
  api: Api;
  /** The agents' side of the server: their secrets, and what the agent socket answers (ADR 0019). */
  agents: AgentBridge;
  /** What every open project needs from the user: the switcher's watch, and the host's badge (STORY-67). */
  needs: ProjectNeeds;
  /** The host saved the app's settings: an app default turned on may let stories merge on their own (STORY-59). */
  settingsChanged: () => void;
  /** The stories' dev servers Featra started (STORY-25): stopped first when the app quits (host-gone.ts), or one by one. */
  devServers: Pick<DevServers, "stopAll" | "stop" | "running">;
  close: () => Promise<void>;
}
