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
  parseLogInput,
  SERVER_HOST,
  isRecord,
  type AgentMethod,
  type KnowledgePermission,
  type LoggedEntry,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import type { McpAttach } from "./chat-manager-types.ts";
import type { ChatManager } from "./chat-manager.ts";
import type { LogWriter } from "./log-writer.ts";
import type { McpServerSpec } from "./provider.ts";
import { sameSecret } from "./secret.ts";

/** The name agents see: their tools are `mcp__featra__<tool>` (Claude). */
export const MCP_NAME = "featra";

/** What an agent is told when logging is off. */
export const AGENT_MESSAGES = {
  mcpOff: "Featra MCP is off for this project.",
  readOnly: "Logging is off: this project's knowledge setting is read-only.",
} as const;

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
  chats: Pick<ChatManager, "info" | "report">;
  writer: LogWriter;
  newToken?: () => string;
}

export interface AgentBridge extends McpAttach {
  /** Where the server listens, once it does: until then no chat is given the MCP. */
  setPort: (port: number | null) => void;
  /** The chat a connection's secret belongs to; null for any other. */
  resolve: (token: string) => string | null;
  /** One request from a chat's MCP process. */
  call: (chat: string, method: AgentMethod, params: unknown) => Promise<LoggedEntry>;
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
  newToken = () => randomBytes(24).toString("base64url"),
}: AgentBridgeDeps): AgentBridge {
  const byChat = new Map<string, string>();
  let port: number | null = null;
  let missingReported = false;

  const release = (chat: string) => {
    byChat.delete(chat);
  };

  /** Why logging is off for the project, or null when it is on. Read each time, so Settings applies at once. */
  async function refusal(dir: string): Promise<string | null> {
    if (!(await enabled(dir))) return AGENT_MESSAGES.mcpOff;
    return (await knowledge(dir)) === "read-only" ? AGENT_MESSAGES.readOnly : null;
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
    async call(chat, _method, params) {
      const info = chats.info(chat);
      if (!info) throw new ApiError("No such chat.");
      const off = await refusal(info.dir);
      if (off !== null) throw new ApiError(off);
      const input = parseLogInput(isRecord(params) ? params.kind : undefined, params);
      if (!input.ok) throw new ApiError(input.error);
      const { entry: id, file, summary } = await writer.append(info.dir, chat, input.value, info.session);
      chats.report(chat, { type: "logged", entry: id, file, summary });
      return { entry: id, file };
    },
    async undo(chat, id) {
      await writer.undo(chat, id);
      chats.report(chat, { type: "log-undone", entry: id });
    },
  };
}
