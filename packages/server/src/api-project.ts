/**
 * The local API's project setup methods (STORY-19, STORY-27): what a folder needs to be a Featra project, and setting it
 * up, from git init to Featra init and the knowledge files the user picks.
 */
import { setupParams } from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import type { Git } from "./git.ts";
import { initFeatra, initGit, setupStatus } from "./project-setup.ts";
import { setUpProject, setupPlan } from "./project-setup-plan.ts";

export interface ProjectApiDeps {
  git: Git;
  /** The project folder, once it is known to be open; throws otherwise. */
  allow: (dir: string) => string;
  /** The open project `{ dir }` names; throws otherwise. */
  project: (params: unknown) => string;
}

export type ProjectMethod =
  | "project.setupStatus"
  | "project.gitInit"
  | "project.init"
  | "project.setupPlan"
  | "project.setup";

export function createProjectApi({ git, allow, project }: ProjectApiDeps) {
  return async (method: ProjectMethod, params: unknown) => {
    if (method === "project.setupStatus") return setupStatus(project(params), git);
    if (method === "project.gitInit") return initGit(project(params), git);
    if (method === "project.init") return initFeatra(project(params), git);
    if (method === "project.setupPlan") return setupPlan(project(params), git);
    const p = setupParams(params);
    if (!p) throw new ApiError("Expected { dir, items }.");
    return setUpProject(allow(p.dir), p.items, git);
  };
}
