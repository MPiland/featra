/**
 * What abandoning a story says (STORY-58), and the warning the user confirms, kept apart from the rules so the client
 * reads them without them. Short, sentence case.
 */
import { fileList } from "./merge-copy.ts";
import { isRecord } from "./utils/guards.ts";

/** What Abandon would lose or change, as the user is warned before confirming it. */
export interface AbandonWarning {
  /** Uncommitted and untracked files in the story's worktree, its own card left out. */
  files: string[];
  /** Commits on the story's branch that no remote and no feature branch has, as `<short commit> <subject>`. */
  unpushed: string[];
  /** The open PR that Abandon closes, as its URL; null when there is none. */
  pr: string | null;
  /** The story's branch, removed here and from `remotes`; null when it has none. */
  branch: string | null;
  /** The remotes whose copy of the branch is deleted. */
  remotes: string[];
  /** What the warning was made from. Abandon goes ahead only while the story still matches it. */
  token: string;
}

/** Whether the warning names anything that would be lost or closed, so it needs more than a plain question. */
export const atRisk = (w: AbandonWarning): boolean => w.files.length > 0 || w.unpushed.length > 0 || w.pr !== null;

/** `#12` for a PR's URL, else the URL. */
const prLabel = (url: string) => {
  const n = /\/pull\/(\d+)$/.exec(url)?.[1];
  return n ? `#${n}` : url;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const ABANDON_COPY = {
  abandon: "Abandon",
  abandonOf: (id: string) => `Abandon ${id}`,
  checking: "Checking…",
  abandoning: "Abandoning…",
  ask: (id: string) => `Abandon ${id}?`,
  /** The lead-in to what would be lost. */
  loses: "This can't be undone:",
  files: (files: readonly string[]) =>
    `${plural(files.length, "uncommitted file", "uncommitted files")}: ${fileList(files)}`,
  unpushed: (commits: readonly string[]) =>
    `${plural(commits.length, "commit", "commits")} not pushed: ${fileList(commits)}`,
  pr: (url: string) => `PR ${prLabel(url)} is closed`,
  /** What always goes: the worktree and the branch, here and on the remotes that have it. */
  removes: (branch: string, remotes: readonly string[]) =>
    remotes.length > 0
      ? `Its worktree and the branch ${branch} are removed, here and on ${remotes.join(", ")}.`
      : `Its worktree and the branch ${branch} are removed.`,
  /** A story that has no branch yet: only its card changes. */
  cardOnly: "Only its card changes.",
  keep: "Keep as Cancelled",
  discard: "Discard card",
  cancel: "Cancel",
} as const;

/** The lines of the warning, in order: what would be lost, then what always goes. */
export function warningLines(w: AbandonWarning): { risks: string[]; removes: string } {
  const risks = [
    ...(w.files.length > 0 ? [ABANDON_COPY.files(w.files)] : []),
    ...(w.unpushed.length > 0 ? [ABANDON_COPY.unpushed(w.unpushed)] : []),
    ...(w.pr !== null ? [ABANDON_COPY.pr(w.pr)] : []),
  ];
  return { risks, removes: w.branch === null ? ABANDON_COPY.cardOnly : ABANDON_COPY.removes(w.branch, w.remotes) };
}

const texts = (raw: unknown): string[] | null =>
  Array.isArray(raw) && raw.every((x) => typeof x === "string") ? raw : null;

/** A warning as the server sent it, or null when it isn't one. */
export function normalizeAbandonWarning(raw: unknown): AbandonWarning | null {
  if (!isRecord(raw)) return null;
  const files = texts(raw.files);
  const unpushed = texts(raw.unpushed);
  const remotes = texts(raw.remotes);
  const pr = typeof raw.pr === "string" ? raw.pr : null;
  const branch = typeof raw.branch === "string" ? raw.branch : null;
  if (!files || !unpushed || !remotes || typeof raw.token !== "string") return null;
  return { files, unpushed, pr, branch, remotes, token: raw.token };
}

/** `story.abandon`'s params: the story, whether its card is kept as Cancelled, and the warning's token. */
export function abandonParams(params: unknown): { dir: string; id: string; keep: boolean; token: string } | null {
  if (!isRecord(params)) return null;
  const { dir, id, keep, token } = params;
  if (typeof dir !== "string" || typeof id !== "string" || typeof keep !== "boolean" || typeof token !== "string") {
    return null;
  }
  return { dir, id, keep, token };
}
