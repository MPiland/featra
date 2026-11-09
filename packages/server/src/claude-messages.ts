/**
 * Turns the Agent SDK's message stream into chat events (ADR 0018). The stream is the agent's output, so it is read
 * as `unknown` and narrowed here, at the boundary. Only the main conversation shows: a subagent's own messages
 * (`parent_tool_use_id` set) stay inside its Task row.
 */
import { isRecord, type ChatEvent } from "@featra/work-format";

/** What `claude` says when it has no login. Featra reads no credential file, so the stream is the only way to know. */
const LOGGED_OUT = /not logged in|please run \/login|invalid api key/i;

/** A failed turn that said nothing about why. */
export const FAILED = "The agent stopped with an error.";

export interface ClaudeTranslator {
  /** The events one SDK message adds. */
  translate: (message: unknown) => ChatEvent[];
  /** The user pressed Stop: the turn's result reads as stopped, not failed. */
  interrupted: () => void;
  /** The session id the agent reported, once it has. */
  sessionId: () => string | null;
}

const records = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter(isRecord) : []);
const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** A tool result's content, as text: a string, or its text blocks joined, with a mark for anything else. */
function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  return records(content)
    .map((block) => (block.type === "text" ? text(block.text) : `[${text(block.type) || "content"}]`))
    .join("\n");
}

/** The tool results a user message carries. */
function toolResults(message: Record<string, unknown>): ChatEvent[] {
  return records(message.content).flatMap((block): ChatEvent[] =>
    block.type === "tool_result" && typeof block.tool_use_id === "string"
      ? [
          {
            type: "tool-result",
            id: block.tool_use_id,
            output: resultText(block.content),
            isError: block.is_error === true,
          },
        ]
      : [],
  );
}

export function createClaudeTranslator(): ClaudeTranslator {
  let session: string | null = null;
  let stopping = false;
  let loggedOut = false;
  /** Assistant messages whose text came as deltas, so their full copy adds no text. */
  const streamed = new Set<string>();
  let current = "";

  const logout = (): ChatEvent[] => {
    if (loggedOut) return [];
    loggedOut = true;
    return [{ type: "problem", problem: { type: "logged-out" } }];
  };

  function streamEvent(event: Record<string, unknown>): ChatEvent[] {
    if (event.type === "message_start" && isRecord(event.message)) {
      current = text(event.message.id);
      return [];
    }
    if (event.type !== "content_block_delta" || !isRecord(event.delta) || event.delta.type !== "text_delta") return [];
    if (!current) return [];
    streamed.add(current);
    const delta = text(event.delta.text);
    return delta ? [{ type: "text", block: `${current}:${String(event.index)}`, delta }] : [];
  }

  function assistant(message: Record<string, unknown>, error: unknown): ChatEvent[] {
    if (error === "authentication_failed") return logout();
    const id = text(message.id);
    return records(message.content).flatMap((block, i): ChatEvent[] => {
      if (block.type === "text" && !streamed.has(id)) {
        const t = text(block.text);
        if (LOGGED_OUT.test(t)) return logout();
        return t ? [{ type: "text", block: `${id}:${i}`, delta: t }] : [];
      }
      if (block.type === "tool_use" && typeof block.id === "string" && typeof block.name === "string") {
        return [{ type: "tool", id: block.id, name: block.name, input: block.input ?? null }];
      }
      return [];
    });
  }

  function result(message: Record<string, unknown>): ChatEvent[] {
    const wasStopped = stopping;
    const wasLoggedOut = loggedOut;
    stopping = false;
    loggedOut = false;
    if (wasStopped) return [{ type: "turn-end", outcome: "stopped" }];
    if (wasLoggedOut) return [{ type: "turn-end", outcome: "failed" }];
    if (message.is_error !== true && message.subtype === "success") return [{ type: "turn-end", outcome: "done" }];
    const errors = Array.isArray(message.errors) ? message.errors.filter((e) => typeof e === "string") : [];
    const why = text(message.result) || errors.join(" ") || FAILED;
    const problem: ChatEvent = LOGGED_OUT.test(why)
      ? { type: "problem", problem: { type: "logged-out" } }
      : { type: "problem", problem: { type: "failed", message: why } };
    return [problem, { type: "turn-end", outcome: "failed" }];
  }

  return {
    translate(message) {
      if (!isRecord(message)) return [];
      if (message.parent_tool_use_id !== null && message.parent_tool_use_id !== undefined) return [];
      switch (message.type) {
        case "system":
          if (message.subtype !== "init") return [];
          session = text(message.session_id) || session;
          return [{ type: "started", model: text(message.model) }];
        case "stream_event":
          return isRecord(message.event) ? streamEvent(message.event) : [];
        case "assistant":
          return isRecord(message.message) ? assistant(message.message, message.error) : [];
        case "user":
          return isRecord(message.message) ? toolResults(message.message) : [];
        case "result":
          return result(message);
        default:
          return [];
      }
    },
    interrupted: () => {
      stopping = true;
    },
    sessionId: () => session,
  };
}
