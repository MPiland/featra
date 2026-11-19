import { useMemo } from "react";
import { EMPTY_NEEDS, othersNeedingYou, type NeedsList } from "@featra/work-format/project-needs";
import { NEEDS_COPY } from "../needs.ts";
import { buildProjectMenu, type ProjectMenuActions } from "../project-menu.ts";
import { PROJECT_LABELS, projectInitial, type ProjectsSnapshot } from "../projects.ts";
import { MenuButton } from "./controls/MenuButton.tsx";
import { ChevronsIcon } from "./icons.tsx";

export interface ProjectSwitcherProps {
  projects: ProjectsSnapshot;
  platform: string;
  actions: ProjectMenuActions;
  /** What each open project needs from the user (STORY-66). */
  needs?: NeedsList;
}

/**
 * The top of the sidebar: the current project, and a menu to switch, add one, or open its settings. The menu shows
 * what each project needs from the user; the closed switcher shows a dot when another project does (STORY-66).
 */
export function ProjectSwitcher({ projects, platform, actions, needs = EMPTY_NEEDS }: ProjectSwitcherProps) {
  const nodes = useMemo(
    () => buildProjectMenu(projects, platform, actions, needs),
    [projects, platform, actions, needs],
  );
  const name = projects.current?.name ?? "No project";
  // The current project's own needs are on its own pages; the dot is for the others.
  const others = othersNeedingYou(needs, projects.current?.dir);
  const label = `${PROJECT_LABELS.switcher}: ${name}${others ? `, ${NEEDS_COPY.others(others)}` : ""}`;
  return (
    <MenuButton
      id="project-menu"
      label={label}
      menuLabel="Projects"
      className="proj"
      menuClassName="proj-menu"
      nodes={nodes}
    >
      <span className="av" aria-hidden="true">
        {projects.current ? projectInitial(name) : "–"}
        {others > 0 && <span className="proj-dot" data-testid="proj-dot" />}
      </span>
      <span className="proj-name">{name}</span>
      <ChevronsIcon />
    </MenuButton>
  );
}
