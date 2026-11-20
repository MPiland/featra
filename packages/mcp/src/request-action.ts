/**
 * The `request_action` tool (STORY-68): an agent asks the user to do something only they can do, and waits for the
 * answer. Its description is product copy: it is what teaches an agent when to use it, since Featra injects no system
 * prompt (ADR 0006).
 */
import { ACTION_LIMITS, ACTION_RESULTS, parseActionRequest, REQUEST_ACTION_TOOL } from "@featra/work-format";
import { ToolRefusal, type Tool } from "./tool-types.ts";

export const REQUEST_ACTION: Tool = {
  name: REQUEST_ACTION_TOOL,
  failed: "Not done.",
  description: [
    "Ask the user to do something only they can do, and wait until they have.",
    "Use it when you are blocked on a step you can't or mustn't take yourself: signing in to a service or tool,",
    "running a command that needs their rights (sudo, an admin shell, their own credentials),",
    "changing a setting in their system or account, or approving something in an external service.",
    "Give the steps in order, with the exact command for any step that runs one: the user copies it and runs it.",
    "Featra never runs the commands.",
    "The call waits until the user answers. It returns Done, or that they couldn't do it, with their reason when they give one.",
    "Don't use it to ask a question or to choose between options: ask the user directly for that.",
    "Don't use it for anything you can do yourself.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: `What the user should do, in a short line (under ${ACTION_LIMITS.title} characters), such as "Sign in to the GitHub CLI".`,
      },
      why: {
        type: "string",
        description: `Why you need it, in a sentence or two (under ${ACTION_LIMITS.why} characters). Leave it out when the title says it.`,
      },
      steps: {
        type: "array",
        description: `The steps, in order (1 to ${ACTION_LIMITS.steps}).`,
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "What to do in this step, in one or two sentences." },
            command: {
              type: "string",
              description: "The exact command to run for this step, if it runs one. Leave it out otherwise.",
            },
          },
          required: ["text"],
        },
      },
    },
    required: ["title", "steps"],
  },
  async run(input, host) {
    const parsed = parseActionRequest(input);
    if (!parsed.ok) throw new ToolRefusal(parsed.error);
    const answer = await host.requestAction(parsed.value);
    return answer.outcome === "done" ? ACTION_RESULTS.done : ACTION_RESULTS.cant(answer.reason);
  },
};
