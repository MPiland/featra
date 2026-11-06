import type { MenuNode } from "./menu.ts";
import { PROJECT_LABELS, type ProjectsSnapshot } from "./projects.ts";
import { shortcutLabel, type ShortcutId } from "./shortcuts.ts";

export interface ProjectMenuActions {
  switchTo: (dir: string) => void;
  newProject: () => void;
  openFolder: () => void;
  projectSettings: () => void;
}

/**
 * The project switcher's menu: every known project (the current one checked), then New Project… and Open Folder…,
 * then Project Settings…. The last three are the File menu's items, with the same words and shortcuts. A browser tab
 * has no folders, so it gets only Project Settings….
 */
export function buildProjectMenu(projects: ProjectsSnapshot, platform: string, a: ProjectMenuActions): MenuNode[] {
  const item = (id: string, label: string, onSelect: () => void, shortcut: ShortcutId): MenuNode => {
    const k = shortcutLabel(shortcut, platform);
    return { kind: "item", id, label, onSelect, ...(k ? { shortcut: k } : {}) };
  };
  const list: MenuNode[] = projects.projects.map((p, i) => ({
    kind: "radio",
    id: `project.${i}`,
    label: p.name,
    checked: p.dir === projects.current?.dir,
    onSelect: () => a.switchTo(p.dir),
  }));
  const add: MenuNode[] =
    platform === "web"
      ? []
      : [
          item("project.new", PROJECT_LABELS.newProject, a.newProject, "newProject"),
          item("project.open", PROJECT_LABELS.openFolder, a.openFolder, "openFolder"),
        ];
  const groups = [
    list,
    add,
    [item("project.settings", PROJECT_LABELS.projectSettings, a.projectSettings, "projectSettings")],
  ];
  const nodes: MenuNode[] = [];
  for (const [i, g] of groups.filter((group) => group.length > 0).entries()) {
    if (i > 0) nodes.push({ kind: "separator", id: `project.sep${i}` });
    nodes.push(...g);
  }
  return nodes;
}
