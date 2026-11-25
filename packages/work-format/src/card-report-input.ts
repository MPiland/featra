/**
 * The `update_card` call's input (STORY-10), read and bounded before any rule in card-report.ts applies to it.
 */
import { parseDesignReview } from "./design-review.ts";
import type { DesignReviewInput } from "./design-review-types.ts";
import { EVIDENCE_BYTES } from "./evidence-link.ts";
import { parseId } from "./ids.ts";
import type { Parsed } from "./knowledge-log.ts";
import { pageError } from "./proof-types.ts";
import { isRecord } from "./utils/guards.ts";

/** What a call may carry, so a report stays a report: the longest text, the most ticks and new tasks, and a file's size. */
export const REPORT_LIMITS = { text: 300, note: 1000, ticks: 40, added: 20, evidenceBytes: EVIDENCE_BYTES } as const;

/**
 * A criterion to tick, with the evidence file that backs it when there is one, and the page (a route on the project's
 * dev server) Featra captures for it when the story moves to review (STORY-25).
 */
export interface CriterionReport {
  criterion: string;
  evidence?: string;
  page?: string;
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
  /** The design review of its screenshots (STORY-73): the Dev Lead's findings or clear, or the session's fix. */
  designReview?: DesignReviewInput;
}

/** Text with its whitespace collapsed, so wording compares the way a person reads it. */
export const squash = (s: string) => s.replace(/\s+/g, " ").trim();
export const same = (a: string, b: string) => squash(a).toLowerCase() === squash(b).toLowerCase();

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
    error: `"criteria" is a list of at most ${REPORT_LIMITS.ticks} items like {criterion, evidence, page}.`,
  } as const;
  if (!Array.isArray(raw) || raw.length > REPORT_LIMITS.ticks) return bad;
  const out: CriterionReport[] = [];
  for (const r of raw) {
    const criterion = isRecord(r) ? text(r.criterion, REPORT_LIMITS.text) : null;
    const evidence = isRecord(r) && r.evidence !== undefined ? text(r.evidence, REPORT_LIMITS.text) : undefined;
    if (criterion === null || evidence === null) return bad;
    const page = isRecord(r) && r.page !== undefined ? r.page : undefined;
    const why = page === undefined ? null : pageError(page);
    if (why !== null) return { ok: false, error: why };
    out.push({ criterion, ...(evidence ? { evidence } : {}), ...(typeof page === "string" ? { page } : {}) });
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
  const design = parseDesignReview(raw.designReview);
  if (!design.ok) return design;
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
    ...(design.value ? { designReview: design.value } : {}),
  };
  const { stage: s, tasks: t, addTasks: a, criteria: c, note: n, designReview: d } = value;
  return s || t || a || c || n || d
    ? { ok: true, value }
    : { ok: false, error: "Say what to update: stage, tasks, addTasks, criteria or note." };
}
