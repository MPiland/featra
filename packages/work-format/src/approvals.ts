/**
 * Tool approvals (STORY-45, ADR 0018): in Ask mode, a tool call the user's own Claude settings don't already allow
 * waits in the chat until the user answers Allow, Allow for this chat or Deny. The rules here are shared by the
 * server, which holds the requests, and the client, which shows them.
 */
import { isOneOf, isRecord } from "./utils/guards.ts";

/** How the user answered a tool request. */
export type ApprovalChoice = "allow" | "allow-chat" | "deny";
export const APPROVAL_CHOICES: readonly ApprovalChoice[] = ["allow", "allow-chat", "deny"];

/** How far an allow reaches: this one call, or every matching call for the rest of the chat. */
export type AllowScope = "once" | "chat";

/** The user's answer to one tool request. A Deny may say why; the agent is told. */
export interface ApprovalAnswer {
  choice: ApprovalChoice;
  reason?: string;
}

/**
 * Tools whose input is a shell command. Allow for this chat matches one of these by its exact command, never by the
 * tool alone: allowing `npm test` must not allow `rm -rf .`.
 */
export const SHELL_TOOLS: readonly string[] = ["Bash", "PowerShell"];

const command = (input: unknown): string | null =>
  isRecord(input) && typeof input.command === "string" ? input.command : null;

/**
 * A shell call's fields that don't change what runs or how it is sandboxed: its label, how long it may take, and
 * whether the agent waits for it. Every other field, known or not (`dangerouslyDisableSandbox`, or one the SDK adds
 * later), is part of the permission, so a rule never covers a call that runs differently.
 */
export const SHELL_FIELDS_IGNORED: readonly string[] = ["description", "timeout", "run_in_background"];

/** A shell call's input as a key: every field but the ignored ones, in a fixed order. */
function shellKey(input: unknown): string {
  if (!isRecord(input)) return JSON.stringify(input) ?? "null";
  const kept = Object.keys(input)
    .filter((k) => !SHELL_FIELDS_IGNORED.includes(k) && input[k] !== undefined)
    .toSorted()
    .map((k) => [k, input[k]]);
  return JSON.stringify(kept);
}

/**
 * What Allow for this chat remembers for a call: for a shell tool, the tool and its exact command with every field
 * that changes how it runs; for anything else, the tool's name. Two calls with the same key are the same permission.
 */
export function chatRuleKey(name: string, input: unknown): string {
  if (!SHELL_TOOLS.includes(name)) return name;
  return `${name}\u0000${shellKey(input)}`;
}

/** What Allow for this chat covers, as the button's description says it. */
export function chatRuleText(name: string, input: unknown): string {
  const cmd = SHELL_TOOLS.includes(name) ? command(input) : null;
  return cmd === null ? `Every ${name} call in this chat` : `${name}: ${cmd}, in this chat`;
}

/** The longest Deny reason the agent is sent. */
export const DENY_REASON_MAX = 500;

/** What the agent is told when the user denies a call, with the user's reason when there is one. */
export function denyMessage(reason?: string | null): string {
  const why = reason?.trim().slice(0, DENY_REASON_MAX);
  return why ? `The user denied this tool call: ${why}` : "The user denied this tool call.";
}

/** What a request that ended unanswered (Stop, the chat closing, the agent cancelling it) tells the agent. */
export const APPROVAL_CANCELLED = "The request was cancelled before the user answered.";

/** The `{ id, tool, choice, reason? }` params of `chat.approve`, or null. */
export function chatApproveParams(params: unknown): { id: string; tool: string; answer: ApprovalAnswer } | null {
  if (!isRecord(params)) return null;
  const { id, tool, choice, reason } = params;
  if (typeof id !== "string" || !id || typeof tool !== "string" || !tool) return null;
  if (!isOneOf(APPROVAL_CHOICES, choice)) return null;
  if (reason !== undefined && typeof reason !== "string") return null;
  const why = choice === "deny" && reason?.trim() ? reason.trim() : undefined;
  return { id, tool, answer: why ? { choice, reason: why } : { choice } };
}
