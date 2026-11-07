/**
 * One pass over a repository: collect every copy, resolve owners, build the Work list, and record the owners in the
 * index. Indexes stay open per repository (by git common dir) until the scanner closes.
 */
import { buildWorkList, EMPTY_WORK_LIST, resolveCopies, type Resolution, type WorkList } from "@featra/work-format";
import { indexFile, openCardIndex, type CardIndex } from "./card-index.ts";
import { collect, locationKey, type Collected } from "./collect.ts";
import type { RepoGit } from "./repo-git.ts";

export interface Scan {
  collected: Collected;
  resolution: Resolution;
  list: WorkList;
}

export interface Scanner {
  /** Null when `dir` isn't a Featra project in git. */
  scan: (dir: string) => Promise<Scan | null>;
  /** The Work list of `dir`: empty when it isn't a Featra project in git. */
  list: (dir: string) => Promise<WorkList>;
  /** Waits for scans in flight, then closes the indexes (a later scan opens them again). */
  close: () => Promise<void>;
}

export function createScanner(git: RepoGit): Scanner {
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
  const scanNow = async (dir: string): Promise<Scan | null> => {
    const collected = await collect(dir, { git, index: indexOf });
    if (!collected) return null;
    const resolution = resolveCopies(collected.copies, collected.state);
    const list = buildWorkList(resolution, collected.config);
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
  const scan = (dir: string) => {
    const running = scanNow(dir);
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
