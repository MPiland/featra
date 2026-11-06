import { describe, expect, it, vi } from "vitest";
import type { MenuNode } from "../src/menu.ts";
import { buildProjectMenu } from "../src/project-menu.ts";

const projects = {
  current: { dir: "/p/b", name: "b" },
  projects: [
    { dir: "/p/a", name: "a" },
    { dir: "/p/b", name: "b" },
  ],
  location: "/p",
};
const actions = () => ({
  switchTo: vi.fn<(dir: string) => void>(),
  newProject: vi.fn<() => void>(),
  openFolder: vi.fn<() => void>(),
  projectSettings: vi.fn<() => void>(),
});

/** Each node as one line: its label, a tick when checked, then its shortcut. */
function shape(nodes: MenuNode[]): string[] {
  return nodes.map((n) => {
    if (n.kind === "separator") return "---";
    if (n.kind === "submenu") return `${n.label} >`;
    const tick = n.kind !== "item" && n.checked ? " ✓" : "";
    return `${n.label}${tick}${n.shortcut ? ` ${n.shortcut}` : ""}`;
  });
}

describe("STORY-19 AC1-AC3: the project switcher's menu", () => {
  it("lists every known project, the current one checked, then New Project…, Open Folder… and Project Settings…", () => {
    expect(shape(buildProjectMenu(projects, "win32", actions()))).toEqual([
      "a",
      "b ✓",
      "---",
      "New Project… Ctrl+Shift+N",
      "Open Folder… Ctrl+O",
      "---",
      "Project Settings… Ctrl+Shift+,",
    ]);
    expect(buildProjectMenu(projects, "win32", actions())[0]?.kind).toBe("radio");
    expect(shape(buildProjectMenu(projects, "darwin", actions())).at(-1)).toBe("Project Settings… ⇧⌘,");
  });

  it("each item runs its action; a project switches to its folder", () => {
    const a = actions();
    for (const n of buildProjectMenu(projects, "linux", a)) {
      if (n.kind !== "separator" && n.kind !== "submenu") n.onSelect();
    }
    expect(a.switchTo.mock.calls).toEqual([["/p/a"], ["/p/b"]]);
    expect(a.newProject).toHaveBeenCalledOnce();
    expect(a.openFolder).toHaveBeenCalledOnce();
    expect(a.projectSettings).toHaveBeenCalledOnce();
  });

  it("with no project, starts with New Project…; a browser tab, with no folders, has only Project Settings…", () => {
    const none = { current: null, projects: [], location: "" };
    expect(shape(buildProjectMenu(none, "win32", actions()))[0]).toBe("New Project… Ctrl+Shift+N");
    expect(shape(buildProjectMenu(none, "web", actions()))).toEqual(["Project Settings… Ctrl+Shift+,"]);
  });
});
