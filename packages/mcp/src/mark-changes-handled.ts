/**
 * The `mark_changes_handled` tool (STORY-71): the user said "Not yet" on a feature's review screen, the reason reached
 * the Dev Lead's chat as "Changes asked on FEAT-n: …", and once the Dev Lead has made the changes it says what it did.
 * The reply shows on the review screen and "Changes asked" clears there; a chat reply alone clears nothing. Its
 * description is product copy: it is what teaches the Dev Lead when to use it, since Featra injects no system prompt
 * (ADR 0006).
 */
import { CHANGES_MAX, MARK_CHANGES_HANDLED_TOOL, parseChangesHandledInput } from "@featra/work-format";
import { ToolRefusal, type Tool } from "./tool-types.ts";

export const MARK_CHANGES_HANDLED: Tool = {
  name: MARK_CHANGES_HANDLED_TOOL,
  failed: "Not marked.",
  description: [
    "Mark the changes the user asked on a feature you lead handled, saying what you did.",
    "The user asks from the feature's review screen, and the reason reaches this chat as 'Changes asked on FEAT-n: ...'.",
    "Make the changes first (start or message story sessions as you would), then call this once.",
    "Answering in the chat isn't enough: the review screen shows 'Changes asked' until you call this,",
    `then shows your reply, marked as written by the Dev Lead. Say plainly what changed. At most ${CHANGES_MAX} characters.`,
    "It is refused when no changes are asked (the user may have dismissed them), for a feature that isn't in progress,",
    "and for a story session.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      feature: { type: "string", description: "The feature's card id, such as FEAT-9." },
      reply: { type: "string", description: "What you did about the changes asked, in plain language." },
    },
    required: ["feature", "reply"],
  },
  async run(input, host) {
    const parsed = parseChangesHandledInput(input);
    if (!parsed.ok) throw new ToolRefusal(parsed.error);
    return (await host.changesHandled(parsed.value)).message;
  },
};
