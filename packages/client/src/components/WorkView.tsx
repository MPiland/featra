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
  /** The page that sets the current project up, shown instead of the list when it needs it (STORY-42). */
  setupPage?: ReactNode;
}

/** Work shows the current project's features and stories; with no project, the ways to get one. */
export function WorkView({ projects, platform, actions, setupPage }: WorkViewProps) {
  const view = viewDef("work");
  if (projects.current && setupPage) return setupPage;
  if (projects.current) return <ViewPlaceholder key={projects.current.dir} view={view} project={projects.current} />;
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
