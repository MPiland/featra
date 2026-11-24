/**
 * Building a feature's review screen (STORY-69) from what the server already has: the feature's Work row (stages,
 * scope added, open bugs), each card as the card pane has it (criteria with proof and run), the diff stats git gave,
 * and the Dev Lead's summary from the feature's card. Pure; no tokens are spent on any of it.
 */
import type { CardView } from "./card-view-types.ts";
import type { FeatureApproval } from "./feature-end-copy.ts";
import { mergeCommitMessage } from "./merge.ts";
import { githubPrUrl, safeBranch } from "./prs.ts";
import type { DiffStat, FeatureReview, ReviewItem, ReviewSummary } from "./review-types.ts";
import type { FeatureRow } from "./work-list-types.ts";

/** A GitHub PR's Files changed tab; null for anything that isn't a GitHub PR's link. */
export function prFilesUrl(pr: string | null): string | null {
  const url = githubPrUrl(pr);
  return url ? `${url}/files` : null;
}

const REPO = /^[\w.-]+\/[\w.-]+$/;
/** A branch name as a URL path: each segment encoded, its slashes kept. */
const ref = (name: string) => name.split("/").map(encodeURIComponent).join("/");

/** GitHub's compare of `branch` against `base` in `repo` (`owner/name`): a branch's Files changed before it has a PR. */
export function compareUrl(repo: string | null, base: string, branch: string | null): string | null {
  if (!repo || !REPO.test(repo) || !safeBranch(base) || !safeBranch(branch)) return null;
  return `https://github.com/${repo}/compare/${ref(base)}...${ref(branch)}`;
}

export interface ReviewInputs {
  /** The feature's Work row, with each story's PR state as last read. */
  row: FeatureRow;
  feature: CardView;
  /** A story's or bug's card as the card pane has it; null when it can't be read. */
  view: (id: string) => CardView | null;
  /** What the story, bug or feature `id` changed, as git last said; null while unknown. */
  diff: (id: string) => DiffStat | null;
  summary: ReviewSummary | null;
  /** The project's GitHub repository (`owner/name`); null when it has none. */
  repo: string | null;
  base: string;
  /** Where the feature's approval stands (`featureApprovalOf`). */
  approval: FeatureApproval | null;
}

export function buildFeatureReview(inputs: ReviewInputs): FeatureReview {
  const { row, feature, view, diff, summary, repo, base, approval } = inputs;
  const items = row.stories.flatMap((s): ReviewItem[] => {
    const v = s.tone === "cancelled" ? null : view(s.id);
    if (!v) return [];
    return [{ view: v, tone: s.tone, added: s.added, diff: diff(s.id), files: prFilesUrl(v.pr) }];
  });
  return {
    feature,
    progress: row.progress,
    breakdown: row.notDone,
    scope: row.scope,
    stories: items.filter((i) => i.view.type === "story"),
    bugs: items.filter((i) => i.view.type === "bug"),
    summary,
    diff: diff(feature.id),
    files: prFilesUrl(feature.pr) ?? compareUrl(repo, base, row.branch ?? null),
    approval,
  };
}

/**
 * What `git diff --numstat` says, summed: a binary file (`-` for its lines) counts as a file with no lines. Several
 * diffs' output together (a story's merge rounds) count each file once, and every round's lines.
 */
export function parseNumstat(out: string): DiffStat {
  const stat: DiffStat = { files: 0, added: 0, removed: 0 };
  const seen = new Set<string>();
  for (const line of out.split("\n")) {
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
    if (!m) continue;
    const [, added = "-", removed = "-", path = ""] = m;
    if (!seen.has(path)) stat.files += 1;
    seen.add(path);
    stat.added += added === "-" ? 0 : Number(added);
    stat.removed += removed === "-" ? 0 : Number(removed);
  }
  return stat;
}

/** The field separator in `MERGE_LOG_FORMAT`. */
const SEP = "\u001f";
/** `git log --format` for `storyMergeIn`: each commit's parents, then its subject. */
export const MERGE_LOG_FORMAT = "%P%x1f%s";

/**
 * The two parents of each merge that brought a story into its feature, newest first, from `git log --first-parent
 * --merges` of the feature branch in `MERGE_LOG_FORMAT`: Featra's own merge (`mergeCommitMessage`, whatever the title
 * was then), its PR's merge on GitHub ("Merge pull request #12 from …"), or git's ("Merge branch 'story-9'"). A story
 * merged, sent back and merged again has a merge for each round; none when it has none.
 */
export function storyMergesIn(
  log: string,
  story: { id: string; pr: string | null; branch: string | null },
): [string, string][] {
  const pr = /\/pull\/(\d+)$/.exec(story.pr ?? "")?.[1];
  const featra = mergeCommitMessage({ id: story.id, title: "" });
  const ours = (subject: string) =>
    subject.startsWith(featra) ||
    (pr !== undefined && subject.startsWith(`Merge pull request #${pr} from `)) ||
    (story.branch !== null && subject.startsWith(`Merge branch '${story.branch}'`));
  return log.split("\n").flatMap((line): [string, string][] => {
    const [parents = "", subject = ""] = line.split(SEP);
    const [first, second] = parents.trim().split(" ");
    return first && second && ours(subject) ? [[first, second]] : [];
  });
}
