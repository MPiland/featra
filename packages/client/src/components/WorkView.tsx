import type { ReactNode } from "react";
import type { ChatSummary } from "@featra/work-format";
import type { ProjectMenuActions } from "../project-menu.ts";
import { PROJECT_LABELS, type ProjectsSnapshot } from "../projects.ts";
import type { WorkBridge } from "../work-list.ts";
import type { WorkLayout } from "../work-layout.ts";
import type { ChosenWidth } from "./work/PaneHandle.tsx";
import { ViewIcon } from "./icons.tsx";
import { WorkList } from "./work/WorkList.tsx";

export interface WorkViewProps {
  projects: ProjectsSnapshot;
  platform: string;
  actions: ProjectMenuActions;
  work: WorkBridge;
  paneWidth: ChosenWidth;
  /** Each project's list or board, and how the header's toggle chooses it (STORY-17). */
  layout: { of: (dir: string) => WorkLayout; choose: (dir: string, layout: WorkLayout) => void };
  /** Opens the chat that drafted a feature, with the draft pane (STORY-49). */
  onReviewDraft: (chat: string) => void;
  /** Whether the project has that chat (a draft's chat may have been deleted). */
  hasChat: (chat: string) => boolean;
  /** The project's chats and how to open one, for a story row's Start, Queued and session link (STORY-9). */
  chats?: readonly ChatSummary[];
  onOpenChat?: (chat: string) => void;
  /** The page that sets the current project up, shown instead of the list when it needs it (STORY-42). */
  setupPage?: ReactNode;
}

/** Work shows the current project's features and stories; with no project, the ways to get one. */
export function WorkView({
  projects,
  platform,
  actions,
  work,
  paneWidth,
  layout,
  onReviewDraft,
  hasChat,
  chats,
  onOpenChat,
  setupPage,
}: WorkViewProps) {
  if (projects.current && setupPage) return setupPage;
  const project = projects.current;
  if (project)
    return (
      <WorkList
        key={project.dir}
        work={work}
        project={project}
        paneWidth={paneWidth}
        layout={layout.of(project.dir)}
        onLayout={(chosen) => layout.choose(project.dir, chosen)}
        onReviewDraft={onReviewDraft}
        hasChat={hasChat}
        chats={chats}
        onOpenChat={onOpenChat}
      />
    );
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
