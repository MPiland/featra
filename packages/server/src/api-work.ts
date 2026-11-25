/** The local API's Work methods: watch a project's work list, stop a watch, and apply or discard a file's copy. */
import { copyParams, unwatchParams } from "@featra/work-format";
import type { AllowedProjects } from "./allowed-projects.ts";
import type { Connection } from "./api.ts";
import { ApiError } from "./api-error.ts";
import type { CopyActions } from "./copy-actions.ts";
import type { StoryPrs } from "./story-prs.ts";
import type { WorkWatches } from "./work-watch.ts";

export type WorkMethod = "work.watch" | "work.unwatch" | "work.applyCopy" | "work.discardCopy";

export interface WorkApiDeps {
  watches: WorkWatches;
  allowed: AllowedProjects;
  copies: CopyActions;
  prs: Pick<StoryPrs, "decorate">;
  /** The folder if it is an open project; throws otherwise. */
  allow: (dir: string) => string;
  /** The open project a request's `{ dir }` names; throws otherwise. */
  project: (params: unknown) => string;
}

export function createWorkApi({ watches, allowed, copies, prs, allow, project }: WorkApiDeps) {
  return async (method: WorkMethod, params: unknown, id: number, connection: Connection) => {
    if (method === "work.watch") {
      const dir = project(params);
      // The rows carry each story's PR state as last read (STORY-11), which a new read changes without a file event.
      const { value, stop } = await watches.observe(
        dir,
        (_scan, list) => prs.decorate(dir, list),
        (next) => {
          // A project closed since: say nothing more about it.
          if (allowed.has(dir)) connection.push("work.list", id, next);
        },
      );
      connection.keep(id, stop);
      return value;
    }
    if (method === "work.unwatch") {
      const p = unwatchParams(params);
      if (!p) throw new ApiError("Expected { watch }.");
      connection.unwatch(p.watch);
      return null;
    }
    const p = copyParams(params);
    if (!p) throw new ApiError("Expected { dir, key }.");
    allow(p.dir);
    return method === "work.applyCopy" ? copies.apply(p.dir, p.key) : copies.discard(p.dir, p.key);
  };
}
