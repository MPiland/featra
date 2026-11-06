import type { ReactNode } from "react";
import type { ProjectMenuActions } from "../project-menu.ts";
import { PROJECT_LABELS, type ProjectsSnapshot } from "../projects.ts";
import { viewDef } from "../views.ts";
import { ViewIcon } from "./icons.tsx";
import { ViewPlaceholder } from "./ViewPlaceholder.tsx";

export interface WorkViewProps {
  projects: ProjectsSnapshot;
  platform: string;
  actions: ProjectMenuActions;
  /** The offer to set the current project up, when it needs it. */
  setupOffer?: ReactNode;
}

/** Work shows the current project's features and stories; with no project, the ways to get one. */
export function WorkView({ projects, platform, actions, setupOffer }: WorkViewProps) {
  const view = viewDef("work");
  if (projects.current) {
    return (
      <>
        {setupOffer}
        <ViewPlaceholder key={projects.current.dir} view={view} project={projects.current} />
      </>
    );
  }
  return (
    <section className="placeholder" data-view="work">
      <ViewIcon view="work" size={28} />
      <p>No project is open.</p>
      {platform !== "web" && (
        <div className="placeholder-actions">
          <button type="button" className="btn" onClick={actions.newProject}>
            {PROJECT_LABELS.newProject}
          </button>
          <button type="button" className="btn" onClick={actions.openFolder}>
            {PROJECT_LABELS.openFolder}
          </button>
        </div>
      )}
    </section>
  );
}
