/**
 * The `request_merge` tool (STORY-12): the Dev Lead asks the user to merge a story into its feature. The user decides;
 * the call answers once they are asked, and a notice says how it went. Its description is product copy: it is what
 * teaches the Dev Lead when to use it, since Featra injects no system prompt (ADR 0006).
 */
import { parseRequestMergeInput, REQUEST_MERGE_MESSAGES, REQUEST_MERGE_TOOL } from "@featra/work-format";
import { ToolRefusal, type Tool } from "./tool-types.ts";

export const REQUEST_MERGE: Tool = {
  name: REQUEST_MERGE_TOOL,
  failed: "Not asked.",
  description: [
    "Ask the user to merge a story you started into its feature branch, once its checks have passed (it is Verified).",
    "The user approves or declines it in this chat. Approving merges it with a merge commit: through its PR on GitHub, or with git.",
    "A notice in this chat tells you whether they declined, it merged, or it couldn't merge and why.",
    "A merge that conflicts merges nothing: the story goes back to In Progress and its agent gets the files.",
    "It is refused when the story isn't Verified, when its agent is working, and when you did not start it.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      story: { type: "string", description: "The story's card id, such as STORY-9." },
    },
    required: ["story"],
  },
  async run(input, host) {
    const parsed = parseRequestMergeInput(input);
    if (!parsed.ok) throw new ToolRefusal(parsed.error);
    const { story } = await host.requestMerge(parsed.value);
    return REQUEST_MERGE_MESSAGES.asked(story);
  },
};
