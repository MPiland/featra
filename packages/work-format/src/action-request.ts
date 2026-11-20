/**
 * An agent asks the user to do something only they can do (STORY-68): sign in, run a command that needs their
 * rights, change a setting, approve something in another service. The request is a card in the chat with its steps,
 * a Copy button for each command, Done and Can't do it; it waits like a tool approval, and goes to the Inbox after the
 * same wait. Featra never runs a command: it only copies it. The rules and words here are shared by the MCP tool, the
 * server and the client.
 */
import type { Parsed } from "./knowledge-log.ts";
import { isRecord } from "./utils/guards.ts";

/** The approval the agent's `request_action` puts in its chat: the tool row's name. */
export const REQUEST_ACTION_TOOL = "request_action";

export const ACTION_LIMITS = {
  title: 120,
  why: 500,
  steps: 10,
  step: 500,
  command: 2000,
} as const;

/** One thing for the user to do, and the command to run for it, if there is one. */
export interface ActionStep {
  text: string;
  command?: string;
}

/** What the agent asks the user to do. */
export interface ActionRequest {
  title: string;
  why?: string;
  steps: ActionStep[];
}

/** How the user answered: they did it, or they couldn't, with their reason when they gave one. */
export type ActionOutcome = { outcome: "done" } | { outcome: "cant"; reason?: string };

export const ACTION_MESSAGES = {
  badTitle: "Say what the user should do in a short line as `title`.",
  longTitle: `Keep the title under ${ACTION_LIMITS.title} characters; put the detail in \`steps\`.`,
  badWhy: "Give why it is needed as text, or leave `why` out.",
  longWhy: `Keep \`why\` under ${ACTION_LIMITS.why} characters.`,
  badSteps: `Give the steps as a list of 1 to ${ACTION_LIMITS.steps}, each with its \`text\`.`,
  badStep: (n: number) => `Step ${n} needs its \`text\`, under ${ACTION_LIMITS.step} characters.`,
  badCommand: (n: number) =>
    `Step ${n}'s \`command\` must be text under ${ACTION_LIMITS.command} characters, or left out.`,
} as const;

/** What the agent is told: the call's result. */
export const ACTION_RESULTS = {
  done: "The user says it's done.",
  cant: (reason?: string) => (reason ? `The user couldn't do it: ${reason}` : "The user couldn't do it."),
} as const;

/** The card's words: short, sentence case, provider neutral. */
export const ACTION_COPY = {
  /** The card's line about who asks. */
  asked: "The agent asks you to do this.",
  done: "Done",
  cantDo: "Can't do it",
  reason: "Reason",
  reasonHint: "Why not? (optional)",
  copy: "Copy",
  copied: "Copied",
  copyLabel: (n: number) => `Copy the command of step ${n}`,
  /** The tool row's mark while it waits. */
  waiting: "Waiting for you",
  /** The Inbox's kind label for the request. */
  kind: "Request",
} as const;

const oneLine = (text: string) => text.trim().replace(/\s+/g, " ");

function parseStep(raw: unknown, n: number): Parsed<ActionStep> {
  if (!isRecord(raw) || typeof raw.text !== "string") return { ok: false, error: ACTION_MESSAGES.badStep(n) };
  const text = raw.text.trim();
  if (!text || text.length > ACTION_LIMITS.step) return { ok: false, error: ACTION_MESSAGES.badStep(n) };
  if (raw.command === undefined || raw.command === null) return { ok: true, value: { text } };
  if (typeof raw.command !== "string") return { ok: false, error: ACTION_MESSAGES.badCommand(n) };
  const command = raw.command.trim();
  if (command.length > ACTION_LIMITS.command) return { ok: false, error: ACTION_MESSAGES.badCommand(n) };
  return { ok: true, value: command ? { text, command } : { text } };
}

/** The agent's request, checked: a title, an optional why, and 1 to 10 steps, each with its text and optional command. */
export function parseActionRequest(input: unknown): Parsed<ActionRequest> {
  const raw = isRecord(input) ? input : {};
  const title = typeof raw.title === "string" ? oneLine(raw.title) : "";
  if (!title) return { ok: false, error: ACTION_MESSAGES.badTitle };
  if (title.length > ACTION_LIMITS.title) return { ok: false, error: ACTION_MESSAGES.longTitle };
  if (raw.why !== undefined && raw.why !== null && typeof raw.why !== "string") {
    return { ok: false, error: ACTION_MESSAGES.badWhy };
  }
  const why = typeof raw.why === "string" ? raw.why.trim() : "";
  if (why.length > ACTION_LIMITS.why) return { ok: false, error: ACTION_MESSAGES.longWhy };
  if (!Array.isArray(raw.steps) || raw.steps.length === 0 || raw.steps.length > ACTION_LIMITS.steps) {
    return { ok: false, error: ACTION_MESSAGES.badSteps };
  }
  const steps: ActionStep[] = [];
  for (const [i, s] of raw.steps.entries()) {
    const step = parseStep(s, i + 1);
    if (!step.ok) return step;
    steps.push(step.value);
  }
  return { ok: true, value: { title, ...(why ? { why } : {}), steps } };
}

/** The request card's input, as the client reads it from the approval; null if it isn't one. */
export function actionAsk(input: unknown): ActionRequest | null {
  const parsed = parseActionRequest(input);
  return parsed.ok ? parsed.value : null;
}

/** The `action.request` call's answer as it crosses the socket, checked; null if it isn't one. */
export function parseActionOutcome(raw: unknown): ActionOutcome | null {
  if (!isRecord(raw)) return null;
  if (raw.outcome === "done") return { outcome: "done" };
  if (raw.outcome !== "cant") return null;
  if (raw.reason !== undefined && typeof raw.reason !== "string") return null;
  return raw.reason ? { outcome: "cant", reason: raw.reason } : { outcome: "cant" };
}
