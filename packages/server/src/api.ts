import {
  assertNever,
  dirParams,
  setupParams,
  type InitResult,
  type ProjectSetup,
  type ServerMethod,
  type SetupPlan,
} from "@featra/work-format";
import type { AllowedProjects } from "./allowed-projects.ts";
import type { Git } from "./git.ts";
import { initFeatra, initGit, setupStatus } from "./project-setup.ts";
import { setUpProject, setupPlan } from "./project-setup-plan.ts";

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
export type Api = (method: ServerMethod, params: unknown) => Promise<ProjectSetup | InitResult | SetupPlan>;

export function createApi({ git, allowed }: ApiDeps): Api {
  const open = (dir: string): string => {
    if (!allowed.has(dir)) throw new ApiError("Not an open project.");
    return dir;
  };
  const project = (params: unknown): string => {
    const p = dirParams(params);
    if (!p) throw new ApiError("Expected { dir }.");
    return open(p.dir);
  };
  return async (method, params) => {
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
        return setUpProject(open(p.dir), p.items, git);
      }
      default:
        return assertNever(method);
    }
  };
}
