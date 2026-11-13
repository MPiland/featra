/**
 * The Featra MCP's way into the server (STORY-47, ADR 0019). For each chat whose project has the MCP on, the bridge
 * describes the stdio server the agent is given (`attach`) and mints a secret that only that chat's MCP process holds.
 * The process connects to the server's agent socket with it, and the server takes the chat from the secret, never from
 * what the process says, so an agent can log into its own chat and do nothing else.
 */
import { randomBytes } from "node:crypto";
import { access } from "node:fs/promises";
import {
  AGENT_PATH,
  assertNever,
  parseDraft,
  parseLogInput,
  parseReportInput,
  parseSpawnInput,
  parseStartInput,
  starter,
  SERVER_HOST,
  isRecord,
  type AgentMethod,
  type AgentMethods,
  type KnowledgePermission,
} from "@featra/work-format";
import { createLeadCalls } from "./agent-lead.ts";
import { AGENT_MESSAGES } from "./agent-messages.ts";
import { ApiError } from "./api-error.ts";
import type { McpAttach } from "./chat-manager-types.ts";
import type { ChatManager } from "./chat-manager.ts";
import type { CardReport } from "./card-report.ts";
import type { CheckSettings } from "./check-settings.ts";
import type { DraftWriter } from "./draft-writer.ts";
import type { FeatureStart } from "./feature-start.ts";
import type { BugRequest } from "./bug-request.ts";
import type { MergeRequest } from "./merge-request.ts";
import type { StoryMessage } from "./story-message.ts";
import type { StorySpawn } from "./story-spawn.ts";
import type { LogWriter } from "./log-writer.ts";
import type { McpServerSpec } from "./provider.ts";
import { sameSecret } from "./secret.ts";

/** The name agents see: their tools are `mcp__featra__<tool>` (Claude). */
export const MCP_NAME = "featra";

export { AGENT_MESSAGES } from "./agent-messages.ts";

type ChatInfo = NonNullable<ReturnType<Pick<ChatManager, "info">["info"]>>;

export interface AgentBridgeDeps {
  /** The MCP's script (`dist/mcp.cjs` in the app). Without it no agent gets the MCP. */
  entry: string | null;
  /** The runtime that runs it: Electron's executable in the app (as Node), Node in tests. */
  execPath?: string;
  /** Whether a project's agents get the MCP: its setting, then the app default (ADR 0006). */
  enabled: (dir: string) => Promise<boolean>;
  /** What the project lets agents do to its knowledge files; read-only turns logging off. Propose by default. */
  knowledge?: (dir: string) => Promise<KnowledgePermission>;
  /** Whether the MCP's script is there (it is missing from a build that didn't make it). */
  exists?: (file: string) => Promise<boolean>;
  log?: (message: string) => void;
  chats: Pick<ChatManager, "info" | "report" | "retitle">;
  writer: LogWriter;
  /** Writes the cards agents draft (STORY-8). Without it `cards.draft` is refused. */
  drafts?: DraftWriter;
  /** Starts approved features (STORY-52). Without it `feature.start` is refused. */
  starts?: FeatureStart;
  /** Starts story sessions (STORY-9). Without it `story.spawn` is refused. */
  spawns?: StorySpawn;
  /** Writes agents' reports on cards (STORY-10). Without it `card.update` is refused. */
  reports?: CardReport;
  /** Sends the Dev Lead's messages to story sessions (STORY-54). Without it `session.message` is refused. */
  messages?: StoryMessage;
  /** Keeps the Dev Lead's check-command proposals for the user to confirm (STORY-56). Without it `checks.propose` is refused. */
  checkSettings?: Pick<CheckSettings, "propose">;
  /** Asks the user to merge a story for the Dev Lead (STORY-12). Without it `story.requestMerge` is refused. */
  merges?: MergeRequest;
  /** Asks the user to place a bug the Dev Lead reports (STORY-13). Without it `bug.report` is refused. */
  bugs?: BugRequest;
  newToken?: () => string;
}

export interface AgentBridge extends McpAttach {
  /** Where the server listens, once it does: until then no chat is given the MCP. */
  setPort: (port: number | null) => void;
  /** The chat a connection's secret belongs to; null for any other. */
  resolve: (token: string) => string | null;
  /** One request from a chat's MCP process. */
  call: (chat: string, method: AgentMethod, params: unknown) => Promise<AgentMethods[AgentMethod]["result"]>;
  /** Takes back an entry the chat's agent logged (the user's Undo). */
  undo: (chat: string, entry: string) => Promise<void>;
}

export function createAgentBridge({
  entry,
  execPath = process.execPath,
  enabled,
  knowledge = () => Promise.resolve("propose"),
  exists = (file) =>
    access(file).then(
      () => true,
      () => false,
    ),
  log = () => {},
  chats,
  writer,
  drafts,
  starts,
  spawns,
  reports,
  messages,
  checkSettings,
  merges,
  bugs,
  newToken = () => randomBytes(24).toString("base64url"),
}: AgentBridgeDeps): AgentBridge {
  const byChat = new Map<string, string>();
  let port: number | null = null;
  let missingReported = false;

  const release = (chat: string) => {
    byChat.delete(chat);
  };

  /** Why the MCP is off for the project, or null when it is on. Read each time, so Settings applies at once. */
  async function mcpRefusal(dir: string): Promise<string | null> {
    return (await enabled(dir)) ? null : AGENT_MESSAGES.mcpOff;
  }

  const leads = createLeadCalls({ mcpRefusal, messages, checkSettings, merges, bugs });

  /**
   * Why agents may not write to the project: the MCP is off, or its knowledge setting is read-only, which keeps agents
   * from writing anything (logs and drafted cards alike), so the MCP is not offered at all (`attach`).
   */
  async function refusal(dir: string, readOnly: string = AGENT_MESSAGES.readOnly): Promise<string | null> {
    return (await mcpRefusal(dir)) ?? ((await knowledge(dir)) === "read-only" ? readOnly : null);
  }

  /** Logs go where the agent works (a story session's worktree), never into the user's own checkout. */
  async function appendLog(chat: string, dir: string, cwd: string, session: string, params: unknown) {
    const off = await refusal(dir);
    if (off !== null) throw new ApiError(off);
    const input = parseLogInput(isRecord(params) ? params.kind : undefined, params);
    if (!input.ok) throw new ApiError(input.error);
    const { entry: id, file, summary } = await writer.append(cwd, chat, input.value, session);
    chats.report(chat, { type: "logged", entry: id, file, summary });
    return { entry: id, file };
  }

  async function draft(chat: string, dir: string, params: unknown) {
    const off = await refusal(dir, AGENT_MESSAGES.draftReadOnly);
    if (off !== null) throw new ApiError(off);
    if (!drafts) throw new ApiError(AGENT_MESSAGES.noDrafts);
    const input = parseDraft(params);
    if (!input.ok) throw new ApiError(input.error);
    const result = await drafts.draft(dir, chat, input.value);
    // The chat takes the feature's title (STORY-49); a name the user set stays. The cards are already written, so a
    // rename that fails is logged and the call still succeeds.
    try {
      chats.retitle(chat, input.value.feature.title, "draft");
    } catch (error) {
      log(`Couldn't rename chat ${chat} after its draft: ${error instanceof Error ? error.message : String(error)}`);
    }
    return result;
  }

  async function start(chat: string, dir: string, params: unknown) {
    const off = await refusal(dir, AGENT_MESSAGES.startReadOnly);
    if (off !== null) throw new ApiError(off);
    if (!starts) throw new ApiError(AGENT_MESSAGES.noStart);
    const input = parseStartInput(params);
    if (!input.ok) throw new ApiError(input.error);
    return starts.start(dir, input.id, starter(chat));
  }

  async function spawn(chat: string, dir: string, story: boolean | undefined, params: unknown) {
    if (story) throw new ApiError(AGENT_MESSAGES.sessionSpawn);
    const off = await refusal(dir, AGENT_MESSAGES.spawnReadOnly);
    if (off !== null) throw new ApiError(off);
    if (!spawns) throw new ApiError(AGENT_MESSAGES.noSpawn);
    const input = parseSpawnInput(params);
    if (!input.ok) throw new ApiError(input.error);
    return spawns.spawn(dir, input.value, chat);
  }

  async function update(chat: string, info: ChatInfo, params: unknown) {
    const off = await refusal(info.dir, AGENT_MESSAGES.updateReadOnly);
    if (off !== null) throw new ApiError(off);
    if (!reports) throw new ApiError(AGENT_MESSAGES.noUpdate);
    const input = parseReportInput(params);
    if (!input.ok) throw new ApiError(input.error);
    return reports.report(info.dir, { chat, story: info.storyId ?? null }, info.session, input.value, info.cwd);
  }

  return {
    setPort: (next) => {
      port = next;
    },
    async attach({ id, dir }): Promise<McpServerSpec | null> {
      // A chat that is no longer offered the MCP loses its secret, so a running agent can't go on logging.
      const offered = entry !== null && port !== null && (await refusal(dir)) === null;
      const built = offered && (await exists(entry));
      if (offered && !built && !missingReported) {
        missingReported = true;
        log(`The Featra MCP (${entry}) is missing, so agents get no Featra tools. Rebuild the app.`);
      }
      if (!built) {
        release(id);
        return null;
      }
      // An agent that starts again in the same chat keeps its secret.
      const token = byChat.get(id) ?? newToken();
      byChat.set(id, token);
      return {
        name: MCP_NAME,
        command: execPath,
        args: [entry],
        env: {
          // Electron runs the script as plain Node with this; Node ignores it.
          ELECTRON_RUN_AS_NODE: "1",
          FEATRA_AGENT_URL: `ws://${SERVER_HOST}:${port}${AGENT_PATH}`,
          FEATRA_AGENT_TOKEN: token,
        },
      };
    },
    release,
    resolve(token) {
      // Every secret is compared, in constant time, whether or not an earlier one matched.
      let found: string | null = null;
      for (const [chat, secret] of byChat) if (sameSecret(token, secret)) found = chat;
      return found;
    },
    async call(chat, method, params) {
      const info = chats.info(chat);
      if (!info) throw new ApiError("No such chat.");
      switch (method) {
        case "cards.draft":
          return draft(chat, info.dir, params);
        case "feature.start":
          return start(chat, info.dir, params);
        case "story.spawn":
          return spawn(chat, info.dir, info.story, params);
        case "card.update":
          return update(chat, info, params);
        case "session.message":
          return leads.message(chat, info.dir, info.story, params);
        case "checks.propose":
          return leads.propose(info.dir, info.story, params);
        case "story.requestMerge":
          return leads.requestMerge(chat, info.dir, info.story, params);
        case "bug.report":
          return leads.reportBug(chat, info.dir, info.story, params);
        case "log.append":
          return appendLog(chat, info.dir, info.cwd ?? info.dir, info.session, params);
        default:
          return assertNever(method);
      }
    },
    async undo(chat, id) {
      await writer.undo(chat, id);
      chats.report(chat, { type: "log-undone", entry: id });
    },
  };
}
