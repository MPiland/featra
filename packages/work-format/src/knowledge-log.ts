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

/** Removes every marker-looking comment, again until none is left: removing one can join the text around it into one. */
function withoutMarkers(line: string): string {
  let current = line;
  for (let before = ""; before !== current;) {
    before = current;
    current = current.replace(MARKER_TEXT, "");
  }
  return current;
}

/** Text on one line: line breaks and runs of spaces collapse, and nothing in it can pass for a marker. */
const oneLine = (line: string) => withoutMarkers(line).replace(/\s+/g, " ").trim();

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

/** A file's line ending: the one its last line break uses, so new lines match the lines they follow. */
const eolOf = (file: string) => (/\r\n[^\n]*$/.test(file) ? "\r\n" : "\n");

/** A file's lines, each with the line break that ended it (empty for a last line without one). */
const linesOf = (file: string) => {
  const parts = file.split(/(\r?\n)/);
  const lines: { text: string; end: string }[] = [];
  for (let i = 0; i < parts.length; i += 2) lines.push({ text: parts[i] ?? "", end: parts[i + 1] ?? "" });
  return lines;
};

/** A missing file's start: the header Featra init writes for it. */
export function newLogFile(file: LogFile): string {
  const entry = FEATRA_SCAFFOLD.find((e) => e.path === file);
  return entry?.kind === "file" ? entry.content : "";
}

/**
 * The file with the entry added at its end, in the file's own line endings (existing text is kept as it is), and
 * whether a blank line was put before it, which `removeEntry` takes back.
 */
export function appendEntry(file: string, entry: string): { text: string; gap: boolean } {
  const eol = eolOf(file);
  const last = linesOf(file.trimEnd()).at(-1)?.text ?? "";
  // A list item or its details follow on directly; after anything else the list starts after a blank line.
  const endsBlank = /\n[ \t]*\r?\n$/.test(file);
  const gap = !(file.trim() === "" || endsBlank || /^(- |\s)/.test(last));
  const base = file === "" || file.endsWith("\n") ? file : file + eol;
  return { text: base + (gap ? eol : "") + entry.replaceAll("\n", eol) + eol, gap };
}

/** The file with the entry added at its end. */
export const addEntry = (file: string, entry: string): string => appendEntry(file, entry).text;

/** Why an entry couldn't be taken out: it was changed by hand, or it is no longer there. */
export type RemoveResult = { ok: true; text: string } | { ok: false; reason: "edited" | "gone" };

/**
 * The file without the entry `written` (the text `addEntry` was given), found by its marker. Only that entry's lines
 * go, with the blank line `appendEntry` put before it (`gap`) when nothing follows it: entries logged after it, and
 * everything else in the file, stay, each line keeping its own line break. An entry the user has since edited, or
 * added a line under, is left as it is (`edited`), so Undo never throws their words away.
 */
export function removeEntry(file: string, id: string, written: string, gap = false): RemoveResult {
  const all = linesOf(file);
  const at = all.findIndex((line) => line.text.includes(entryMarker(id)));
  if (at < 0) return { ok: false, reason: "gone" };
  let end = at + 1;
  // Anything indented under the entry is part of it, however deep: one the entry didn't have is the user's.
  while (end < all.length && /^\s+\S/.test(all[end]?.text ?? "")) end++;
  const found = all
    .slice(at, end)
    .map((line) => line.text)
    .join("\n");
  if (found !== written) return { ok: false, reason: "edited" };
  const last = all.slice(end).every((line) => line.text.trim() === "");
  const from = gap && last && at > 0 && all[at - 1]?.text.trim() === "" ? at - 1 : at;
  all.splice(from, end - from);
  return { ok: true, text: all.map((line) => line.text + line.end).join("") };
}
