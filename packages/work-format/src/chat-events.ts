/**
 * A chat as a log of events (ADR 0018). The server's provider adapter turns its agent's stream into these, the
 * session manager keeps the log, and the client folds it into what the chat view shows (`chat-state.ts`). Provider
 * neutral, so a Codex or ACP adapter (M2) feeds the same view.
 */
import { isOneOf, isRecord } from "./utils/guards.ts";

/** Why a chat can't go on: its agent isn't installed, isn't logged in, or failed with a message. */
export type ChatProblem = { type: "not-installed" } | { type: "logged-out" } | { type: "failed"; message: string };

/** How a turn ended: the agent finished, the user stopped it, or it failed (a `problem` event says why). */
export type TurnOutcome = "done" | "stopped" | "failed";
const OUTCOMES: readonly TurnOutcome[] = ["done", "stopped", "failed"];

export type ChatEvent =
  /** The user sent a message: a turn starts. */
  | { type: "user"; text: string }
  /** The agent's session is up, on this model. */
  | { type: "started"; model: string }
  /** More of the agent's reply. `block` names the reply block it belongs to, so a block's deltas join up. */
  | { type: "text"; block: string; delta: string }
  /** The agent called a tool. */
  | { type: "tool"; id: string; name: string; input: unknown }
  /** A tool call's result, as text. */
  | { type: "tool-result"; id: string; output: string; isError: boolean }
  /** Featra denied a tool call that needed approval (until STORY-45 asks the user). */
  | { type: "tool-denied"; id: string; name: string; input: unknown }
  | { type: "turn-end"; outcome: TurnOutcome }
  | { type: "problem"; problem: ChatProblem };

/** What `chat.watch` answers: the chat's whole log so far. Each later event comes as a `chat.event` push. */
export interface ChatSnapshot {
  events: ChatEvent[];
}

const str = (v: unknown): v is string => typeof v === "string";
const nonEmpty = (v: unknown): v is string => str(v) && v.length > 0;

function normalizeProblem(raw: unknown): ChatProblem | null {
  if (!isRecord(raw)) return null;
  if (raw.type === "not-installed" || raw.type === "logged-out") return { type: raw.type };
  if (raw.type === "failed") return { type: "failed", message: nonEmpty(raw.message) ? raw.message : "Failed." };
  return null;
}

/** An event read from the socket, or null when it isn't one. */
export function normalizeChatEvent(raw: unknown): ChatEvent | null {
  if (!isRecord(raw)) return null;
  switch (raw.type) {
    case "user":
      return str(raw.text) ? { type: "user", text: raw.text } : null;
    case "started":
      return str(raw.model) ? { type: "started", model: raw.model } : null;
    case "text":
      return nonEmpty(raw.block) && str(raw.delta) ? { type: "text", block: raw.block, delta: raw.delta } : null;
    case "tool":
    case "tool-denied":
      return nonEmpty(raw.id) && nonEmpty(raw.name)
        ? { type: raw.type, id: raw.id, name: raw.name, input: raw.input ?? null }
        : null;
    case "tool-result":
      return nonEmpty(raw.id) && str(raw.output)
        ? { type: "tool-result", id: raw.id, output: raw.output, isError: raw.isError === true }
        : null;
    case "turn-end":
      return isOneOf(OUTCOMES, raw.outcome) ? { type: "turn-end", outcome: raw.outcome } : null;
    case "problem": {
      const problem = normalizeProblem(raw.problem);
      return problem ? { type: "problem", problem } : null;
    }
    default:
      return null;
  }
}

export function normalizeChatSnapshot(raw: unknown): ChatSnapshot {
  const events = isRecord(raw) && Array.isArray(raw.events) ? raw.events : [];
  return { events: events.map(normalizeChatEvent).filter((e): e is ChatEvent => e !== null) };
}

/** The `{ id }` params of the chat methods, or null. */
export function chatParams(params: unknown): { id: string } | null {
  return isRecord(params) && nonEmpty(params.id) ? { id: params.id } : null;
}

/** The `{ dir, role }` params of `chat.start`, or null. */
export function chatStartParams(params: unknown): { dir: string; role: string } | null {
  return isRecord(params) && nonEmpty(params.dir) && nonEmpty(params.role)
    ? { dir: params.dir, role: params.role }
    : null;
}

/** The `{ id, text }` params of `chat.send`, or null. Blank text is not a message. */
export function chatSendParams(params: unknown): { id: string; text: string } | null {
  const chat = chatParams(params);
  return chat && isRecord(params) && str(params.text) && params.text.trim() ? { ...chat, text: params.text } : null;
}
