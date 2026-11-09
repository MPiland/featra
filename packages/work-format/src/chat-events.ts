/**
 * A chat as a log of events (ADR 0018). The server's provider adapter turns its agent's stream into these, the
 * session manager keeps the log, and the client folds it into what the chat view shows (`chat-state.ts`). Provider
 * neutral, so a Codex or ACP adapter (M2) feeds the same view.
 */
import type { AllowScope } from "./approvals.ts";
import { isOneOf, isRecord } from "./utils/guards.ts";

/**
 * Why a chat can't go on: its agent isn't installed, isn't logged in, failed with a message, or its provider no longer
 * has the session a restored chat would resume (STORY-44).
 */
export type ChatProblem =
  | { type: "not-installed" }
  | { type: "logged-out" }
  | { type: "failed"; message: string }
  | { type: "gone" };

/** How a turn ended: the agent finished, the user stopped it, or it failed (a `problem` event says why). */
export type TurnOutcome = "done" | "stopped" | "failed";
const OUTCOMES: readonly TurnOutcome[] = ["done", "stopped", "failed"];
const SCOPES: readonly AllowScope[] = ["once", "chat"];

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
  /**
   * A tool call needs the user's approval (STORY-45): the chat waits until it is answered. `forChat` is false when
   * Allow for this chat isn't offered (the agent says the call may only be allowed once, or there is no rule for it),
   * so only Allow and Deny are. `covers` says what Allow for this chat would cover, when it is offered.
   */
  | { type: "approval"; id: string; name: string; input: unknown; forChat: boolean; covers?: string }
  /** The call may run: the user allowed it, or an Allow for this chat already covers it (`scope: "chat"`). */
  | { type: "tool-allowed"; id: string; name: string; input: unknown; scope: AllowScope }
  /** The user denied a tool call, with the reason the agent was sent when there was one. */
  | { type: "tool-denied"; id: string; name: string; input: unknown; reason?: string }
  /** A request ended unanswered: Stop, the chat closing, or the agent no longer waiting for it. */
  | { type: "approval-cancelled"; id: string }
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
  if (raw.type === "not-installed" || raw.type === "logged-out" || raw.type === "gone") return { type: raw.type };
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
      return nonEmpty(raw.id) && nonEmpty(raw.name)
        ? { type: "tool", id: raw.id, name: raw.name, input: raw.input ?? null }
        : null;
    case "tool-denied":
      if (!nonEmpty(raw.id) || !nonEmpty(raw.name)) return null;
      return {
        type: "tool-denied",
        id: raw.id,
        name: raw.name,
        input: raw.input ?? null,
        ...(nonEmpty(raw.reason) ? { reason: raw.reason } : {}),
      };
    case "approval":
      return nonEmpty(raw.id) && nonEmpty(raw.name)
        ? {
            type: "approval",
            id: raw.id,
            name: raw.name,
            input: raw.input ?? null,
            forChat: raw.forChat === true,
            ...(raw.forChat === true && nonEmpty(raw.covers) ? { covers: raw.covers } : {}),
          }
        : null;
    case "tool-allowed":
      return nonEmpty(raw.id) && nonEmpty(raw.name) && isOneOf(SCOPES, raw.scope)
        ? { type: "tool-allowed", id: raw.id, name: raw.name, input: raw.input ?? null, scope: raw.scope }
        : null;
    case "approval-cancelled":
      return nonEmpty(raw.id) ? { type: "approval-cancelled", id: raw.id } : null;
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

/** What the server says about a chat: its refusals, shown to the user, and the denial the agent is told. */
export const CHAT_MESSAGES = {
  unknownRole: "No such role.",
  noProvider: "This role's agent isn't available.",
  noChat: "No such chat.",
  busy: "Wait for the reply, or stop it.",
  /** A restored chat whose session its provider no longer has: it can't go on. */
  gone: "This chat's history is gone. Start a new chat.",
  /** An answer to a tool request that isn't waiting: already answered, cancelled, or never asked. */
  noRequest: "This request isn't waiting for an answer.",
  /** Allow for this chat, for a call the agent says may only be allowed once. */
  onceOnly: "This call can only be allowed once.",
} as const;
