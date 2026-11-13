/**
 * The `propose_check_command` tool (STORY-56): the Dev Lead suggests how to check the project. Its description is
 * product copy: it is what teaches the Dev Lead when to use it, since Featra injects no system prompt (ADR 0006).
 */
import { parseProposeInput, PROPOSE_MESSAGES } from "@featra/work-format";
import { ToolRefusal, type Tool } from "./tool-types.ts";

export const PROPOSE_CHECK_COMMAND: Tool = {
  name: "propose_check_command",
  failed: "Not proposed.",
  description: [
    "Propose the command that checks this project (its tests, and lint or types if the project runs them), and optionally the command that runs one linked test.",
    "Featra runs the check command in a story's worktree when the story reaches review and when new commits land, and a passing run marks the story Verified.",
    "The proposal only appears in Project settings. The user confirms or edits it there, and nothing is applied until they do.",
    "The linked test command is a template: {file} is the test file, {name} the test's name and {namePattern} the same escaped for a pattern, for example `npx vitest run {file} -t {namePattern}`.",
    "Each is one line, run through the platform shell as written.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "The check command, such as `pnpm test`." },
      testCommand: {
        type: "string",
        description: "The linked-test command template, such as `npx vitest run {file} -t {namePattern}`.",
      },
    },
    required: [],
  },
  async run(input, host) {
    const parsed = parseProposeInput(input);
    if (!parsed.ok) throw new ToolRefusal(parsed.error);
    await host.propose(parsed.value);
    return PROPOSE_MESSAGES.proposed;
  },
};
