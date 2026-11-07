import {
  assertNever,
  copyParams,
  dirParams,
  setupParams,
  unwatchParams,
  type PushEvent,
  type ServerMethod,
  type ServerMethods,
  type ServerPushes,
} from "@featra/work-format";
import type { AllowedProjects } from "./allowed-projects.ts";
import type { CopyActions } from "./copy-actions.ts";
import type { Git } from "./git.ts";
import { initFeatra, initGit, setupStatus } from "./project-setup.ts";
import { setUpProject, setupPlan } from "./project-setup-plan.ts";
import type { WorkWatches } from "./work-watch.ts";

/** A request the server refuses: its message goes back to the client as the response's `error`. */
export class ApiError extends Error {}

export interface ApiDeps {
  git: Git;
  allowed: AllowedProjects;
  watches: WorkWatches;
  copies: CopyActions;
}

/** The socket a request came in on: how a watch pushes to it and ends with it. */
export interface Connection {
  push: <E extends PushEvent>(event: E, watch: number, data: ServerPushes[E]) => void;
  /** Keeps `stop` until `unwatch(id)` or the socket closes, which calls it. */
  keep: (id: number, stop: () => void) => void;
  /** Stops and forgets the watch `id`; false when there is none. */
  unwatch: (id: number) => boolean;
}

/**
 * Answers one request with that method's result (see `ServerMethods`). Params come from the socket and are checked
 * here; a refused request throws an ApiError. `id` is the request's id, which names a watch.
 */
export type Api = (
  method: ServerMethod,
  params: unknown,
  id: number,
  connection: Connection,
) => Promise<ServerMethods[ServerMethod]["result"]>;

export function createApi({ git, allowed, watches, copies }: ApiDeps): Api {
  const allow = (dir: string) => {
    if (!allowed.has(dir)) throw new ApiError("Not an open project.");
    return dir;
  };
  const project = (params: unknown): string => {
    const p = dirParams(params);
    if (!p) throw new ApiError("Expected { dir }.");
    return allow(p.dir);
  };
  const copy = (params: unknown) => {
    const p = copyParams(params);
    if (!p) throw new ApiError("Expected { dir, key }.");
    allow(p.dir);
    return p;
  };

  return async (method, params, id, connection) => {
    switch (method) {
      case "project.setupStatus":
        return setupStatus(project(params), git);
      case "project.gitInit":
        return initGit(project(params), git);
      case "project.init":
        return initFeatra(project(params), git);
      case "project.setupPlan":
        return setupPlan(project(params), git);
      case "project.setup": {
        const p = setupParams(params);
        if (!p) throw new ApiError("Expected { dir, items }.");
        return setUpProject(allow(p.dir), p.items, git);
      }
      case "work.watch": {
        const dir = project(params);
        const { list, stop } = await watches.watch(dir, (next) => {
          // A project closed since: say nothing more about it.
          if (allowed.has(dir)) connection.push("work.list", id, next);
        });
        connection.keep(id, stop);
        return list;
      }
      case "work.unwatch": {
        const p = unwatchParams(params);
        if (!p) throw new ApiError("Expected { watch }.");
        connection.unwatch(p.watch);
        return null;
      }
      case "work.applyCopy": {
        const p = copy(params);
        const result = await copies.apply(p.dir, p.key);
        await watches.refresh(p.dir);
        return result;
      }
      case "work.discardCopy": {
        const p = copy(params);
        const result = await copies.discard(p.dir, p.key);
        await watches.refresh(p.dir);
        return result;
      }
      default:
        return assertNever(method);
    }
  };
}
