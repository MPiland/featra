/**
 * The `write_summary` tool (STORY-69): the Dev Lead writes, in plain language, what a feature changed for the user. It
 * shows on the feature's review screen under "Summary", marked as written by the Dev Lead. Its description is product
 * copy: it is what teaches the Dev Lead when to use it, since Featra injects no system prompt (ADR 0006).
 */
import { parseSummaryInput, SUMMARY_LIMIT, WRITE_SUMMARY_TOOL } from "@featra/work-format";
import { ToolRefusal, type Tool } from "./tool-types.ts";

export const WRITE_SUMMARY: Tool = {
  name: WRITE_SUMMARY_TOOL,
  failed: "Not written.",
  description: [
    "Write the summary of a feature you lead, for the user to read when they review it before approving.",
    "Write it once the feature's stories are built, and again when they change: each call replaces the one before.",
    "Say in plain language what changed for the user, what is left out or deferred, and anything they should look at.",
    "Don't repeat what the review screen already shows: each story's criteria, their tests and runs, and the files changed.",
    `It is kept in the feature's card, under "Summary", marked as written by the Dev Lead. At most ${SUMMARY_LIMIT} characters.`,
    "It is refused for a feature that isn't in progress, and for a story session.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      feature: { type: "string", description: "The feature's card id, such as FEAT-9." },
      summary: { type: "string", description: "The summary, in plain language. Markdown is kept as written." },
    },
    required: ["feature", "summary"],
  },
  async run(input, host) {
    const parsed = parseSummaryInput(input);
    if (!parsed.ok) throw new ToolRefusal(parsed.error);
    return (await host.summarize(parsed.value)).message;
  },
};
