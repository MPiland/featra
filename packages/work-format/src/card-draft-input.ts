/**
 * What `draft_cards` takes (STORY-8): a feature and its stories, as an agent writes them. Pure, so the MCP checks the
 * call before it is sent and the server checks it again, with this one parser. An agent's input is data from outside:
 * a refusal says what to fix, and nothing is written for a refused draft.
 */
import type { Parsed } from "./knowledge-log.ts";
import { parseId } from "./ids.ts";
import { isRecord } from "./utils/guards.ts";

export interface DraftStory {
  /** The story's card, when the call revises a draft that already has it; null for a new story. */
  id: string | null;
  title: string;
  /** The user story: "As a builder, I …". */
  story: string;
  criteria: string[];
  tasks: string[];
}

export interface DraftInput {
  feature: { title: string; description: string };
  stories: DraftStory[];
}

/** What a draft may hold, so it stays a draft and not a document. */
export const DRAFT_LIMITS = {
  title: 120,
  description: 2000,
  story: 600,
  item: 300,
  criteria: 12,
  tasks: 20,
  stories: 12,
} as const;

/** Text on one line: line breaks and runs of spaces collapse. */
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

function line(raw: unknown, name: string, max: number): Parsed<string> {
  if (typeof raw !== "string" || !oneLine(raw)) return { ok: false, error: `"${name}" is required: give it as text.` };
  const value = oneLine(raw);
  if (value.length > max) return { ok: false, error: `"${name}" is too long: at most ${max} characters.` };
  return { ok: true, value };
}

/** A card's own sections are headings, so text with a heading line would split the card in two. */
const HEADING = /^\s{0,3}#{1,2}\s/m;

function paragraph(raw: unknown, name: string, max: number): Parsed<string> {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, error: `"${name}" is required: give it as text.` };
  const value = raw.replace(/\r\n/g, "\n").trim();
  if (value.length > max) return { ok: false, error: `"${name}" is too long: at most ${max} characters.` };
  if (HEADING.test(value))
    return { ok: false, error: `"${name}" can't hold a heading (a line starting with # or ##).` };
  return { ok: true, value };
}

function items(raw: unknown, name: string, max: number, least: number): Parsed<string[]> {
  if (raw !== undefined && raw !== null && !Array.isArray(raw)) {
    return { ok: false, error: `"${name}" must be a list of text.` };
  }
  const list = (raw ?? []) as unknown[];
  if (list.length < least) return { ok: false, error: `"${name}" needs at least ${least}.` };
  if (list.length > max) return { ok: false, error: `"${name}" lists too many: at most ${max}.` };
  const out: string[] = [];
  for (const item of list) {
    const one = line(item, name, DRAFT_LIMITS.item);
    if (!one.ok) return one;
    out.push(one.value);
  }
  return { ok: true, value: out };
}

function parseStory(raw: unknown, at: number): Parsed<DraftStory> {
  const label = `stories[${at}]`;
  if (!isRecord(raw)) return { ok: false, error: `${label} must be an object.` };
  const fail = (error: string): Parsed<DraftStory> => ({ ok: false, error: `${label}: ${error}` });
  const title = line(raw.title, "title", DRAFT_LIMITS.title);
  if (!title.ok) return fail(title.error);
  const story = paragraph(raw.story, "story", DRAFT_LIMITS.story);
  if (!story.ok) return fail(story.error);
  const criteria = items(raw.criteria, "criteria", DRAFT_LIMITS.criteria, 1);
  if (!criteria.ok) return fail(criteria.error);
  const tasks = items(raw.tasks, "tasks", DRAFT_LIMITS.tasks, 0);
  if (!tasks.ok) return fail(tasks.error);
  let id: string | null = null;
  if (raw.id !== undefined && raw.id !== null && raw.id !== "") {
    const given = typeof raw.id === "string" ? raw.id.trim() : "";
    if (parseId(given)?.prefix !== "STORY") return fail(`"id" must be a story id such as STORY-8.`);
    id = given;
  }
  return {
    ok: true,
    value: { id, title: title.value, story: story.value, criteria: criteria.value, tasks: tasks.value },
  };
}

/** The input of `draft_cards`, checked. */
export function parseDraft(raw: unknown): Parsed<DraftInput> {
  const r = isRecord(raw) ? raw : {};
  if (!isRecord(r.feature)) {
    return { ok: false, error: `"feature" is required: an object with a title and description.` };
  }
  const title = line(r.feature.title, "feature.title", DRAFT_LIMITS.title);
  if (!title.ok) return title;
  const description = paragraph(r.feature.description, "feature.description", DRAFT_LIMITS.description);
  if (!description.ok) return description;
  if (!Array.isArray(r.stories) || r.stories.length === 0) {
    return { ok: false, error: `"stories" is required: a list of at least one story.` };
  }
  if (r.stories.length > DRAFT_LIMITS.stories) {
    return { ok: false, error: `"stories" lists too many: at most ${DRAFT_LIMITS.stories}.` };
  }
  const stories: DraftStory[] = [];
  for (const [at, item] of (r.stories as unknown[]).entries()) {
    const story = parseStory(item, at);
    if (!story.ok) return story;
    stories.push(story.value);
  }
  const named = stories.flatMap((s) => (s.id ? [s.id] : []));
  const twice = named.find((id, at) => named.indexOf(id) !== at);
  if (twice) return { ok: false, error: `${twice} is given for more than one story.` };
  return { ok: true, value: { feature: { title: title.value, description: description.value }, stories } };
}

/** What a draft call did, as the server answers it: the cards in the draft, and which of them this call wrote. */
export interface DraftResult {
  feature: string;
  /** The stories in the draft that are not cancelled, in order. */
  stories: string[];
  /** True when this call made the feature; false when it revised the draft in place. */
  created: boolean;
  /** The cards this call wrote: new ones, and ones whose content changed. */
  changed: string[];
  /** The stories a revision left out, which are now Cancelled. */
  cancelled: string[];
}

const textList = (raw: unknown): string[] | null =>
  Array.isArray(raw) && raw.every((x) => typeof x === "string") ? raw : null;

/** The server's answer, checked by the MCP process before it tells the agent. */
export function parseDraftResult(raw: unknown): DraftResult | null {
  if (!isRecord(raw)) return null;
  const stories = textList(raw.stories);
  const changed = textList(raw.changed);
  const cancelled = textList(raw.cancelled);
  if (typeof raw.feature !== "string" || typeof raw.created !== "boolean" || !stories || !changed || !cancelled) {
    return null;
  }
  return { feature: raw.feature, stories, created: raw.created, changed, cancelled };
}
