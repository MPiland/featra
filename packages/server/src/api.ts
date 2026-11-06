import { assertNever, dirParams, type ProjectSetup, type InitResult, type ServerMethod } from "@featra/work-format";
import type { AllowedProjects } from "./allowed-projects.ts";
import type { Git } from "./git.ts";
import { initFeatra, initGit, setupStatus } from "./project-setup.ts";

/** A request the server refuses: its message goes back to the client as the response's `error`. */
export class ApiError extends Error {}

export interface ApiDeps {
  git: Git;
  allowed: AllowedProjects;
}

/**
 * Answers one request with that method's result (see `ServerMethods`). Params come from the socket and are checked
 * here; a refused request throws an ApiError.
 */
export type Api = (method: ServerMethod, params: unknown) => Promise<ProjectSetup | InitResult>;

export function createApi({ git, allowed }: ApiDeps): Api {
  const project = (params: unknown): string => {
    const p = dirParams(params);
    if (!p) throw new ApiError("Expected { dir }.");
    if (!allowed.has(p.dir)) throw new ApiError("Not an open project.");
    return p.dir;
  };
  return async (method, params) => {
    switch (method) {
      case "project.setupStatus":
        return setupStatus(project(params), git);
      case "project.gitInit":
        return initGit(project(params), git);
      case "project.init":
        return initFeatra(project(params), git);
      default:
        return assertNever(method);
    }
  };
}
