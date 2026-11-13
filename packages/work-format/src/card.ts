import { parse, stringify } from "yaml";
import {
  HISTORY_FIELDS,
  type AcceptanceCriterion,
  type BodySection,
  type Card,
  type CardType,
  type ChecklistItem,
  type HistoryEvent,
  type Origin,
} from "./types.ts";
import { errorMessage, isOneOf, isRecord, toText } from "./utils/guards.ts";

const KNOWN_KEYS = [
  "id",
  "type",
  "title",
  "status",
  "parent",
  "order",
  "origin",
  "role",
  "agent",
  "model",
  "reasoning",
  "sessions",
  "branch",
  "pr",
  "created",
  "history",
] as const;
const STORY_ONLY_KEYS = new Set(["role", "agent", "model", "reasoning", "sessions", "branch", "pr"]);
const CARD_TYPES: readonly CardType[] = ["epic", "feature", "story", "bug"];
const ORIGINS: readonly Origin[] = ["planned", "added", "bug"];

const H_DESCRIPTION = "Description";
const H_ACS = "Acceptance criteria";
const H_TASKS = "Tasks";
const H_NOTES = "Notes";
const KNOWN_HEADINGS = new Set([H_DESCRIPTION, H_ACS, H_TASKS, H_NOTES]);

export class CardParseError extends Error {
  readonly source: string | undefined;
  constructor(message: string, source?: string) {
    super(source ? `${source}: ${message}` : message);
    this.source = source;
  }
}

/** True for card types that carry agent/branch fields and stage-based statuses. */
export function isWorkItem(type: CardType): boolean {
  return type === "story" || type === "bug";
}

export function parseCard(text: string, source?: string): Card {
  const normalized = text.replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalized);
  if (!match) throw new CardParseError("missing frontmatter", source);
  let parsed: unknown;
  try {
    parsed = parse(match[1] ?? "") ?? {};
  } catch (e) {
    throw new CardParseError(`invalid frontmatter: ${errorMessage(e)}`, source);
  }
  if (!isRecord(parsed)) throw new CardParseError("frontmatter must be a mapping", source);
  const fm = parsed;
  const body = parseBody(match[2] ?? "");

  const type = fm.type;
  if (!isOneOf(CARD_TYPES, type)) throw new CardParseError(`unknown type "${toText(type)}"`, source);
  if (typeof fm.id !== "string" || !fm.id) throw new CardParseError("missing id", source);
  if (typeof fm.title !== "string") throw new CardParseError("missing title", source);
  if (typeof fm.status !== "string") throw new CardParseError("missing status", source);
  const origin = fm.origin ?? "planned";
  if (!isOneOf(ORIGINS, origin)) throw new CardParseError(`unknown origin "${toText(origin)}"`, source);

  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fm)) {
    if (!(KNOWN_KEYS as readonly string[]).includes(k)) extra[k] = v;
  }

  return {
    id: fm.id,
    type,
    title: fm.title,
    status: fm.status,
    parent: str(fm.parent),
    order: typeof fm.order === "number" ? fm.order : 0,
    origin,
    role: str(fm.role),
    agent: str(fm.agent),
    model: str(fm.model),
    reasoning: str(fm.reasoning),
    sessions: Array.isArray(fm.sessions) ? fm.sessions.map(String) : [],
    branch: str(fm.branch),
    pr: str(fm.pr),
    created: dateStr(fm.created) ?? "",
    history: parseHistory(fm.history, source),
    description: body.description,
    acs: body.acs,
    tasks: body.tasks,
    notes: body.notes,
    extraSections: body.extra,
    extra,
  };
}

export function serializeCard(card: Card): string {
  const fm: Record<string, unknown> = {
    id: card.id,
    type: card.type,
    title: card.title,
    status: card.status,
    parent: card.parent,
    order: card.order,
    origin: card.origin,
  };
  if (isWorkItem(card.type)) {
    Object.assign(fm, {
      role: card.role,
      agent: card.agent,
      model: card.model,
      reasoning: card.reasoning,
      sessions: card.sessions,
      branch: card.branch,
      pr: card.pr,
    });
  } else if (card.type === "feature" && card.pr !== null) {
    // A feature's PR to main (STORY-14, ADR 0037); written only once it has one, so other features read as before.
    fm.pr = card.pr;
  }
  fm.created = card.created;
  fm.history = card.history.map((h) => ({ at: h.at, field: h.field, from: h.from, to: h.to, by: h.by }));
  for (const [k, v] of Object.entries(card.extra)) {
    if (!(k in fm) && !STORY_ONLY_KEYS.has(k)) fm[k] = v;
  }

  const yaml = stringify(fm, { lineWidth: 0, nullStr: "null" }).trimEnd();
  const parts = ["---", yaml, "---", "", `## ${H_DESCRIPTION}`, "", card.description.trim(), ""];
  if (isWorkItem(card.type) || card.acs.length || card.tasks.length) {
    parts.push(`## ${H_ACS}`, "", ...card.acs.map(formatAc), "");
    parts.push(`## ${H_TASKS}`, "", ...card.tasks.map((t) => `- [${t.done ? "x" : " "}] ${t.text}`), "");
    parts.push(`## ${H_NOTES}`, "", ...(card.notes.trim() ? [card.notes.trim(), ""] : []));
  } else if (card.notes.trim()) {
    parts.push(`## ${H_NOTES}`, "", card.notes.trim(), "");
  }
  for (const s of card.extraSections)
    parts.push(`## ${s.heading}`, "", ...(s.content.trim() ? [s.content.trim(), ""] : []));
  return collapseBlankRuns(parts.join("\n")).replace(/\n*$/, "\n");
}

function formatAc(ac: AcceptanceCriterion): string {
  return `- [${ac.done ? "x" : " "}] ${ac.text}${ac.test ? ` (test: ${ac.test})` : ""}${ac.evidence ? ` (evidence: ${ac.evidence})` : ""}`;
}

interface ParsedBody {
  description: string;
  acs: AcceptanceCriterion[];
  tasks: ChecklistItem[];
  notes: string;
  extra: BodySection[];
}

function parseBody(body: string): ParsedBody {
  const sections: BodySection[] = [];
  let current: BodySection | null = null;
  const preamble: string[] = [];
  for (const line of body.split("\n")) {
    const h = /^## (.+?)\s*$/.exec(line);
    if (h) {
      current = { heading: h[1] ?? "", content: "" };
      sections.push(current);
    } else if (current) {
      current.content += line + "\n";
    } else {
      preamble.push(line);
    }
  }
  const get = (heading: string) => sections.find((s) => s.heading === heading)?.content ?? "";
  const pre = preamble.join("\n").trim();
  const desc = get(H_DESCRIPTION).trim();
  return {
    description: [pre, desc].filter(Boolean).join("\n\n"),
    acs: parseChecklist(get(H_ACS)).map(splitTestRef),
    tasks: parseChecklist(get(H_TASKS)),
    notes: get(H_NOTES).trim(),
    extra: sections
      .filter((s) => !KNOWN_HEADINGS.has(s.heading))
      .map((s) => ({ heading: s.heading, content: s.content.trim() })),
  };
}

function parseChecklist(content: string): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  let last: ChecklistItem | undefined;
  for (const line of content.split("\n")) {
    const m = /^\s*[-*] \[( |x|X)\] (.*)$/.exec(line);
    if (m) {
      last = { done: m[1] !== " ", text: (m[2] ?? "").trim() };
      items.push(last);
    } else if (last && /^\s+\S/.test(line)) {
      // An indented line continues the item above it, as in Markdown; it is written back unwrapped.
      last.text = `${last.text} ${line.trim()}`;
    } else {
      last = undefined;
    }
  }
  return items;
}

/**
 * An AC's trailing references: `(test: <ref>)`, then `(evidence: <path>)`, each optional. A ref may hold balanced
 * parentheses, one deep, as test names do ("Accept (AC1) > ..."; BUG-20).
 */
function splitTestRef(item: ChecklistItem): AcceptanceCriterion {
  const m = /^(.*?)(?:\s*\(test: ((?:[^()]|\([^()]*\))+)\))?(?:\s*\(evidence: ([^)]+)\))?\s*$/.exec(item.text);
  const [, text, test, evidence] = m ?? [];
  if (text === undefined || (!test && !evidence)) return { ...item, test: null };
  return { ...item, text, test: test?.trim() || null, ...(evidence?.trim() ? { evidence: evidence.trim() } : {}) };
}

function parseHistory(raw: unknown, source?: string): HistoryEvent[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new CardParseError("history must be a list", source);
  return (raw as unknown[]).map((ev, i) => {
    if (!isRecord(ev)) throw new CardParseError(`history[${i}] must be a mapping`, source);
    const at = dateStr(ev.at);
    if (!at) throw new CardParseError(`history[${i}] missing "at"`, source);
    return {
      at,
      field: historyField(ev.field ?? "status", i, source),
      from: str(ev.from),
      to: str(ev.to),
      by: typeof ev.by === "string" ? ev.by : "unknown",
    };
  });
}

function historyField(field: unknown, i: number, source?: string): HistoryEvent["field"] {
  if (!isOneOf(HISTORY_FIELDS, field))
    throw new CardParseError(`history[${i}] has unknown field "${toText(field)}"`, source);
  return field;
}

function str(v: unknown): string | null {
  return v === null || v === undefined ? null : toText(v);
}

function dateStr(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().replace(".000Z", "Z");
  return v === null || v === undefined ? null : toText(v);
}

function collapseBlankRuns(s: string): string {
  return s.replace(/\n{3,}/g, "\n\n");
}

export interface NewCardInput {
  id: string;
  type: CardType;
  title: string;
  status: string;
  parent?: string | null;
  order?: number;
  origin?: Origin;
  role?: string | null;
  agent?: string | null;
  model?: string | null;
  reasoning?: string | null;
  description?: string;
  acs?: AcceptanceCriterion[];
  tasks?: ChecklistItem[];
}

/** A new card with defaults filled in and its creation recorded as the first history event. */
export function newCard(input: NewCardInput, by: string, at: string): Card {
  return {
    id: input.id,
    type: input.type,
    title: input.title,
    status: input.status,
    parent: input.parent ?? null,
    order: input.order ?? 0,
    origin: input.origin ?? "planned",
    role: input.role ?? null,
    agent: input.agent ?? null,
    model: input.model ?? null,
    reasoning: input.reasoning ?? null,
    sessions: [],
    branch: null,
    pr: null,
    created: at,
    history: [{ at, field: "status", from: null, to: input.status, by }],
    description: input.description ?? "",
    acs: input.acs ?? [],
    tasks: input.tasks ?? [],
    notes: "",
    extraSections: [],
    extra: {},
  };
}
