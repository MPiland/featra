/**
 * The `message_session` tool (STORY-54): the Dev Lead steers a story's agent. Its description is product copy: it is
 * what teaches the Dev Lead when to use it, since Featra injects no system prompt (ADR 0006).
 */
import { parseMessageInput } from "@featra/work-format";
import { ToolRefusal, type Tool } from "./tool-types.ts";

export const MESSAGE_SESSION: Tool = {
  name: "message_session",
  failed: "Not sent.",
  description: [
    "Send a message to the agent working on a story you started, as its next turn: answer its question, redirect it or tell it what to do next.",
    "Featra tells you in this chat when a story's agent ends a turn, stops, fails or asks something, so you rarely need to look.",
    "The agent goes on in the same session, with the story's worktree and what it already knows.",
    "It is refused when the story's agent is working (wait for its notice), when it is waiting for a slot,",
    "when the user stopped it (only the user can resume it), and when you did not start the story.",
    "To put a question to the user instead, ask them yourself.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      story: { type: "string", description: "The story's card id, such as STORY-9." },
      text: { type: "string", description: "What to tell the agent." },
    },
    required: ["story", "text"],
  },
  async run(input, host) {
    const parsed = parseMessageInput(input);
    if (!parsed.ok) throw new ToolRefusal(parsed.error);
    const { story } = await host.message(parsed.value);
    return `Sent to ${story}. Its next notice tells you what it did.`;
  },
};
