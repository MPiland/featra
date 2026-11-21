/**
 * The agent's own tool rows that an app card stands for (STORY-68 review, S1). When an agent calls one of Featra's
 * app-approval tools, its provider shows the raw call (`mcp__featra__request_action` on Claude) and Featra shows the
 * card that asks the user. The card says everything the raw row does, so the chat shows the card alone. A call that
 * never became a card, such as one refused for its input, keeps its row and its error.
 */
import { REPORT_BUG_TOOL } from "./bug-copy.ts";
import type { ChatItem } from "./chat-state.ts";
import { REQUEST_ACTION_TOOL } from "./action-request.ts";
import { REQUEST_MERGE_TOOL } from "./merge-copy.ts";
import { isRecord } from "./utils/guards.ts";

type ToolItem = Extract<ChatItem, { kind: "tool" }>;

/** The tools whose calls the app shows as its own card. */
export const APP_CARD_TOOLS: ReadonlySet<string> = new Set([REQUEST_ACTION_TOOL, REQUEST_MERGE_TOOL, REPORT_BUG_TOOL]);

/** Whether `name` is an agent's name for Featra's MCP tool `tool`: the provider prefixes it with the server's name. */
const callsTool = (name: string, tool: string) =>
  name.endsWith(`__${tool}`) || name.endsWith(`.${tool}`) || name.endsWith(`/${tool}`);

/** The app's card for a tool call: the row the app's own request made, which asked the user. */
const isCard = (item: ToolItem) =>
  APP_CARD_TOOLS.has(item.name) && (item.approval !== null || item.denied || item.cancelled);

const flat = (value: unknown) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ") : undefined);

/** The card is made from the call's input: they agree on every text field both have. */
function sameAsk(call: unknown, card: unknown): boolean {
  if (!isRecord(call) || !isRecord(card)) return false;
  return Object.keys(card).every((k) => {
    const [a, b] = [flat(card[k]), flat(call[k])];
    return a === undefined || b === undefined || a === b;
  });
}

/**
 * The ids of the tool rows an app card stands for. Each card takes the latest earlier row of the same tool, in the
 * same turn, with the same input, that no other card took.
 */
export function cardCalls(items: readonly ChatItem[]): ReadonlySet<string> {
  const taken = new Set<string>();
  items.forEach((card, at) => {
    if (card.kind !== "tool" || !isCard(card)) return;
    for (let i = at - 1; i >= 0; i--) {
      const row = items[i];
      if (row?.kind === "user") return;
      if (row === undefined) continue;
      if (row.kind !== "tool" || taken.has(row.id) || row.name === card.name || !callsTool(row.name, card.name)) {
        continue;
      }
      if (!sameAsk(row.input, card.input)) continue;
      taken.add(row.id);
      return;
    }
  });
  return taken;
}
