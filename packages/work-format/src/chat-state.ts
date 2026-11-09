/**
 * What the chat view shows, folded from the chat's event log (`chat-events.ts`). Pure, so the view's rules are tested
 * without React: deltas join into one reply, each tool call is one row that its result and a denial update, and a
 * turn is running from the user's message until it ends.
 */
import type { ChatEvent, ChatProblem } from "./chat-events.ts";
import { assertNever } from "./utils/guards.ts";
import { toolSummary } from "./tool-summary.ts";

/** A line in the chat that isn't a message: why the chat can't go on, or that the user stopped a turn. */
export type ChatNotice = ChatProblem | { type: "stopped" };

export interface ToolResult {
  output: string;
  isError: boolean;
}

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
      /** The user stopped the turn before the call had a result. */
      stopped: boolean;
    }
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

/** A tool row: new, or the one already there for this call (a denial can come before the call itself). */
function upsertTool(state: ChatState, id: string, name: string, input: unknown, denied: boolean): ChatState {
  const at = toolIndex(state, id);
  const existing = state.items[at];
  if (existing?.kind === "tool") {
    return replace(state, at, { ...existing, denied: existing.denied || denied });
  }
  return push(state, {
    kind: "tool",
    key: key(state),
    id,
    name,
    summary: toolSummary(name, input),
    input,
    result: null,
    denied,
    stopped: false,
  });
}

function appendText(state: ChatState, block: string, delta: string): ChatState {
  const last = state.items.at(-1);
  if (last?.kind === "assistant" && last.block === block) {
    return replace(state, state.items.length - 1, { ...last, text: last.text + delta });
  }
  return push(state, { kind: "assistant", key: key(state), block, text: delta });
}

/** A stopped turn leaves its unanswered calls stopped, never waiting for a result that won't come. */
const stopTools = (state: ChatState): ChatState => ({
  ...state,
  items: state.items.map((item) =>
    item.kind === "tool" && item.result === null && !item.denied ? { ...item, stopped: true } : item,
  ),
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
      return upsertTool(state, event.id, event.name, event.input, false);
    case "tool-denied":
      return upsertTool(state, event.id, event.name, event.input, true);
    case "tool-result": {
      const at = toolIndex(state, event.id);
      const row = state.items[at];
      if (row?.kind !== "tool") return state;
      return replace(state, at, { ...row, result: { output: event.output, isError: event.isError } });
    }
    case "turn-end":
      return event.outcome === "stopped"
        ? push(stopTools({ ...state, running: false }), {
            kind: "notice",
            key: key(state),
            notice: { type: "stopped" },
          })
        : { ...state, running: false };
    case "problem":
      return { ...push(state, { kind: "notice", key: key(state), notice: event.problem }), running: false };
    default:
      return assertNever(event);
  }
}

/** The view of a whole log. */
export const foldChat = (events: readonly ChatEvent[]): ChatState => events.reduce(reduceChat, EMPTY_CHAT);
