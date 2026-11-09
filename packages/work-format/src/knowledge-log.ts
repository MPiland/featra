/**
 * The entries an agent logs through the Featra MCP (STORY-47): what each tool takes, the dated entry it becomes in
 * `decisions.md` or `open-questions.md`, and how one entry is added to or taken out of a file's text. Pure, so the
 * MCP, the server and the tests share one copy. A hidden marker names each entry, so Undo removes exactly that one.
 */
import { LOG_FILES, type LogFile, type LogKind } from "./log-files.ts";
import { FEATRA_SCAFFOLD } from "./scaffold.ts";
import { parseId } from "./ids.ts";
import { isRecord } from "./utils/guards.ts";

export { LOG_FILES, type LogFile, type LogKind };

export interface DecisionInput {
  kind: "decision";
  decision: string;
  why: string;
  /** The alternatives that were turned down. */
  rejected: string[];
  /** The card the work is for, when the agent knows it. */
  card: string | null;
}

export interface QuestionInput {
  kind: "question";
  question: string;
  context: string;
  card: string | null;
}

export type LogInput = DecisionInput | QuestionInput;

/** Longest text a field takes, so a log entry stays an entry and not a document. */
export const LOG_LIMITS = { headline: 300, reason: 1500, alternative: 300, alternatives: 10 } as const;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** What an entry's marker looks like in the file: a comment, so it doesn't show when the file is rendered. */
export const entryMarker = (id: string) => `<!-- featra:${id} -->`;
const MARKER_TEXT = /<!--\s*featra:[\w-]*\s*-->/g;

/** Text on one line: line breaks and runs of spaces collapse, and nothing in it can pass for a marker. */
const oneLine = (line: string) => line.replace(MARKER_TEXT, "").replace(/\s+/g, " ").trim();

function text(raw: unknown, name: string, max: number): Parsed<string> {
  if (typeof raw !== "string" || !oneLine(raw)) return { ok: false, error: `"${name}" is required: give it as text.` };
  const value = oneLine(raw);
  if (value.length > max) return { ok: false, error: `"${name}" is too long: at most ${max} characters.` };
  return { ok: true, value };
}

function alternatives(raw: unknown): Parsed<string[]> {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: `"rejected" must be a list of the alternatives turned down.` };
  if (raw.length > LOG_LIMITS.alternatives) {
    return { ok: false, error: `"rejected" lists too many: at most ${LOG_LIMITS.alternatives}.` };
  }
  const out: string[] = [];
  for (const item of raw as unknown[]) {
    const one = text(item, "rejected", LOG_LIMITS.alternative);
    if (!one.ok) return one;
    out.push(one.value);
  }
  return { ok: true, value: out };
}

function card(raw: unknown): Parsed<string | null> {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string" || !parseId(raw.trim())) {
    return { ok: false, error: `"card" must be a card id such as STORY-47.` };
  }
  return { ok: true, value: raw.trim() };
}

/** The input of `log_decision`, checked: agents' input is data from outside, and a refusal says what to fix. */
export function parseDecision(raw: unknown): Parsed<DecisionInput> {
  const r = isRecord(raw) ? raw : {};
  const decision = text(r.decision, "decision", LOG_LIMITS.headline);
  if (!decision.ok) return decision;
  const why = text(r.why, "why", LOG_LIMITS.reason);
  if (!why.ok) return why;
  const rejected = alternatives(r.rejected);
  if (!rejected.ok) return rejected;
  const cardId = card(r.card);
  if (!cardId.ok) return cardId;
  const value: DecisionInput = {
    kind: "decision",
    decision: decision.value,
    why: why.value,
    rejected: rejected.value,
    card: cardId.value,
  };
  return { ok: true, value };
}

/** The input of `defer_question`, checked. */
export function parseQuestion(raw: unknown): Parsed<QuestionInput> {
  const r = isRecord(raw) ? raw : {};
  const question = text(r.question, "question", LOG_LIMITS.headline);
  if (!question.ok) return question;
  const context = text(r.context, "context", LOG_LIMITS.reason);
  if (!context.ok) return context;
  const cardId = card(r.card);
  if (!cardId.ok) return cardId;
  return {
    ok: true,
    value: { kind: "question", question: question.value, context: context.value, card: cardId.value },
  };
}

/** The input of either tool, by the kind a caller names. */
export function parseLogInput(kind: unknown, raw: unknown): Parsed<LogInput> {
  if (kind === "decision") return parseDecision(raw);
  if (kind === "question") return parseQuestion(raw);
  return { ok: false, error: "Unknown kind of entry." };
}

/** Who logged an entry, and when: the server's part of it. */
export interface EntryContext {
  /** `YYYY-MM-DD`. */
  date: string;
  /** The session that logged it, as a reader knows it ("Developer chat 1a2b3c4d"). */
  session: string;
  id: string;
}

/** One entry as markdown lines (no final line break): the list item the files already use, with its details under it. */
export function formatEntry(input: LogInput, { date, session, id }: EntryContext): string {
  const head = input.kind === "decision" ? input.decision : input.question;
  const details =
    input.kind === "decision"
      ? [`Why: ${input.why}`, ...(input.rejected.length > 0 ? [`Rejected: ${input.rejected.join("; ")}`] : [])]
      : [`Context: ${input.context}`];
  const rest = [...details, `Session: ${oneLine(session)}`, ...(input.card ? [`Card: ${input.card}`] : [])];
  return [`- ${date} — ${head} ${entryMarker(id)}`, ...rest.map((line) => `  - ${line}`)].join("\n");
}

const eolOf = (file: string) => (file.includes("\r\n") ? "\r\n" : "\n");
const linesOf = (file: string) => file.split(/\r?\n/);

/** A missing file's start: the header Featra init writes for it. */
export function newLogFile(file: LogFile): string {
  const entry = FEATRA_SCAFFOLD.find((e) => e.path === file);
  return entry?.kind === "file" ? entry.content : "";
}

/** The file with the entry added at its end, in the file's own line endings. Existing text is kept as it is. */
export function addEntry(file: string, entry: string): string {
  const eol = eolOf(file);
  const last = linesOf(file.trimEnd()).at(-1) ?? "";
  // A list item or its details follow on directly; after anything else the list starts after a blank line.
  const endsBlank = /\n[ \t]*\r?\n$/.test(file);
  const gap = file.trim() === "" || endsBlank || /^(- |\s)/.test(last) ? "" : eol;
  const base = file === "" || file.endsWith("\n") ? file : file + eol;
  return base + gap + entry.replaceAll("\n", eol) + eol;
}

/** Why an entry couldn't be taken out: it was changed by hand, or it is no longer there. */
export type RemoveResult = { ok: true; text: string } | { ok: false; reason: "edited" | "gone" };

/**
 * The file without the entry `written` (the text `addEntry` was given), found by its marker. Only that entry's lines
 * go: entries logged after it, and everything else in the file, stay. An entry the user has since edited is left as
 * it is (`edited`), so Undo never throws their words away.
 */
export function removeEntry(file: string, id: string, written: string): RemoveResult {
  const eol = eolOf(file);
  const all = linesOf(file);
  const at = all.findIndex((line) => line.includes(entryMarker(id)));
  if (at < 0) return { ok: false, reason: "gone" };
  let end = at + 1;
  while (end < all.length && /^ {2}\S/.test(all[end] ?? "")) end++;
  if (all.slice(at, end).join("\n") !== written) return { ok: false, reason: "edited" };
  all.splice(at, end - at);
  return { ok: true, text: all.join(eol) };
}
