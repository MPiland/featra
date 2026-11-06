import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { FeatraBridge } from "../bridge.ts";
import type { ProjectMenuActions } from "../project-menu.ts";
import type { ProjectsResult, ProjectsSnapshot } from "../projects.ts";
import { Dialog } from "./Dialog.tsx";
import { NewProjectDialog } from "./NewProjectDialog.tsx";

type ProjectDialog = { kind: "new" } | { kind: "error"; message: string } | null;

export interface Projects {
  projects: ProjectsSnapshot;
  /** What the switcher and the File menu do. */
  actions: ProjectMenuActions;
  /** The New Project dialog, or why a switch or an open failed. */
  dialog: ReactNode;
}

/**
 * The project list as the window sees it: the host's answer to the last switch, open or create. A browser tab has no
 * folders, so New Project… and Open Folder… do nothing there (the menus leave them out too).
 */
export function useProjects(bridge: FeatraBridge, initial: ProjectsSnapshot, projectSettings: () => void): Projects {
  const [projects, setProjects] = useState(initial);
  const [dialog, setDialog] = useState<ProjectDialog>(null);
  const close = useCallback(() => setDialog(null), []);
  const folders = bridge.platform !== "web";

  const actions: ProjectMenuActions = useMemo(() => {
    const apply = (result: ProjectsResult | null) => {
      if (!result) return;
      if (result.ok) setProjects(result.projects);
      else setDialog({ kind: "error", message: result.error });
    };
    return {
      switchTo: (dir) => void bridge.projects.switchTo(dir).then(apply),
      openFolder: () => {
        if (folders) void bridge.projects.openFolder().then(apply);
      },
      newProject: () => {
        if (folders) setDialog({ kind: "new" });
      },
      projectSettings,
    };
  }, [bridge, folders, projectSettings]);

  let shown: ReactNode = null;
  if (dialog?.kind === "new") {
    shown = (
      <NewProjectDialog
        projects={bridge.projects}
        location={projects.location}
        onCreated={(next) => {
          setProjects(next);
          close();
        }}
        onClose={close}
      />
    );
  } else if (dialog?.kind === "error") {
    shown = (
      <Dialog title="Can't Open Project" onClose={close}>
        <p>{dialog.message}</p>
      </Dialog>
    );
  }
  return { projects, actions, dialog: shown };
}
