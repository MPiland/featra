/**
 * Claude's AskUserQuestion (STORY-46, spike-claude-sdk.md#ask): the SDK asks `canUseTool` about it like any tool that
 * needs approval. Featra shows the questions as a card and answers by allowing the call with the answers added to its
 * input, which Claude hands the agent as the tool's result. Everything Claude-specific about it is here.
 */
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { normalizeQuestions, type Answers, type Question } from "@featra/work-format";
import type { QuestionDecision } from "./provider.ts";

export const ASK_USER_QUESTION = "AskUserQuestion";

/** What the agent is told when it asks questions Featra can't show: it asks again, rightly. */
export const MALFORMED_QUESTIONS =
  "These questions can't be shown. Ask again with 1 to 4 questions, each with its own text and with distinct, non-empty options.";

/**
 * What an AskUserQuestion call asks: its questions, or a denial when they are malformed (none, a blank text or label,
 * two questions with one text, two options with one label). The user is not asked, since allowing it would run the tool
 * with no answers. Null for any other call.
 */
export function claudeQuestions(
  name: string,
  input: Record<string, unknown>,
): { questions: Question[] } | { refusal: PermissionResult } | null {
  if (name !== ASK_USER_QUESTION) return null;
  const questions = normalizeQuestions(input.questions);
  return questions ? { questions } : { refusal: { behavior: "deny", message: MALFORMED_QUESTIONS } };
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
