/**
 * Claude's AskUserQuestion (STORY-46, spike-claude-sdk.md#ask): the SDK asks `canUseTool` about it like any tool that
 * needs approval. Featra shows the questions as a card and answers by allowing the call with the answers added to its
 * input, which Claude hands the agent as the tool's result. Everything Claude-specific about it is here.
 */
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { normalizeQuestions, type Answers, type Question } from "@featra/work-format";
import type { QuestionDecision } from "./provider.ts";

export const ASK_USER_QUESTION = "AskUserQuestion";

/** The questions of an AskUserQuestion call, or null for any other call, or one with questions Featra can't show. */
export function claudeQuestions(name: string, input: Record<string, unknown>): Question[] | null {
  return name === ASK_USER_QUESTION ? normalizeQuestions(input.questions) : null;
}

/** Claude takes each answer as one string keyed by the question's text; several choices are joined with a comma. */
export const claudeAnswers = (answers: Answers): Record<string, string> =>
  Object.fromEntries(Object.entries(answers).map(([question, chosen]) => [question, chosen.join(", ")]));

/** What `canUseTool` answers once the user has: the call allowed with the answers, or refused. */
export function questionResult(input: Record<string, unknown>, decision: QuestionDecision): PermissionResult {
  return decision.allow
    ? { behavior: "allow", updatedInput: { ...input, answers: claudeAnswers(decision.answers) } }
    : { behavior: "deny", message: decision.message, ...(decision.interrupt ? { interrupt: true } : {}) };
}
