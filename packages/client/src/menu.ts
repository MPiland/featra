import type { EditCommand, ThemeChoice } from "./bridge.ts";
import { shortcutLabel } from "./shortcuts.ts";

export type MenuNode =
  | { kind: "item"; id: string; label: string; shortcut?: string; onSelect: () => void }
  | { kind: "radio"; id: string; label: string; checked: boolean; onSelect: () => void }
  | { kind: "submenu"; id: string; label: string; items: MenuNode[] }
  | { kind: "separator"; id: string };

export interface MenuActions {
  openSettings(): void;
  quit(): void;
  edit(command: EditCommand): void;
  toggleSidebar(): void;
  zoomIn(): void;
  zoomOut(): void;
  zoomReset(): void;
  setTheme(theme: ThemeChoice): void;
  showShortcuts(): void;
  showAbout(): void;
  reload(): void;
  toggleDevTools(): void;
}

export interface MenuContext {
  platform: string;
  theme: ThemeChoice;
  actions: MenuActions;
}

/**
 * The title bar's Menu: File, Edit, View, Help. Only items that work today are listed; later stories add theirs
 * (New chat, New project…, Open folder…, Project settings…, pane toggles).
 */
export function buildAppMenu({ platform, theme, actions: a }: MenuContext): MenuNode[] {
  const key = (id: Parameters<typeof shortcutLabel>[0]) => shortcutLabel(id, platform);
  const inWindow = platform !== "web"; // a plain browser tab can't quit or open developer tools for itself
  const edit = (id: EditCommand, label: string): MenuNode => ({
    kind: "item",
    id: `edit.${id}`,
    label,
    shortcut: key(id),
    onSelect: () => a.edit(id),
  });
  const themeItem = (id: ThemeChoice, label: string): MenuNode => ({
    kind: "radio",
    id: `view.theme.${id}`,
    label,
    checked: theme === id,
    onSelect: () => a.setTheme(id),
  });

  const file: MenuNode[] = [
    { kind: "item", id: "file.settings", label: "Settings…", shortcut: key("settings"), onSelect: a.openSettings },
  ];
  if (inWindow) {
    file.push({ kind: "separator", id: "file.sep" });
    file.push({ kind: "item", id: "file.quit", label: "Quit", shortcut: key("quit"), onSelect: a.quit });
  }

  const help: MenuNode[] = [
    { kind: "item", id: "help.shortcuts", label: "Keyboard shortcuts", onSelect: a.showShortcuts },
    { kind: "item", id: "help.about", label: "About Featra", onSelect: a.showAbout },
  ];
  if (inWindow) {
    help.push({ kind: "separator", id: "help.sep" });
    help.push({
      kind: "submenu",
      id: "help.troubleshooting",
      label: "Troubleshooting",
      items: [
        { kind: "item", id: "help.reload", label: "Reload window", onSelect: a.reload },
        { kind: "item", id: "help.devtools", label: "Toggle developer tools", onSelect: a.toggleDevTools },
      ],
    });
  }

  return [
    { kind: "submenu", id: "file", label: "File", items: file },
    {
      kind: "submenu",
      id: "edit",
      label: "Edit",
      items: [
        edit("undo", "Undo"),
        edit("redo", "Redo"),
        { kind: "separator", id: "edit.sep" },
        edit("cut", "Cut"),
        edit("copy", "Copy"),
        edit("paste", "Paste"),
        edit("selectAll", "Select all"),
      ],
    },
    {
      kind: "submenu",
      id: "view",
      label: "View",
      items: [
        { kind: "item", id: "view.sidebar", label: "Toggle sidebar", shortcut: key("toggleSidebar"), onSelect: a.toggleSidebar },
        { kind: "separator", id: "view.sep1" },
        { kind: "item", id: "view.zoomIn", label: "Zoom in", shortcut: key("zoomIn"), onSelect: a.zoomIn },
        { kind: "item", id: "view.zoomOut", label: "Zoom out", shortcut: key("zoomOut"), onSelect: a.zoomOut },
        { kind: "item", id: "view.zoomReset", label: "Reset zoom", shortcut: key("zoomReset"), onSelect: a.zoomReset },
        { kind: "separator", id: "view.sep2" },
        {
          kind: "submenu",
          id: "view.theme",
          label: "Theme",
          items: [themeItem("system", "System"), themeItem("light", "Light"), themeItem("dark", "Dark")],
        },
      ],
    },
    { kind: "submenu", id: "help", label: "Help", items: help },
  ];
}

/** Every item in the menu that has a shortcut, for the Keyboard shortcuts dialog. */
export function menuShortcuts(menu: readonly MenuNode[]): { label: string; shortcut: string }[] {
  return menu.flatMap((n) =>
    n.kind === "submenu" ? menuShortcuts(n.items) : n.kind === "item" && n.shortcut ? [{ label: n.label, shortcut: n.shortcut }] : [],
  );
}
