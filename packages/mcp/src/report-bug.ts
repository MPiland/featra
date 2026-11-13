/**
 * The `report_bug` tool (STORY-13): the Dev Lead reports a bug with its suspected cause, and the user places it. The
 * call answers once the user is asked, and a notice says where it went. Its description is product copy: it is what
 * teaches the Dev Lead when to use it, since Featra injects no system prompt (ADR 0006).
 */
import {
  BUG_DESCRIPTION_MAX,
  BUG_TITLE_MAX,
  parseBugReport,
  REPORT_BUG_MESSAGES,
  REPORT_BUG_TOOL,
} from "@featra/work-format";
import { ToolRefusal, type Tool } from "./tool-types.ts";

export const REPORT_BUG: Tool = {
  name: REPORT_BUG_TOOL,
  failed: "Not reported.",
  description: [
    "Report a bug you or a story session found, with the card you suspect caused it.",
    "Featra proposes where it goes: a task on that story while it is still being worked, a bug card under its feature while the feature is in progress, or the project bug list.",
    "The user confirms or changes the place, then creates it or cancels, in this chat.",
    "A notice in this chat tells you where it went, or that it was cancelled or couldn't be filed.",
    "Story sessions can't report bugs: they tell you, and you report them.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: `What is wrong, in a short line (under ${BUG_TITLE_MAX} characters).` },
      description: {
        type: "string",
        description: `How to see it and what you expected (under ${BUG_DESCRIPTION_MAX} characters).`,
      },
      cause: {
        type: "string",
        description: "The card you suspect caused it, such as STORY-9 or FEAT-6. Leave it out when you don't know.",
      },
    },
    required: ["title"],
  },
  async run(input, host) {
    const parsed = parseBugReport(input);
    if (!parsed.ok) throw new ToolRefusal(parsed.error);
    await host.reportBug(parsed.value);
    return REPORT_BUG_MESSAGES.asked;
  },
};
