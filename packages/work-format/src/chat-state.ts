/**
 * What the chat view shows, folded from the chat's event log (`chat-events.ts`). Pure, so the view's rules are tested
 * without React: deltas join into one reply, each tool call is one row that its result and a denial update, and a
 * turn is running from the user's message until it ends.
 */
import type { AllowScope } from "./approvals.ts";
import type { ChatEvent, ChatProblem } from "./chat-events.ts";
import type { LogFile } from "./knowledge-log.ts";
import type { Answers, Question } from "./questions.ts";
import { assertNever } from "./utils/guards.ts";
import { toolSummary } from "./tool-summary.ts";

/** A line in the chat that isn't a message: why the chat can't go on, or that the user stopped a turn. */
export type ChatNotice = ChatProblem | { type: "stopped" };

export interface ToolResult {
  output: string;
  isError: boolean;
}

/** Where a tool row's approval stands: waiting on the user, or allowed (by the user, or by an earlier Allow for this chat). */
export type ToolApproval =
  | { status: "pending"; forChat: boolean; covers?: string }
  | { status: "allowed"; scope: AllowScope };

/** Where a question stands: waiting on the user, or answered with what they chose. */
export type ToolQuestion =
  | { status: "pending"; questions: Question[] }
  | { status: "answered"; questions: Question[]; answers: Answers };

export type ChatItem =
  | { kind: "user"; key: string; text: string }
  | { kind: "assistant"; key: string; block: string; text: string }
  | {
      kind: "tool";
      key: string;
      id: string;
      name: string;
      summary: string;
      input: unknown;
      result: ToolResult | null;
      denied: boolean;
      /** Why the user denied it, when they said. */
      reason: string | null;
      /** The approval the call asked for, if it asked. */
      approval: ToolApproval | null;
      /** The question the call asks the user (STORY-46), if it is one: the row shows it as a card. */
      question: ToolQuestion | null;
      /** The user stopped the turn before the call had a result. */
      stopped: boolean;
      /** The call ended unanswered some other way: its request was cancelled, or its turn ended without a result. */
      cancelled: boolean;
    }
  /** An entry an agent logged to a project file (STORY-47): what was logged, where, and whether the user took it back. */
  | { kind: "log"; key: string; entry: string; file: LogFile; summary: string; undone: boolean }
  | { kind: "notice"; key: string; notice: ChatNotice };

export interface ChatState {
  items: ChatItem[];
  /** A turn is running: Stop is offered and the composer waits. */
  running: boolean;
  /** The model the agent reported, once its session is up. */
  model: string | null;
}

export const EMPTY_CHAT: ChatState = { items: [], running: false, model: null };

const key = (state: ChatState) => String(state.items.length);
const push = (state: ChatState, item: ChatItem): ChatState => ({ ...state, items: [...state.items, item] });

function replace(state: ChatState, index: number, item: ChatItem): ChatState {
  const items = [...state.items];
  items[index] = item;
  return { ...state, items };
}

const toolIndex = (state: ChatState, id: string) =>
  state.items.findIndex((item) => item.kind === "tool" && item.id === id);

type ToolItem = Extract<ChatItem, { kind: "tool" }>;

/**
 * A tool row, new or the one already there for this call, with `change` applied. An approval or a denial can come
 * before the call itself.
 */
function upsertTool(
  state: ChatState,
  id: string,
  name: string,
  input: unknown,
  change: (row: ToolItem) => Partial<ToolItem> = () => ({}),
): ChatState {
  const at = toolIndex(state, id);
  const existing = state.items[at];
  if (existing?.kind === "tool") return replace(state, at, { ...existing, ...change(existing) });
  const row: ToolItem = {
    kind: "tool",
    key: key(state),
    id,
    name,
    summary: toolSummary(name, input),
    input,
    result: null,
    denied: false,
    reason: null,
    approval: null,
    question: null,
    stopped: false,
    cancelled: false,
  };
  return push(state, { ...row, ...change(row) });
}

/** Changes the row of a call already shown; an answer for a call that has no row changes nothing. */
function updateTool(state: ChatState, id: string, change: (row: ToolItem) => Partial<ToolItem>): ChatState {
  const at = toolIndex(state, id);
  const row = state.items[at];
  return row?.kind === "tool" ? replace(state, at, { ...row, ...change(row) }) : state;
}

const pending = (row: ToolItem) => row.approval?.status === "pending" || row.question?.status === "pending";

/** The row's approval and question with whichever was waiting taken off: no request is left open. */
const unasked = (row: ToolItem) => ({
  approval: row.approval?.status === "pending" ? null : row.approval,
  question: row.question?.status === "pending" ? null : row.question,
});

function appendText(state: ChatState, block: string, delta: string): ChatState {
  const last = state.items.at(-1);
  if (last?.kind === "assistant" && last.block === block) {
    return replace(state, state.items.length - 1, { ...last, text: last.text + delta });
  }
  return push(state, { kind: "assistant", key: key(state), block, text: delta });
}

/**
 * An ended turn leaves no call waiting for a result that won't come: a stopped turn marks its unanswered calls
 * stopped; one that ended otherwise marks them cancelled (a request still waiting when the app closed is gone, so a
 * restored chat shows it cancelled, never denied). Either way no approval is left waiting.
 */
const endTools = (state: ChatState, stopped: boolean): ChatState => ({
  ...state,
  items: state.items.map((item) => {
    if (item.kind !== "tool" || item.result !== null || item.denied) return item;
    const open = unasked(item);
    return stopped ? { ...item, ...open, stopped: true } : { ...item, ...open, cancelled: !item.stopped };
  }),
});

export function reduceChat(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case "user":
      return { ...push(state, { kind: "user", key: key(state), text: event.text }), running: true };
    case "started":
      return { ...state, model: event.model };
    case "text":
      return event.delta ? appendText(state, event.block, event.delta) : state;
    case "tool":
      return upsertTool(state, event.id, event.name, event.input);
    case "approval":
      return upsertTool(state, event.id, event.name, event.input, () => ({
        approval: { status: "pending", forChat: event.forChat, ...(event.covers ? { covers: event.covers } : {}) },
      }));
    case "question":
      return upsertTool(state, event.id, event.name, { questions: event.questions }, () => ({
        question: { status: "pending", questions: event.questions },
      }));
    case "question-answered":
      return updateTool(state, event.id, (row) =>
        row.question
          ? { question: { status: "answered", questions: row.question.questions, answers: event.answers } }
          : {},
      );
    case "tool-allowed":
      return upsertTool(state, event.id, event.name, event.input, () => ({
        approval: { status: "allowed", scope: event.scope },
      }));
    case "tool-denied":
      return upsertTool(state, event.id, event.name, event.input, () => ({
        denied: true,
        reason: event.reason ?? null,
        approval: null,
      }));
    case "approval-cancelled":
      return updateTool(state, event.id, (row) => (pending(row) ? { ...unasked(row), cancelled: true } : {}));
    case "logged":
      return push(state, {
        kind: "log",
        key: key(state),
        entry: event.entry,
        file: event.file,
        summary: event.summary,
        undone: false,
      });
    case "log-undone":
      return {
        ...state,
        items: state.items.map((i) => (i.kind === "log" && i.entry === event.entry ? { ...i, undone: true } : i)),
      };
    case "tool-result": {
      const at = toolIndex(state, event.id);
      const row = state.items[at];
      if (row?.kind !== "tool") return state;
      return replace(state, at, { ...row, result: { output: event.output, isError: event.isError } });
    }
    case "turn-end":
      return event.outcome === "stopped"
        ? push(endTools({ ...state, running: false }, true), {
            kind: "notice",
            key: key(state),
            notice: { type: "stopped" },
          })
        : endTools({ ...state, running: false }, false);
    case "problem":
      return { ...push(state, { kind: "notice", key: key(state), notice: event.problem }), running: false };
    default:
      return assertNever(event);
  }
}

/** The view of a whole log. */
export const foldChat = (events: readonly ChatEvent[]): ChatState => events.reduce(reduceChat, EMPTY_CHAT);
