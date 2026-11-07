import type { ReactNode } from "react";
import type { ProjectMenuActions } from "../project-menu.ts";
import { PROJECT_LABELS, type ProjectsSnapshot } from "../projects.ts";
import type { WorkBridge } from "../work-list.ts";
import { ViewIcon } from "./icons.tsx";
import { WorkList } from "./work/WorkList.tsx";

export interface WorkViewProps {
  projects: ProjectsSnapshot;
  platform: string;
  actions: ProjectMenuActions;
  work: WorkBridge;
  /** The offer to set the current project up, when it needs it. */
  setupOffer?: ReactNode;
}

/** Work shows the current project's features and stories; with no project, the ways to get one. */
export function WorkView({ projects, platform, actions, work, setupOffer }: WorkViewProps) {
  if (projects.current) {
    return (
      <>
        {setupOffer}
        <WorkList key={projects.current.dir} work={work} project={projects.current} />
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
