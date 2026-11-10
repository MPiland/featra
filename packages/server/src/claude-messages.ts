/**
 * Turns the Agent SDK's message stream into chat events (ADR 0018). The stream is the agent's output, so it is read
 * as `unknown` and narrowed here, at the boundary. Only the main conversation shows: a subagent's own messages
 * (`parent_tool_use_id` set) stay inside its Task row.
 */
import { isRecord, type ChatEvent } from "@featra/work-format";

/** A failed turn that said nothing about why. */
export const FAILED = "The agent stopped with an error.";

export interface ClaudeTranslator {
  /** The events one SDK message adds. */
  translate: (message: unknown) => ChatEvent[];
  /** A new turn begins: nothing from the last one carries over. */
  newTurn: () => void;
  /** The user pressed Stop during the running turn: its result reads as stopped, not failed. */
  interrupted: () => void;
  /**
   * The context the last assistant message of the turn put in use, as a `usage` event with no window (history has no
   * result to name one); null when the turn had none. Read from the messages' own `usage`: no tokens are spent.
   */
  turnUsage: () => ChatEvent | null;
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

const count = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;

/**
 * The tokens an assistant message's `usage` puts in the context: what the model read (new input, cache reads and
 * cache writes) and wrote. The last main-conversation message of a turn is the context the next turn starts from.
 */
function contextTokens(usage: unknown): number | null {
  if (!isRecord(usage)) return null;
  const total =
    count(usage.input_tokens) +
    count(usage.cache_read_input_tokens) +
    count(usage.cache_creation_input_tokens) +
    count(usage.output_tokens);
  return total > 0 ? total : null;
}

/**
 * The model's context window, from the result's `modelUsage` (keyed by model id): the entry for the session's model, or
 * the only entry. Anything else (several models, none named like the session's) gives null: Featra doesn't guess.
 */
function contextWindow(modelUsage: unknown, model: string): number | null {
  if (!isRecord(modelUsage)) return null;
  const entries = Object.entries(modelUsage).filter((e): e is [string, Record<string, unknown>] => isRecord(e[1]));
  const own = entries.find(([name]) => name === model) ?? (entries.length === 1 ? entries[0] : undefined);
  const window = own?.[1].contextWindow;
  return typeof window === "number" && window > 0 ? window : null;
}

/** `session` is the session a resumed chat goes on with, until the agent reports its own. */
export function createClaudeTranslator(session: string | null = null): ClaudeTranslator {
  let stopping = false;
  let loggedOut = false;
  /** Assistant messages whose text came as deltas, so their full copy adds no text. */
  const streamed = new Set<string>();
  let current = "";
  /** The model the agent reported at start, and the context its last assistant message used this turn. */
  let model = "";
  let used: number | null = null;

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

  /**
   * Logged out is known only from the SDK's own signal: Featra reads no credential file, and a reply that merely
   * mentions logging in is still a reply.
   */
  function assistant(message: Record<string, unknown>, error: unknown): ChatEvent[] {
    if (error === "authentication_failed") return logout();
    const id = text(message.id);
    used = contextTokens(message.usage) ?? used;
    return records(message.content).flatMap((block, i): ChatEvent[] => {
      if (block.type === "text" && !streamed.has(id)) {
        const t = text(block.text);
        return t ? [{ type: "text", block: `${id}:${i}`, delta: t }] : [];
      }
      if (block.type === "tool_use" && typeof block.id === "string" && typeof block.name === "string") {
        return [{ type: "tool", id: block.id, name: block.name, input: block.input ?? null }];
      }
      return [];
    });
  }

  /** The turn's context for the meter, once, before the turn's end. */
  const usageEvents = (window: number | null): ChatEvent[] => {
    const now = used;
    used = null;
    return now === null ? [] : [{ type: "usage", used: now, window }];
  };

  function result(message: Record<string, unknown>): ChatEvent[] {
    const usage = usageEvents(contextWindow(message.modelUsage, model));
    return [...usage, ...ended(message)];
  }

  function ended(message: Record<string, unknown>): ChatEvent[] {
    const wasStopped = stopping;
    const wasLoggedOut = loggedOut;
    stopping = false;
    loggedOut = false;
    if (wasStopped) return [{ type: "turn-end", outcome: "stopped" }];
    if (wasLoggedOut) return [{ type: "turn-end", outcome: "failed" }];
    if (message.is_error !== true && message.subtype === "success") return [{ type: "turn-end", outcome: "done" }];
    const errors = Array.isArray(message.errors) ? message.errors.filter((e) => typeof e === "string") : [];
    const why = text(message.result) || errors.join(" ") || FAILED;
    return [
      { type: "problem", problem: { type: "failed", message: why } },
      { type: "turn-end", outcome: "failed" },
    ];
  }

  return {
    translate(message) {
      if (!isRecord(message)) return [];
      if (message.parent_tool_use_id !== null && message.parent_tool_use_id !== undefined) return [];
      switch (message.type) {
        case "system":
          if (message.subtype !== "init") return [];
          session = text(message.session_id) || session;
          model = text(message.model);
          used = null;
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
    newTurn: () => {
      stopping = false;
      loggedOut = false;
    },
    interrupted: () => {
      stopping = true;
    },
    turnUsage: () => usageEvents(null)[0] ?? null,
    sessionId: () => session,
  };
}
