/**
 * A chat as a log of events (ADR 0018). The server's provider adapter turns its agent's stream into these, the
 * session manager keeps the log, and the client folds it into what the chat view shows (`chat-state.ts`). Provider
 * neutral, so a Codex or ACP adapter (M2) feeds the same view.
 */
import type { AllowScope } from "./approvals.ts";
import { normalizeUsage } from "./chat-controls.ts";
import { LOG_FILES, type LogFile } from "./log-files.ts";
import { normalizeMode, type ModeInfo } from "./modes.ts";
import { isStrings, normalizeQuestions, type Answers, type Question } from "./questions.ts";
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
const LOGGED_FILES: readonly LogFile[] = Object.values(LOG_FILES);

export type ChatEvent =
  /** The user sent a message: a turn starts. */
  | { type: "user"; text: string }
  /** The agent's session is up, on this model. */
  | { type: "started"; model: string }
  /** More of the agent's reply. `block` names the reply block it belongs to, so a block's deltas join up. */
  | { type: "text"; block: string; delta: string }
  /**
   * More of the agent's thinking, where the provider exposes it (STORY-53). Shown apart from its reply; `block` joins a
   * block's deltas as for `text`.
   */
  | { type: "thinking"; block: string; delta: string }
  /** The agent called a tool. */
  | { type: "tool"; id: string; name: string; input: unknown }
  /** A tool call's result, as text. */
  | { type: "tool-result"; id: string; output: string; isError: boolean }
  /**
   * A tool call needs the user's approval (STORY-45): the chat waits until it is answered. `forChat` is false when
   * Allow for this chat isn't offered (the agent says the call may only be allowed once, or there is no rule for it),
   * so only Allow and Deny are. `covers` says what Allow for this chat would cover, when it is offered. `story` is set
   * on the copy the Dev Lead's chat shows of a story session's approval (STORY-9): the story it is for.
   */
  | { type: "approval"; id: string; name: string; input: unknown; forChat: boolean; covers?: string; story?: string }
  /** The call may run: the user allowed it, or an Allow for this chat already covers it (`scope: "chat"`). */
  | { type: "tool-allowed"; id: string; name: string; input: unknown; scope: AllowScope }
  /** The user denied a tool call, with the reason the agent was sent when there was one. */
  | { type: "tool-denied"; id: string; name: string; input: unknown; reason?: string }
  /**
   * The agent asks the user to choose (STORY-46): the chat waits until it is answered. `id` is the call's, so the
   * question shows on the call's own row.
   */
  | { type: "question"; id: string; name: string; questions: Question[] }
  /** The user answered a question; the agent goes on with the answers. */
  | { type: "question-answered"; id: string; answers: Answers }
  /** A request (an approval or a question) ended unanswered: Stop, the chat closing, or the agent no longer waiting. */
  | { type: "approval-cancelled"; id: string }
  /** An agent logged an entry through the Featra MCP (STORY-47): shown as "Logged to <file>" with Undo. */
  | { type: "logged"; entry: string; file: LogFile; summary: string }
  /** The user took a logged entry back out of its file. */
  | { type: "log-undone"; entry: string }
  /**
   * The context in use after a turn (STORY-22), read from the agent session's own events, never asked of the model.
   * `window` is the model's window when the provider reported it, else null: Featra doesn't guess one.
   */
  | { type: "usage"; used: number; window: number | null }
  | { type: "turn-end"; outcome: TurnOutcome }
  | { type: "problem"; problem: ChatProblem };

/** What `chat.watch` answers: the chat's whole log so far. Each later event comes as a `chat.event` push. */
export interface ChatSnapshot {
  events: ChatEvent[];
  /** The mode the chat's agent starts in, when a provider setting named one (STORY-6); Ask when absent. */
  mode?: ModeInfo;
  /** One line on how the chat's role was adjusted to run, such as a model Claude doesn't have. */
  note?: string;
}

/** A snapshot of `events`, with the chat's mode and note only when they aren't the defaults. */
export function chatSnapshot(events: ChatEvent[], mode: ModeInfo | null, note: string | null): ChatSnapshot {
  return { events, ...(mode && mode.level !== null ? { mode } : {}), ...(note ? { note } : {}) };
}

const str = (v: unknown): v is string => typeof v === "string";
const nonEmpty = (v: unknown): v is string => str(v) && v.length > 0;

function normalizeProblem(raw: unknown): ChatProblem | null {
  if (!isRecord(raw)) return null;
  if (raw.type === "not-installed" || raw.type === "logged-out" || raw.type === "gone") return { type: raw.type };
  if (raw.type === "failed") return { type: "failed", message: nonEmpty(raw.message) ? raw.message : "Failed." };
  return null;
}

/** The answers of a question-answered event, or null when any isn't a list of text. */
function normalizeAnswers(raw: Record<string, unknown>): Answers | null {
  const answers: Answers = {};
  for (const [question, chosen] of Object.entries(raw)) {
    if (!isStrings(chosen)) return null;
    answers[question] = chosen;
  }
  return answers;
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
    case "thinking":
      return nonEmpty(raw.block) && str(raw.delta) ? { type: "thinking", block: raw.block, delta: raw.delta } : null;
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
            ...(nonEmpty(raw.story) ? { story: raw.story } : {}),
          }
        : null;
    case "question": {
      const questions = normalizeQuestions(raw.questions);
      return nonEmpty(raw.id) && nonEmpty(raw.name) && questions
        ? { type: "question", id: raw.id, name: raw.name, questions }
        : null;
    }
    case "question-answered": {
      const answers = isRecord(raw.answers) ? normalizeAnswers(raw.answers) : null;
      return nonEmpty(raw.id) && answers ? { type: "question-answered", id: raw.id, answers } : null;
    }
    case "tool-allowed":
      return nonEmpty(raw.id) && nonEmpty(raw.name) && isOneOf(SCOPES, raw.scope)
        ? { type: "tool-allowed", id: raw.id, name: raw.name, input: raw.input ?? null, scope: raw.scope }
        : null;
    case "approval-cancelled":
      return nonEmpty(raw.id) ? { type: "approval-cancelled", id: raw.id } : null;
    case "logged":
      return nonEmpty(raw.entry) && isOneOf(LOGGED_FILES, raw.file) && str(raw.summary)
        ? { type: "logged", entry: raw.entry, file: raw.file, summary: raw.summary }
        : null;
    case "log-undone":
      return nonEmpty(raw.entry) ? { type: "log-undone", entry: raw.entry } : null;
    case "tool-result":
      return nonEmpty(raw.id) && str(raw.output)
        ? { type: "tool-result", id: raw.id, output: raw.output, isError: raw.isError === true }
        : null;
    case "usage": {
      const usage = normalizeUsage(raw.used, raw.window);
      return usage ? { type: "usage", ...usage } : null;
    }
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
  const mode = isRecord(raw) ? normalizeMode(raw.mode) : null;
  const note = isRecord(raw) && nonEmpty(raw.note) ? raw.note : null;
  return chatSnapshot(
    events.map(normalizeChatEvent).filter((e): e is ChatEvent => e !== null),
    mode,
    note,
  );
}

/** The `{ id }` params of the chat methods, or null. */
export function chatParams(params: unknown): { id: string } | null {
  return isRecord(params) && nonEmpty(params.id) ? { id: params.id } : null;
}

/** The `{ dir, role, card? }` params of `chat.start` (the card the chat works on), or null. */
export function chatStartParams(params: unknown): { dir: string; role: string; card?: string } | null {
  return isRecord(params) && nonEmpty(params.dir) && nonEmpty(params.role)
    ? { dir: params.dir, role: params.role, ...(nonEmpty(params.card) ? { card: params.card } : {}) }
    : null;
}

/** The `{ id, text }` params of `chat.send`, or null. Blank text is not a message. */
export function chatSendParams(params: unknown): { id: string; text: string } | null {
  const chat = chatParams(params);
  return chat && isRecord(params) && str(params.text) && params.text.trim() ? { ...chat, text: params.text } : null;
}

/** The `{ id, entry }` params of `chat.undoLog`, or null. */
export function chatUndoParams(params: unknown): { id: string; entry: string } | null {
  const chat = chatParams(params);
  return chat && isRecord(params) && nonEmpty(params.entry) ? { ...chat, entry: params.entry } : null;
}

/** What the server says about a chat: its refusals, shown to the user, and the denial the agent is told. */
export const CHAT_MESSAGES = {
  unknownRole: "No such role.",
  noProvider: "This role's agent isn't available.",
  noChat: "No such chat.",
  busy: "Wait for the reply, or stop it.",
  /** A restored chat whose session its provider no longer has: it can't go on. */
  gone: "This chat's history is gone. Start a new chat.",
  /** Undo of an entry that is no longer in the chat's log (STORY-47). */
  noEntry: "That entry is already removed.",
  /** Undo of an entry the user changed in the file: it stays, as the user left it. */
  editedEntry: "That entry was edited. Remove it from the file yourself.",
  /** A setting the composer changed that its provider doesn't offer. */
  badSetting: "The agent doesn't offer that.",
  /** A role change to a role that runs on another agent. */
  otherAgent: "That role runs on another agent.",
  /** An answer to a tool request that isn't waiting: already answered, cancelled, or never asked. */
  noRequest: "This request isn't waiting for an answer.",
  /** Allow for this chat, for a call the agent says may only be allowed once. */
  onceOnly: "This call can only be allowed once.",
  /** An answer that doesn't answer every question the way it asks (STORY-46). */
  badAnswer: "Answer every question.",
  /** A story session on a role whose provider has no runner for it (STORY-9). */
  noRunner: "This role's agent can't run story sessions yet.",
  /** A story session still waiting for a free slot: nothing can be sent to it (STORY-9). */
  queued: "Queued. It starts when a story agent ends.",
  /** Resume on a session whose provider can't go on with a session it stopped (STORY-53). */
  noResume: "This agent can't resume a stopped session.",
  /** Resume on a session with no saved provider session to go on in (STORY-53). */
  unsaved: "This session has nothing to continue.",
  /** Stop or Resume on a story whose session isn't there: it never started, or was closed (STORY-53). */
  noSession: "This story has no session.",
} as const;
