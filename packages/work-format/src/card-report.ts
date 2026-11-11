/**
 * What an agent may write to a card (STORY-10): pure rules over cards. A story session reports progress on its own card,
 * and a feature's Dev Lead on the cards of its feature: the stage up to the last one before Done, ticks, new tasks, a
 * note and links to evidence files. Everything is the agent's claim, so it is recorded as a `report` event by
 * `session:<chat>` and shows as Reported (ADR 0004); Done, Cancelled, a move back, and every other field stay with the user.
 * The server reads the owner's copy and writes the result; these decide.
 */
import { needsReview, draftedBy } from "./card-draft-guard.ts";
import { stageCategory } from "./config.ts";
import { appendHistory, setStatus } from "./history.ts";
import { parseId } from "./ids.ts";
import type { Parsed } from "./knowledge-log.ts";
import type { Card, ProjectConfig } from "./types.ts";
import { isRecord } from "./utils/guards.ts";

/** What a call may carry, so a report stays a report: the longest text, the most ticks and new tasks, and a file's size. */
export const REPORT_LIMITS = { text: 300, note: 1000, ticks: 40, added: 20, evidenceBytes: 1_000_000 } as const;

/** The card key that links a story's evidence folder. */
export const EVIDENCE_KEY = "evidence";

/** A criterion to tick, with the evidence file that backs it when there is one. */
export interface CriterionReport {
  criterion: string;
  evidence?: string;
}

export interface ReportInput {
  /** The card to update; a story session's own card when left out. */
  card?: string;
  /** The stage to move to. */
  stage?: string;
  /** Tasks to tick, by their text. */
  tasks?: string[];
  /** New tasks to add. */
  addTasks?: string[];
  criteria?: CriterionReport[];
  note?: string;
}

/** Who is calling: the chat, and the story it works on when it is a story session. */
export interface Reporter {
  chat: string;
  story: string | null;
  /** The Dev Lead chats a story's sessions nest under (the chats that spawned them). */
  leads?: (story: string) => readonly string[];
}

/** The folder of a card's evidence, `.featra/evidence/FEAT-N/STORY-M/`, or null when it has no feature. */
export function evidenceFolder(card: Pick<Card, "id" | "parent">): string | null {
  const feature = card.parent ? parseId(card.parent) : null;
  const own = parseId(card.id);
  return feature && own ? `.featra/evidence/${feature.prefix}-${feature.n}/${own.prefix}-${own.n}/` : null;
}

/** Text with its whitespace collapsed, so wording compares the way a person reads it. */
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const same = (a: string, b: string) => squash(a).toLowerCase() === squash(b).toLowerCase();

const PATH_CHARS = /^[A-Za-z0-9._\-/]+$/;

/** Why `path` can't be an evidence link of `card`, or null when it is a file inside the card's evidence folder. */
export function evidenceLinkError(card: Pick<Card, "id" | "parent">, path: string): string | null {
  const folder = evidenceFolder(card);
  if (folder === null) return `${card.id} has no feature, so it has no evidence folder.`;
  const inside = `Evidence goes in ${folder}`;
  if (!PATH_CHARS.test(path)) return `${inside} and its path uses only letters, digits, . _ - and /.`;
  const rest = path.startsWith(folder) ? path.slice(folder.length) : null;
  if (rest === null || rest === "") return `${inside}: link a file there.`;
  if (rest.split("/").some((part) => part === "" || part === "." || part === ".." || part.startsWith("."))) {
    return `${inside}: no empty, hidden or relative parts in the path.`;
  }
  return null;
}

/** The stage a report may move up to: the last one before the first that counts as done (Acceptance by default). */
export function stageCeiling(config: ProjectConfig): string | null {
  const firstDone = config.stages.findIndex((s) => stageCategory(s.name, config) === "done");
  return config.stages[(firstDone < 0 ? config.stages.length : firstDone) - 1]?.name ?? null;
}

/** Why a report can't touch `card` at all, or null: it is Cancelled, Done or past the ceiling, which are the user's. */
export function reportCardError(card: Card, config: ProjectConfig): string | null {
  const names = config.stages.map((s) => s.name);
  const at = names.indexOf(card.status);
  if (at < 0) return `${card.id} is ${card.status}, which a report can't move.`;
  const ceiling = stageCeiling(config);
  return ceiling !== null && at > names.indexOf(ceiling)
    ? `${card.id} is ${card.status}: a report only changes a card up to ${ceiling}.`
    : null;
}

/** Why `card` can't move to `to` by a report, or null: forward only, and never past the ceiling, Cancelled or unknown. */
export function reportStageError(card: Card, to: string, config: ProjectConfig): string | null {
  const names = config.stages.map((s) => s.name);
  const target = names.find((n) => n.toLowerCase() === to.trim().toLowerCase());
  const ceiling = stageCeiling(config);
  if (!target) return `${to} isn't a stage you can move to; the stages are ${names.join(", ")}.`;
  const past = ceiling !== null && names.indexOf(target) > names.indexOf(ceiling);
  if (past || stageCategory(target, config) === "done") {
    return `Only the user moves ${card.id} to ${target}, once it is verified and accepted; move it to ${ceiling ?? "the last stage before it"}.`;
  }
  const from = names.indexOf(card.status);
  if (from < 0) return `${card.id} is ${card.status}, which a report can't move.`;
  return names.indexOf(target) < from ? `${card.id} is ${card.status}: a report only moves a story forward.` : null;
}

/**
 * Why `who` may not update card `id`, or null when it may: the story's own latest session, or a Dev Lead of its feature
 * (the chat that drafted it, or the one the story's session nests under, which spawned it).
 */
export function reportAuthError(who: Reporter, id: string, cards: readonly Card[]): string | null {
  const card = cards.find((c) => c.id === id);
  if (!card) return "That card is gone.";
  if (who.story !== null) {
    if (id !== who.story) return `A story session can update only its own card, ${who.story}.`;
    const latest = card.sessions.at(-1);
    return latest === undefined || latest === who.chat
      ? null
      : `${id} has a newer session: this one can no longer update it.`;
  }
  const feature = cards.find((c) => c.id === card.parent);
  const lead = (feature !== undefined && draftedBy(feature) === who.chat) || (who.leads?.(id) ?? []).includes(who.chat);
  if (feature?.type !== "feature" || !lead) {
    return `${id} isn't yours to update: only its own story session and its feature's Dev Lead can.`;
  }
  return needsReview(feature) ? `${feature.id} is still a draft: revise it with draft_cards.` : null;
}

const text = (v: unknown, max: number): string | null => {
  const t = typeof v === "string" ? squash(v) : "";
  return t && t.length <= max ? t : null;
};

function texts(raw: unknown, name: string, max: number): Parsed<string[] | undefined> {
  if (raw === undefined) return { ok: true, value: undefined };
  const items = Array.isArray(raw) ? raw.map((r) => text(r, REPORT_LIMITS.text)) : [];
  if (!Array.isArray(raw) || items.length > max || items.some((t) => t === null)) {
    return {
      ok: false,
      error: `"${name}" is a list of at most ${max} texts of at most ${REPORT_LIMITS.text} characters.`,
    };
  }
  return { ok: true, value: items.filter((t) => t !== null) };
}

function criteria(raw: unknown): Parsed<CriterionReport[] | undefined> {
  if (raw === undefined) return { ok: true, value: undefined };
  const bad = {
    ok: false,
    error: `"criteria" is a list of at most ${REPORT_LIMITS.ticks} items like {criterion, evidence}.`,
  } as const;
  if (!Array.isArray(raw) || raw.length > REPORT_LIMITS.ticks) return bad;
  const out: CriterionReport[] = [];
  for (const r of raw) {
    const criterion = isRecord(r) ? text(r.criterion, REPORT_LIMITS.text) : null;
    const evidence = isRecord(r) && r.evidence !== undefined ? text(r.evidence, REPORT_LIMITS.text) : undefined;
    if (criterion === null || evidence === null) return bad;
    out.push({ criterion, ...(evidence ? { evidence } : {}) });
  }
  return { ok: true, value: out };
}

/** The call's input, or why it isn't one. */
export function parseReportInput(input: unknown): Parsed<ReportInput> {
  const raw = isRecord(input) ? input : {};
  const tasks = texts(raw.tasks, "tasks", REPORT_LIMITS.ticks);
  const addTasks = texts(raw.addTasks, "addTasks", REPORT_LIMITS.added);
  const crit = criteria(raw.criteria);
  if (!tasks.ok) return tasks;
  if (!addTasks.ok) return addTasks;
  if (!crit.ok) return crit;
  const note = raw.note === undefined ? undefined : text(raw.note, REPORT_LIMITS.note);
  if (note === null) return { ok: false, error: `"note" is text of at most ${REPORT_LIMITS.note} characters.` };
  const id = typeof raw.card === "string" ? raw.card.trim().toUpperCase() : "";
  const stage = typeof raw.stage === "string" ? raw.stage.trim() : "";
  if (raw.card !== undefined && !parseId(id))
    return { ok: false, error: "Give the card's id, such as STORY-9, as `card`." };
  const value: ReportInput = {
    ...(id ? { card: id } : {}),
    ...(stage ? { stage } : {}),
    ...(tasks.value?.length ? { tasks: tasks.value } : {}),
    ...(addTasks.value?.length ? { addTasks: addTasks.value } : {}),
    ...(crit.value?.length ? { criteria: crit.value } : {}),
    ...(note ? { note } : {}),
  };
  const { stage: s, tasks: t, addTasks: a, criteria: c, note: n } = value;
  return s || t || a || c || n
    ? { ok: true, value }
    : { ok: false, error: "Say what to update: stage, tasks, addTasks, criteria or note." };
}

export interface ReportContext {
  config: ProjectConfig;
}

/** What a report did: the card as it is now, a short line for each change, and the evidence files it links. */
export interface Reported {
  card: Card;
  changes: string[];
  links: string[];
}
export type ReportResult = ({ ok: true } & Reported) | { ok: false; error: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const quoted = (items: readonly { text: string }[]) => items.map((i) => `"${i.text}"`).join("; ") || "none";

/**
 * Ticks the items `wanted` names, each the first open one that reads so (else one already ticked); the ones that were
 * open are counted, `at` says which item each wanted text meant, and one that isn't there is why it fails.
 */
function ticked<T extends { text: string; done: boolean }>(
  items: readonly T[],
  wanted: readonly string[],
  what: string,
): { ok: true; items: T[]; count: number; at: number[] } | { ok: false; error: string } {
  let count = 0;
  const next = [...items];
  const at: number[] = [];
  for (const w of wanted) {
    const open = next.findIndex((i) => same(i.text, w) && !i.done);
    const any = open >= 0 ? open : next.findIndex((i) => same(i.text, w));
    const item = next[any];
    if (!item) {
      return {
        ok: false,
        error: `No ${what} reads "${w}" (case and spacing don't matter; at most ${REPORT_LIMITS.text} characters). It has: ${quoted(items)}.`,
      };
    }
    if (!item.done) {
      next[any] = { ...item, done: true };
      count += 1;
    }
    at.push(any);
  }
  return { ok: true, items: next, count, at };
}

const refuse = (error: string): ReportResult => ({ ok: false, error });

/** What one report changed, as the `report` event records it: only the delta, never a copy of the card. */
interface Delta {
  tasks?: string[];
  addTasks?: string[];
  criteria?: string[];
  evidence?: string[];
  note?: string;
}

/** The card with the report applied, as `by` at `at` (`who` signs the note), or why it can't be. */
export function applyReport(
  card: Card,
  input: ReportInput,
  ctx: ReportContext,
  by: string,
  at: string,
  who: string,
): ReportResult {
  if (card.type !== "story" && card.type !== "bug") return refuse(`${card.id} isn't a story or a bug.`);
  const closed = reportCardError(card, ctx.config);
  if (closed !== null) return refuse(closed);
  const changes: string[] = [];
  const links: string[] = [];
  const delta: Delta = {};
  let next: Card = card;

  if (input.stage && !same(input.stage, card.status)) {
    const why = reportStageError(card, input.stage, ctx.config);
    if (why !== null) return refuse(why);
    const to = ctx.config.stages.find((s) => same(s.name, input.stage ?? ""))?.name ?? input.stage;
    next = setStatus(next, to, by, at);
    changes.push(`moved to ${to}`);
  }
  if (input.tasks?.length || input.addTasks?.length) {
    const ticks = ticked(card.tasks, input.tasks ?? [], "task");
    if (!ticks.ok) return refuse(ticks.error);
    const added = (input.addTasks ?? []).filter(
      (t, i, all) => !ticks.items.some((o) => same(o.text, t)) && all.findIndex((o) => same(o, t)) === i,
    );
    if (ticks.count || added.length) {
      next = { ...next, tasks: [...ticks.items, ...added.map((t) => ({ text: t, done: false }))] };
      if (ticks.count) {
        changes.push(`ticked ${plural(ticks.count, "task")}`);
        delta.tasks = (input.tasks ?? []).filter((_, i) => !card.tasks[ticks.at[i] ?? -1]?.done);
      }
      if (added.length) {
        changes.push(`added ${plural(added.length, "task")}`);
        delta.addTasks = added;
      }
    }
  }
  if (input.criteria?.length) {
    const wanted = input.criteria;
    const ticks = ticked(
      card.acs,
      wanted.map((c) => c.criterion),
      "criterion",
    );
    if (!ticks.ok) return refuse(ticks.error);
    let acs = ticks.items;
    const linked: string[] = [];
    for (const [n, { evidence }] of wanted.entries()) {
      if (!evidence) continue;
      const why = evidenceLinkError(card, evidence);
      if (why !== null) return refuse(why);
      // The same criterion that was ticked, even when another one reads the same.
      const i = ticks.at[n] ?? -1;
      if (acs[i]?.evidence !== evidence) linked.push(evidence);
      acs = acs.map((a, j) => (j === i ? { ...a, evidence } : a));
      links.push(evidence);
    }
    if (ticks.count || linked.length) {
      const folder = linked.length ? evidenceFolder(card) : null;
      next = { ...next, acs, extra: folder ? { ...next.extra, [EVIDENCE_KEY]: folder } : next.extra };
      if (ticks.count) {
        changes.push(`ticked ${plural(ticks.count, "criterion", "criteria")}`);
        delta.criteria = wanted.map((c) => c.criterion).filter((_, i) => !card.acs[ticks.at[i] ?? -1]?.done);
      }
      if (linked.length) {
        changes.push(`linked ${plural(linked.length, "evidence file")}`);
        delta.evidence = linked;
      }
    }
  }
  if (input.note) {
    const line = `- ${at.slice(0, 10)} (${squash(who)}): ${input.note}`;
    next = { ...next, notes: card.notes.trim() ? `${card.notes.trim()}\n${line}` : line };
    changes.push("added a note");
    delta.note = input.note;
  }
  if (Object.keys(delta).length) {
    next = appendHistory(next, { at, field: "report", from: null, to: JSON.stringify(delta), by });
  }
  return { ok: true, card: next, changes, links };
}
