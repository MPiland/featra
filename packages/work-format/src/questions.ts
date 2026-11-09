/**
 * Agent questions (STORY-46, ADR 0018): an agent can stop in the middle of a turn and ask the user to choose. The
 * question is provider neutral, so a Codex or ACP adapter (M2) feeds the same card. The shape, the check on an
 * answer and the wire params are shared by the server, which holds the question, and the client, which shows it.
 */
import { isRecord } from "./utils/guards.ts";

export interface QuestionOption {
  label: string;
  /** What choosing it means; empty when the agent gave none. */
  description: string;
}

export interface Question {
  /** The whole question, which also names it: answers are keyed by it, so no two questions in a call share one. */
  question: string;
  /** A very short label for the card; empty when the agent gave none. */
  header: string;
  options: QuestionOption[];
  /** The user may choose several options at once. */
  multiSelect: boolean;
}

/** The user's answers: for each question's text, what they chose (an option's label, or their own words for Other). */
export type Answers = Record<string, string[]>;

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((c) => typeof c === "string");
const text = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

function normalizeOption(raw: unknown): QuestionOption | null {
  if (!isRecord(raw) || !text(raw.label)) return null;
  return { label: raw.label, description: typeof raw.description === "string" ? raw.description : "" };
}

function normalizeQuestion(raw: unknown): Question | null {
  if (!isRecord(raw) || !text(raw.question) || !Array.isArray(raw.options)) return null;
  const options = raw.options.map(normalizeOption);
  if (options.length === 0 || options.some((o) => o === null)) return null;
  return {
    question: raw.question,
    header: typeof raw.header === "string" ? raw.header : "",
    options: options.filter((o): o is QuestionOption => o !== null),
    multiSelect: raw.multiSelect === true,
  };
}

/** The questions of a call as read from the agent or the socket, or null when any is malformed or two share a text. */
export function normalizeQuestions(raw: unknown): Question[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const questions = raw.map(normalizeQuestion);
  if (questions.some((q) => q === null)) return null;
  const read = questions.filter((q): q is Question => q !== null);
  return new Set(read.map((q) => q.question)).size === read.length ? read : null;
}

/**
 * The answers as the questions can take them, or null: each question answered, a single choice by exactly one thing,
 * a multiple choice by one or more. Blank answers are dropped and answers to other questions ignored.
 */
export function validAnswers(questions: readonly Question[], given: Answers): Answers | null {
  const answers: Answers = {};
  for (const { question, multiSelect } of questions) {
    const chosen = (given[question] ?? []).map((a) => a.trim()).filter(Boolean);
    if (chosen.length === 0 || (!multiSelect && chosen.length > 1)) return null;
    answers[question] = chosen;
  }
  return answers;
}

/** The `{ id, tool, answers }` params of `chat.answer`, or null. */
export function chatAnswerParams(params: unknown): { id: string; tool: string; answers: Answers } | null {
  if (!isRecord(params) || !text(params.id) || !text(params.tool) || !isRecord(params.answers)) return null;
  const answers: Answers = {};
  for (const [question, chosen] of Object.entries(params.answers)) {
    if (!isStrings(chosen)) return null;
    answers[question] = chosen;
  }
  return { id: params.id, tool: params.tool, answers };
}
