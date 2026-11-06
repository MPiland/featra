import { useMemo } from "react";
import { buildProjectMenu, type ProjectMenuActions } from "../project-menu.ts";
import { PROJECT_LABELS, projectInitial, type ProjectsSnapshot } from "../projects.ts";
import { MenuButton } from "./controls/MenuButton.tsx";
import { ChevronsIcon } from "./icons.tsx";

export interface ProjectSwitcherProps {
  projects: ProjectsSnapshot;
  platform: string;
  actions: ProjectMenuActions;
}

/** The top of the sidebar: the current project, and a menu to switch, add one, or open its settings. */
export function ProjectSwitcher({ projects, platform, actions }: ProjectSwitcherProps) {
  const nodes = useMemo(() => buildProjectMenu(projects, platform, actions), [projects, platform, actions]);
  const name = projects.current?.name ?? "No project";
  return (
    <MenuButton
      id="project-menu"
      label={`${PROJECT_LABELS.switcher}: ${name}`}
      menuLabel="Projects"
      className="proj"
      menuClassName="proj-menu"
      nodes={nodes}
    >
      <span className="av" aria-hidden="true">
        {projects.current ? projectInitial(name) : "–"}
      </span>
      <span className="proj-name">{name}</span>
      <ChevronsIcon />
    </MenuButton>
  );
}
