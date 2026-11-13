/**
 * One pass over a repository: collect every copy, resolve owners, build the Work list, and record the owners in the
 * index. Indexes stay open per repository (by git common dir) until the scanner closes.
 */
import {
  buildWorkList,
  EMPTY_WORK_LIST,
  idFromFileName,
  orphans,
  readOnlyReason,
  resolveCopies,
  type OwnedCard,
  type Resolution,
  type WorkList,
} from "@featra/work-format";
import { indexFile, openCardIndex, type CardIndex } from "./card-index.ts";
import { collect, locationKey, type Collected, type GitState } from "./collect.ts";
import type { RepoGit } from "./repo-git.ts";

export interface Scan {
  collected: Collected;
  resolution: Resolution;
  list: WorkList;
}

export interface Scanner {
  /** Null when `dir` isn't a Featra project in git. With `reuse`, git isn't asked again (ADR 0016). */
  scan: (dir: string, reuse?: GitState) => Promise<Scan | null>;
  /** The Work list of `dir`: empty when it isn't a Featra project in git. */
  list: (dir: string) => Promise<WorkList>;
  /** Waits for scans in flight, then closes the indexes (a later scan opens them again). */
  close: () => Promise<void>;
}

/**
 * Whether the owner of `owned`, which has no copy of it, deleted it (STORY-58): its HEAD still has the file, so it went
 * from the working tree, or its history had it. Asked once per card and per read of git.
 */
async function deletedAtOwner(git: RepoGit, state: GitState, owned: OwnedCard, seen: Map<string, boolean>) {
  const owner = locationKey(owned.owner);
  const key = `${owner}|${owned.card.id}`;
  const known = seen.get(key);
  if (known !== undefined) return known;
  const source = state.sources.find((s) => locationKey(s.location) === owner);
  const isCard = (path: string) => idFromFileName(path.split("/").at(-1) ?? "") === owned.card.id;
  let gone = false;
  if (source && "tree" in source) {
    const head = source.tree.head;
    gone =
      [...source.inHead.keys()].some(isCard) ||
      (head !== null && (await git.hadCard(state.paths.top, head, owned.card.id)));
  } else if (source) {
    const branch = owned.owner.kind === "main" ? state.baseBranch : owned.owner.branch;
    gone = await git.hadCard(state.paths.top, `refs/heads/${branch}`, owned.card.id);
  }
  seen.set(key, gone);
  return gone;
}

export function createScanner(git: RepoGit): Scanner {
  const deletions = new WeakMap<GitState, Map<string, boolean>>();
  /** The copies resolved, leaving out the cards their owner deleted. */
  const resolve = async (collected: Collected): Promise<Resolution> => {
    const first = resolveCopies(collected.copies, collected.state);
    const lost = orphans(first);
    if (!lost.length) return first;
    const seen = deletions.get(collected.git) ?? new Map<string, boolean>();
    deletions.set(collected.git, seen);
    const gone = new Set<string>();
    for (const owned of lost) if (await deletedAtOwner(git, collected.git, owned, seen)) gone.add(owned.card.id);
    return gone.size ? resolveCopies(collected.copies, collected.state, gone) : first;
  };
  const indexes = new Map<string, CardIndex>();
  const indexOf = ({ common }: { common: string }) => {
    let index = indexes.get(common);
    if (!index) {
      index = openCardIndex(indexFile(common));
      indexes.set(common, index);
    }
    return index;
  };

  const inFlight = new Set<Promise<Scan | null>>();
  const scanNow = async (dir: string, reuse?: GitState): Promise<Scan | null> => {
    const collected = await collect(dir, { git, index: indexOf }, reuse);
    if (!collected) return null;
    const resolution = await resolve(collected);
    const { config } = collected;
    const list = buildWorkList(
      resolution,
      config,
      (owned) => readOnlyReason(owned, collected.roots.has(locationKey(owned.owner)), config.baseBranch) === null,
    );
    list.problems.unshift(...collected.problems);
    indexOf(collected.paths).setOwners(
      resolution.cards.map((c) => ({
        cardId: c.card.id,
        type: c.card.type,
        parent: c.card.parent,
        status: c.card.status,
        owner: locationKey(c.owner).replace(/\|$/, ""),
        path: c.path,
      })),
    );
    return { collected, resolution, list };
  };
  const scan = (dir: string, reuse?: GitState) => {
    const running = scanNow(dir, reuse);
    inFlight.add(running);
    void running.then(
      () => inFlight.delete(running),
      () => inFlight.delete(running),
    );
    return running;
  };

  return {
    scan,
    list: async (dir) => (await scan(dir))?.list ?? EMPTY_WORK_LIST,
    async close() {
      while (inFlight.size) await Promise.allSettled(inFlight);
      for (const index of indexes.values()) index.close();
      indexes.clear();
    },
  };
}
