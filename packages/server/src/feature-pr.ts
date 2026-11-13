/**
 * An accepted feature's PR to the base branch (STORY-14, ADR 0037), through the same `gh` and git steps a story's PR
 * takes (github-prs.ts): the feature branch is pushed, never forced, and its open PR into the base is adopted or one is
 * opened. The PR is recorded on the feature's card by `system`. Why a try failed shows on the card, and Create PR
 * tries again.
 */
import { GITHUB_COPY, prContent, serializeCard, setPr, toIso, type CardPr, type PrStatus } from "@featra/work-format";
import { githubRemote } from "./github-detect.ts";
import { createPr, openPrFor, pushStory, readPrAt, PR_NOTES, type FoundPr, type GithubPrDeps } from "./github-prs.ts";
import type { CardLane } from "./card-lane.ts";
import { lookAt, writeFeature, type FeatureLook } from "./feature-look.ts";
import type { MergeGit } from "./merge-git.ts";
import type { Scan } from "./work-scan.ts";

export interface FeaturePrDeps extends GithubPrDeps {
  scan: (dir: string) => Promise<Scan | null>;
  git: MergeGit;
  lane: CardLane;
  now: () => Date;
}

/** What the card pane needs of a feature to show its PR. */
export interface PrShown {
  accepted: boolean;
  pr: string | null;
  usable: boolean;
}

const keyOf = (dir: string, id: string) => `${dir}\0${id}`;

export const prMessage = (id: string) => `${id}: PR opened`;

export function createFeaturePrs(deps: FeaturePrDeps) {
  const { scan: scanDir, git, lane, now } = deps;
  const read = new Map<string, { url: string; status: PrStatus; head: string | null }>();
  const notes = new Map<string, string>();
  const opening = new Set<string>();

  /** Pushes the feature's branch, never forced, and adopts or opens its PR into the base; the PR, or why not. */
  async function openFor(dir: string, look: FeatureLook): Promise<FoundPr | string> {
    const remote = await githubRemote(dir, deps.gitCommand);
    if (!remote) return GITHUB_COPY.noRemote;
    const pushed = await pushStory(look.top, remote, look.base, look.branch, deps);
    if (pushed !== null) return pushed;
    const pr =
      (await openPrFor(dir, { head: look.branch, base: look.base, repo: remote.repo }, deps)) ??
      (await createPr(dir, { base: look.base, head: look.branch, ...prContent(look.card) }, deps));
    if (typeof pr !== "string") read.set(keyOf(dir, look.card.id), { url: pr.url, status: pr.status, head: pr.head });
    return pr;
  }

  /** Opens feature `id`'s PR as `look` has it, showing Opening meanwhile; its URL, or null with why on the card. */
  async function open(dir: string, look: FeatureLook): Promise<string | null> {
    const key = keyOf(dir, look.card.id);
    opening.add(key);
    notes.delete(key);
    let pr: FoundPr | string;
    try {
      pr = await openFor(dir, look);
    } catch (err) {
      pr = `${PR_NOTES.open}: ${err instanceof Error ? err.message : String(err)}`;
    }
    opening.delete(key);
    if (typeof pr === "string") notes.set(key, pr);
    return typeof pr === "string" ? null : pr.url;
  }

  /** Records `url` as feature `id`'s PR, read fresh in the lane, unless it has another one: that one stands. */
  const record = (dir: string, id: string, url: string) =>
    lane.exclusive(async () => {
      const look = await lookAt(git, await scanDir(dir), id);
      if (!look || (look.card.pr && look.card.pr !== url)) return;
      const next = setPr(look.card, url, "system", toIso(now()));
      if (next !== look.card) await writeFeature(git, look, serializeCard(next), prMessage(id));
    });

  /** The PR at `url` as GitHub has it now, kept for the card; null when `gh` couldn't read it. */
  async function readNow(dir: string, id: string, url: string): Promise<FoundPr | null> {
    const pr = await readPrAt(dir, url, deps);
    if (pr) read.set(keyOf(dir, id), { url, status: pr.status, head: pr.head });
    return pr;
  }

  return {
    open,
    record,
    readNow,

    /** Why the last try to open feature `id`'s PR failed, else null. */
    noteOf: (dir: string, id: string) => notes.get(keyOf(dir, id)) ?? null,

    /** What the card pane shows of feature `id`'s PR: its state, Create PR, Opening, or why it couldn't open. */
    state(dir: string, id: string, shown: PrShown): CardPr | undefined {
      const key = keyOf(dir, id);
      const last = read.get(key);
      const status = shown.pr && last?.url === shown.pr ? last.status : null;
      const isOpening = opening.has(key);
      const create = shown.usable && shown.accepted && !shown.pr && !isOpening;
      const note = shown.pr ? null : (notes.get(key) ?? null);
      if (!status && !create && !isOpening && !note) return undefined;
      return { status, create, opening: isOpening, note };
    },

    forget(dir: string) {
      for (const map of [read, notes])
        for (const key of map.keys()) if (key.startsWith(keyOf(dir, ""))) map.delete(key);
    },
  };
}

export type FeaturePrs = ReturnType<typeof createFeaturePrs>;
