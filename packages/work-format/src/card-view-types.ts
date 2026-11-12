/**
 * The card pane's shapes (ADR 0017): a card as the pane shows it, and the one-field edits the pane sends. Types and
 * the checks for data that crosses the socket only, so the client can import it without the card parser.
 */
import { isOneOf, isRecord } from "./utils/guards.ts";

/** What is known about an AC's proof: its linked test passed, a test is linked but hasn't passed, or none is. */
export type AcProof = "passed" | "linked" | "none";
const AC_PROOFS: readonly AcProof[] = ["passed", "linked", "none"];

export interface CardViewAc {
  text: string;
  done: boolean;
  test: string | null;
  proof: AcProof;
}

export interface CardViewTask {
  text: string;
  done: boolean;
}

/** A status or parent the card can be moved to, with how it reads. */
export interface CardOption {
  value: string | null;
  label: string;
}

/** The evidence marks (ADR 0004). */
export interface CardEvidence {
  reported: boolean;
  verified: boolean;
  proven: boolean;
  accepted: boolean;
}

/** A story under a feature: what the pane lists so each can be opened. */
export interface CardChild {
  id: string;
  title: string;
  status: string;
}

export interface CardView {
  id: string;
  type: "epic" | "feature" | "story" | "bug";
  title: string;
  status: string;
  /** The statuses the rules allow from here, in workflow order, with the current one. */
  statusOptions: CardOption[];
  parent: string | null;
  /** The parents the card can move under; empty when it has none to choose from. */
  parentOptions: CardOption[];
  /** The user story. */
  description: string;
  evidence: CardEvidence;
  acs: CardViewAc[];
  tasks: CardViewTask[];
  notes: string;
  pr: string | null;
  /** A feature's stories, in order, without the Cancelled ones; empty for any other card. */
  stories: CardChild[];
  /** Where the card is read from and written to, as a label. */
  owner: string;
  /** The chat that drafted this feature, while the draft waits on review; absent otherwise (STORY-50 Send back). */
  draftChat?: string;
  /** With `draftChat`: every story under the draft, Cancelled ones too. Reject deletes all of them (STORY-51). */
  draftStories?: number;
  /** True on an approved feature, which Start can give its branch (STORY-52); absent otherwise. */
  startable?: true;
  /** Why the card can't be edited here, or null when it can. */
  readOnly: string | null;
}

/** How an epic's or feature's status reads. */
export const CONTAINER_STATUS_LABELS: Readonly<Record<string, string>> = {
  draft: "Draft",
  approved: "Approved",
  active: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

/** Fields edited as text: the whole field, or one AC or task by its index. */
export type CardTextField = "title" | "description" | "notes";
export type CardItemField = "ac" | "task";

/**
 * One change from the pane. `from` is the value the pane showed: when the owner's copy has another value now, the
 * edit is refused rather than written over it.
 */
export type CardEdit =
  | { field: CardTextField; from: string; to: string }
  | { field: CardItemField; index: number; from: string; to: string }
  | { field: "status"; from: string; to: string }
  | { field: "parent"; from: string | null; to: string | null };

export type CardUpdateResult = { ok: true; view: CardView } | { ok: false; error: string; view: CardView | null };

const TEXT_FIELDS: readonly CardTextField[] = ["title", "description", "notes"];
const ITEM_FIELDS: readonly CardItemField[] = ["ac", "task"];
const TYPES: readonly CardView["type"][] = ["epic", "feature", "story", "bug"];

const text = (v: unknown) => (typeof v === "string" ? v : "");
const textOrNull = (v: unknown) => (typeof v === "string" ? v : null);
const isText = (v: unknown): v is string => typeof v === "string";
const isTextOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";
const isIndex = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const list = <T>(raw: unknown, item: (r: Record<string, unknown>) => T): T[] =>
  Array.isArray(raw) ? raw.filter(isRecord).map(item) : [];

/** A `CardEdit` read from the socket, or null when it isn't one. */
export function parseCardEdit(raw: unknown): CardEdit | null {
  if (!isRecord(raw)) return null;
  const { field, from, to } = raw;
  if (isOneOf(TEXT_FIELDS, field) && isText(from) && isText(to)) return { field, from, to };
  if (isOneOf(ITEM_FIELDS, field) && isIndex(raw.index) && isText(from) && isText(to))
    return { field, index: raw.index, from, to };
  if (field === "status" && isText(from) && isText(to)) return { field, from, to };
  if (field === "parent" && isTextOrNull(from) && isTextOrNull(to)) return { field, from, to };
  return null;
}

/** The `{ dir, id }` params of `card.watch`, or null. */
export function cardParams(params: unknown): { dir: string; id: string } | null {
  if (!isRecord(params) || typeof params.dir !== "string" || !params.dir) return null;
  return typeof params.id === "string" && params.id ? { dir: params.dir, id: params.id } : null;
}

/** The `{ dir, id, edit }` params of `card.update`, or null. */
export function cardUpdateParams(params: unknown): { dir: string; id: string; edit: CardEdit } | null {
  const p = cardParams(params);
  const edit = isRecord(params) ? parseCardEdit(params.edit) : null;
  return p && edit ? { ...p, edit } : null;
}

/** The `{ dir, id, reason }` params of `draft.sendBack`, or null. An empty reason is the method's to refuse. */
export function sendBackParams(params: unknown): { dir: string; id: string; reason: string } | null {
  const p = cardParams(params);
  return p && isRecord(params) && typeof params.reason === "string" ? { ...p, reason: params.reason } : null;
}

const option = (r: Record<string, unknown>): CardOption => ({ value: textOrNull(r.value), label: text(r.label) });

/** A view from the socket, read defensively; null when there is no card. */
export function normalizeCardView(raw: unknown): CardView | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  const ev = isRecord(raw.evidence) ? raw.evidence : {};
  return {
    id: raw.id,
    type: isOneOf(TYPES, raw.type) ? raw.type : "story",
    title: text(raw.title),
    status: text(raw.status),
    statusOptions: list(raw.statusOptions, option),
    parent: textOrNull(raw.parent),
    parentOptions: list(raw.parentOptions, option),
    description: text(raw.description),
    evidence: {
      reported: ev.reported === true,
      verified: ev.verified === true,
      proven: ev.proven === true,
      accepted: ev.accepted === true,
    },
    acs: list(raw.acs, (a) => ({
      text: text(a.text),
      done: a.done === true,
      test: textOrNull(a.test),
      proof: isOneOf(AC_PROOFS, a.proof) ? a.proof : "none",
    })),
    tasks: list(raw.tasks, (t) => ({ text: text(t.text), done: t.done === true })),
    notes: text(raw.notes),
    pr: textOrNull(raw.pr),
    stories: list(raw.stories, (s) => ({ id: text(s.id), title: text(s.title), status: text(s.status) })),
    owner: text(raw.owner),
    readOnly: textOrNull(raw.readOnly),
    ...(typeof raw.draftChat === "string" && raw.draftChat ? { draftChat: raw.draftChat } : {}),
    ...(typeof raw.draftStories === "number" ? { draftStories: raw.draftStories } : {}),
    ...(raw.startable === true ? { startable: true as const } : {}),
  };
}

export function normalizeCardUpdateResult(raw: unknown): CardUpdateResult {
  const r = isRecord(raw) ? raw : {};
  const view = normalizeCardView(r.view);
  if (r.ok === true && view) return { ok: true, view };
  return { ok: false, error: typeof r.error === "string" && r.error ? r.error : "Something went wrong.", view };
}
