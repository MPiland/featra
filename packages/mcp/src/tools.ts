/**
 * The Featra MCP's tools (STORY-47). Each is a name, a description and a JSON schema (what an agent reads), and a
 * `run` that checks the agent's input and acts through the host. The descriptions are product copy: they are what
 * teaches an agent when to log, since Featra injects no system prompt (ADR 0006). A later tool (`draft_cards`,
 * FEAT-4) is one more entry in `TOOLS` and, if it needs the server, one more method on `FeatraHost`.
 */
import {
  LOG_FILES,
  parseDecision,
  parseQuestion,
  type LoggedEntry,
  type LogInput,
  type Parsed,
} from "@featra/work-format";

/** What the tools reach the server through. */
export interface FeatraHost {
  /** Adds an entry to the chat's `decisions.md` or `open-questions.md`. */
  log: (input: LogInput) => Promise<LoggedEntry>;
}

export interface Tool {
  name: string;
  description: string;
  /** JSON Schema of the input, as an agent sees it. */
  inputSchema: { type: "object"; properties: Record<string, unknown>; required: string[] };
  /** Runs the call; throws a `ToolRefusal` for input to fix. Resolves with the line the agent is told. */
  run: (input: unknown, host: FeatraHost) => Promise<string>;
}

/** A call that can't be done as given: the message tells the agent what to fix. */
export class ToolRefusal extends Error {}

const card = {
  type: "string",
  description: "The card this work is for, such as STORY-47. Leave it out when there isn't one.",
};

async function log<T extends LogInput>(parsed: Parsed<T>, host: FeatraHost): Promise<string> {
  if (!parsed.ok) throw new ToolRefusal(`Not logged. ${parsed.error}`);
  const { file } = await host.log(parsed.value);
  return `Logged to ${file}.`;
}

const LOG_DECISION: Tool = {
  name: "log_decision",
  description: [
    `Record a decision and why you made it in ${LOG_FILES.decision}, so the next agent or the user can see the reasoning.`,
    "Log it when you chose something that changes behavior or scope, a public contract (API, file format, protocol),",
    "stored data or security, or when you picked between real trade-offs.",
    "Do not log trivia: names, formatting, steps the user told you to take, or anything obvious from the code.",
    "Call it as you decide, in the same turn, without asking. The user sees it in the chat and can undo it.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      decision: { type: "string", description: "What was decided, in one sentence." },
      why: { type: "string", description: "The reasons: constraints, evidence and the trade-off you accepted." },
      rejected: {
        type: "array",
        items: { type: "string" },
        description: "Real alternatives you turned down, each with the reason. Leave it out if there were none.",
      },
      card,
    },
    required: ["decision", "why"],
  },
  run: (input, host) => log(parseDecision(input), host),
};

const DEFER_QUESTION: Tool = {
  name: "defer_question",
  description: [
    `Park a question only the user can answer in ${LOG_FILES.question}, and keep working on an assumption.`,
    "Use it for a product or scope choice that is not yours to make and does not block the rest of your task:",
    "say what you assumed in the context.",
    "If you cannot go on without the answer, ask the user directly instead.",
    "Do not log a question you can answer by reading the code or the docs.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      question: { type: "string", description: "The question, in one sentence." },
      context: {
        type: "string",
        description: "What you assumed meanwhile, the options you see, and the one you recommend.",
      },
      card,
    },
    required: ["question", "context"],
  },
  run: (input, host) => log(parseQuestion(input), host),
};

/** Every tool the server offers, in the order an agent lists them. */
export const TOOLS: readonly Tool[] = [LOG_DECISION, DEFER_QUESTION];
