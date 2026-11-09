/**
 * The Featra MCP's way into the server (STORY-47, ADR 0019). For each chat whose project has the MCP on, the bridge
 * describes the stdio server the agent is given (`attach`) and mints a secret that only that chat's MCP process holds.
 * The process connects to the server's agent socket with it, and the server takes the chat from the secret, never from
 * what the process says, so an agent can log into its own chat and do nothing else.
 */
import { randomBytes } from "node:crypto";
import {
  AGENT_PATH,
  parseLogInput,
  SERVER_HOST,
  isRecord,
  type AgentMethod,
  type LoggedEntry,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import type { McpAttach } from "./chat-manager-types.ts";
import type { ChatManager } from "./chat-manager.ts";
import type { LogWriter } from "./log-writer.ts";
import type { McpServerSpec } from "./provider.ts";

/** The name agents see: their tools are `mcp__featra__<tool>` (Claude). */
export const MCP_NAME = "featra";

export interface AgentBridgeDeps {
  /** The MCP's script (`dist/mcp.cjs` in the app). Without it no agent gets the MCP. */
  entry: string | null;
  /** The runtime that runs it: Electron's executable in the app (as Node), Node in tests. */
  execPath?: string;
  /** Whether a project's agents get the MCP: its setting, then the app default (ADR 0006). */
  enabled: (dir: string) => Promise<boolean>;
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
  chats,
  writer,
  newToken = () => randomBytes(24).toString("base64url"),
}: AgentBridgeDeps): AgentBridge {
  const byChat = new Map<string, string>();
  const byToken = new Map<string, string>();
  let port: number | null = null;

  const release = (chat: string) => {
    const token = byChat.get(chat);
    if (token) byToken.delete(token);
    byChat.delete(chat);
  };

  return {
    setPort: (next) => {
      port = next;
    },
    async attach({ id, dir }): Promise<McpServerSpec | null> {
      if (!entry || port === null || !(await enabled(dir))) return null;
      // An agent that starts again in the same chat keeps its secret.
      const token = byChat.get(id) ?? newToken();
      byChat.set(id, token);
      byToken.set(token, id);
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
    resolve: (token) => byToken.get(token) ?? null,
    async call(chat, _method, params) {
      const info = chats.info(chat);
      if (!info) throw new ApiError("No such chat.");
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
