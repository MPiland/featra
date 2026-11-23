/**
 * A feature's review screen (STORY-69): the whole feature on one screen, built from its cards and git at no token cost.
 * Each story and bug with its user story, stage, criteria and the proof behind each (with the run that proved it), the
 * scope added since the feature started, the files and lines each changed, links to GitHub's Files changed, the
 * feature's own checks, and the Dev Lead's summary when it wrote one. Types, copy and the check for data that crosses
 * the socket only, so the client can import it without the card parser.
 */
import { LOCAL_RUN, normalizeCardView, type CardView } from "./card-view-types.ts";
import { normalizeFeatureApproval, type FeatureApproval } from "./feature-end-copy.ts";
import { httpsLink } from "./prs-types.ts";
import { isOneOf, isRecord } from "./utils/guards.ts";
import { TONES, type ProgressCount, type Tone } from "./work-list-types.ts";

/** Files and lines a change touched, from `git diff --numstat`; a binary file counts as a file with no lines. */
export interface DiffStat {
  files: number;
  added: number;
  removed: number;
}

/** A story or bug on the review screen. */
export interface ReviewItem {
  /** Its card as the card pane has it: the user story, stage, criteria with proof and run, and its PR. */
  view: CardView;
  tone: Tone;
  /** Added after the feature's scope baseline. */
  added: boolean;
  /** What it changed: its branch against the feature's, or its merge into it; null while unknown. */
  diff: DiffStat | null;
  /** Its PR's Files changed on GitHub; null without a PR there. */
  files: string | null;
}

/** The Dev Lead's summary (`write_summary`), with when it last wrote it. */
export interface ReviewSummary {
  text: string;
  at: string | null;
}

export interface FeatureReview {
  /** The feature's card: its checks and PR (once accepted) and Accept and Merge, as the card pane has them. */
  feature: CardView;
  progress: ProgressCount;
  /** Its items not done yet, by stage, beside `progress` which counts the done ones: "2 in progress"; empty with none. */
  breakdown: string;
  /** Added after the scope baseline ("+3 added: 2 stories · 1 bug", empty when none), and open bugs. */
  scope: { added: number; addedBreakdown: string; openBugs: number };
  stories: ReviewItem[];
  bugs: ReviewItem[];
  /** Null when the Dev Lead wrote none: the screen shows no Summary heading then. */
  summary: ReviewSummary | null;
  /** The whole feature against its base; null while unknown. */
  diff: DiffStat | null;
  /** The feature's Files changed on GitHub: its PR's, else a compare against the base; null when not on GitHub. */
  files: string | null;
  /** Approve, Merge to main again, or Merged (STORY-70); null for a feature not in progress nor merged. */
  approval: FeatureApproval | null;
}

export const REVIEW_COPY = {
  review: "Review",
  reviewOf: (id: string) => `Review ${id}`,
  back: "Back",
  title: (id: string, title: string) => `Review ${id}: ${title}`,
  summary: "Summary",
  byLead: "Written by the Dev Lead",
  stories: "Stories",
  bugs: "Bugs",
  noStories: "No stories yet",
  checks: "Checks",
  filesChanged: "Files changed",
  localRun: "Local run",
  ciRun: "CI run",
  added: "Added",
  loading: "Loading…",
  gone: "This feature isn't in progress.",
  diff: (d: DiffStat) => `${d.files} ${d.files === 1 ? "file" : "files"} · +${d.added} −${d.removed}`,
  noDiff: "No changes yet",
  openBugs: (n: number) => `${n} open ${n === 1 ? "bug" : "bugs"}`,
} as const;

/** What a proving run reads as: "Local run", or "CI run" linking to it. */
export const runLabel = (run: string): string => (run === LOCAL_RUN ? REVIEW_COPY.localRun : REVIEW_COPY.ciRun);

// Checks for the client: the review crosses the socket, so every field is read defensively.
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const text = (v: unknown) => (typeof v === "string" ? v : "");
const link = (v: unknown) => httpsLink(v);

const diffOf = (raw: unknown): DiffStat | null =>
  isRecord(raw) ? { files: num(raw.files), added: num(raw.added), removed: num(raw.removed) } : null;

const itemOf = (raw: unknown): ReviewItem | null => {
  if (!isRecord(raw)) return null;
  const view = normalizeCardView(raw.view);
  if (!view) return null;
  return {
    view,
    tone: isOneOf(TONES, raw.tone) ? raw.tone : "idle",
    added: raw.added === true,
    diff: diffOf(raw.diff),
    files: link(raw.files),
  };
};

const items = (raw: unknown): ReviewItem[] =>
  Array.isArray(raw) ? raw.map(itemOf).filter((i): i is ReviewItem => i !== null) : [];

export function normalizeFeatureReview(raw: unknown): FeatureReview | null {
  if (!isRecord(raw)) return null;
  const feature = normalizeCardView(raw.feature);
  if (!feature) return null;
  const p = isRecord(raw.progress) ? raw.progress : {};
  const scope = isRecord(raw.scope) ? raw.scope : {};
  const summary = isRecord(raw.summary) && text(raw.summary.text).trim() ? raw.summary : null;
  return {
    feature,
    progress: { done: num(p.done), total: num(p.total), label: text(p.label) },
    breakdown: text(raw.breakdown),
    scope: { added: num(scope.added), addedBreakdown: text(scope.addedBreakdown), openBugs: num(scope.openBugs) },
    stories: items(raw.stories),
    bugs: items(raw.bugs),
    summary: summary ? { text: text(summary.text), at: typeof summary.at === "string" ? summary.at : null } : null,
    diff: diffOf(raw.diff),
    files: link(raw.files),
    approval: normalizeFeatureApproval(raw.approval),
  };
}
