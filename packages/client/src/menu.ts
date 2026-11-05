import type { EditCommand } from "./bridge.ts";
import { shortcutLabel, type ShortcutId } from "./shortcuts.ts";
import { VIEWS, type ViewId } from "./views.ts";

export type MenuNode =
  | { kind: "item"; id: string; label: string; shortcut?: string; disabled?: boolean; onSelect: () => void }
  | { kind: "check"; id: string; label: string; shortcut?: string; checked: boolean; onSelect: () => void }
  | { kind: "submenu"; id: string; label: string; items: MenuNode[] }
  | { kind: "separator"; id: string };

export interface MenuActions {
  openSettings(): void;
  /** Opens Settings on its Keyboard shortcuts page. */
  showKeyboardShortcuts(): void;
  closeWindow(): void;
  quit(): void;
  edit(command: EditCommand): void;
  toggleSidebar(): void;
  zoomReset(): void;
  zoomIn(): void;
  zoomOut(): void;
  toggleFullScreen(): void;
  reload(): void;
  back(): void;
  forward(): void;
  open(view: ViewId): void;
  showLogs(): void;
  toggleDevTools(): void;
  clearCacheAndRestart(): void;
  /** Asks first: the confirm dialog runs the reset. */
  resetAppData(): void;
  showAbout(): void;
}

export interface MenuContext {
  platform: string;
  sidebarShown: boolean;
  /** The window is full screen: View > Full Screen shows a checkmark. */
  fullScreen: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  actions: MenuActions;
}

/** The views the Go menu opens: the sidebar's, except Settings, which is in File. */
const GO_VIEWS: readonly ViewId[] = VIEWS.map((v) => v.id).filter((id) => id !== "settings");

const fileManager = (platform: string) =>
  platform === "darwin" ? "Finder" : platform === "win32" ? "File Explorer" : "File Manager";

/**
 * The title bar's Menu, modelled on Claude's desktop app: File, Edit, View, Go, Help, in Title Case. Items that
 * aren't built yet are left out, not greyed; later stories add theirs (New Chat, New Project…, Open Folder…, pane
 * toggles, Find, Previous/Next Chat). Only Back and Forward grey out, when there's nowhere to go.
 */
export function buildAppMenu({
  platform,
  sidebarShown,
  fullScreen,
  canGoBack,
  canGoForward,
  actions: a,
}: MenuContext): MenuNode[] {
  const key = (id: ShortcutId) => shortcutLabel(id, platform);
  const inWindow = platform !== "web"; // a plain browser tab can't close, quit, go full screen or troubleshoot itself
  const sep = (id: string): MenuNode => ({ kind: "separator", id });
  const item = (id: string, label: string, onSelect: () => void, shortcut?: ShortcutId, disabled = false): MenuNode => {
    const k = shortcut && key(shortcut);
    return { kind: "item", id, label, onSelect, ...(k ? { shortcut: k } : {}), ...(disabled ? { disabled } : {}) };
  };
  const edit = (command: EditCommand, label: string): MenuNode =>
    item(`edit.${command}`, label, () => a.edit(command), command === "delete" ? undefined : command);

  const file: MenuNode[] = [item("file.settings", "Settings…", a.openSettings, "settings")];
  if (inWindow) {
    file.push(
      sep("file.sep1"),
      item("file.closeWindow", "Close Window", a.closeWindow, "closeWindow"),
      sep("file.sep2"),
      item("file.quit", platform === "darwin" ? "Quit Featra" : "Exit", a.quit, "quit"),
    );
  }

  const view: MenuNode[] = [
    { kind: "check", id: "view.sidebar", label: "Sidebar", shortcut: key("toggleSidebar"), checked: sidebarShown, onSelect: a.toggleSidebar },
    sep("view.sep1"),
    item("view.actualSize", "Actual Size", a.zoomReset, "zoomReset"),
    item("view.zoomIn", "Zoom In", a.zoomIn, "zoomIn"),
    item("view.zoomOut", "Zoom Out", a.zoomOut, "zoomOut"),
  ];
  if (inWindow) {
    const k = key("fullScreen");
    view.push(sep("view.sep2"), {
      kind: "check",
      id: "view.fullScreen",
      label: "Full Screen",
      ...(k ? { shortcut: k } : {}),
      checked: fullScreen,
      onSelect: a.toggleFullScreen,
    });
  }
  view.push(sep("view.sep3"), item("view.reload", "Reload", a.reload, "reload"));

  const go: MenuNode[] = [
    item("go.back", "Back", a.back, "back", !canGoBack),
    item("go.forward", "Forward", a.forward, "forward", !canGoForward),
    sep("go.sep"),
    ...GO_VIEWS.map((id) => item(`go.${id}`, VIEWS.find((v) => v.id === id)!.title, () => a.open(id))),
  ];

  const help: MenuNode[] = [item("help.keyboardShortcuts", "Keyboard Shortcuts", a.showKeyboardShortcuts, "keyboardShortcuts")];
  if (inWindow) {
    help.push(
      sep("help.sep0"),
      {
        kind: "submenu",
        id: "help.troubleshooting",
        label: "Troubleshooting",
        items: [
          item("help.showLogs", `Show Logs in ${fileManager(platform)}`, a.showLogs),
          item("help.devTools", "Toggle Developer Tools", a.toggleDevTools),
          item("help.clearCache", "Clear Cache and Restart", a.clearCacheAndRestart),
          item("help.resetAppData", "Reset App Data…", a.resetAppData),
        ],
      },
      sep("help.sep"),
    );
  }
  help.push(item("help.about", "About Featra", a.showAbout));

  return [
    { kind: "submenu", id: "file", label: "File", items: file },
    {
      kind: "submenu",
      id: "edit",
      label: "Edit",
      items: [
        edit("undo", "Undo"),
        edit("redo", "Redo"),
        sep("edit.sep"),
        edit("cut", "Cut"),
        edit("copy", "Copy"),
        edit("paste", "Paste"),
        edit("delete", "Delete"),
        edit("selectAll", "Select All"),
      ],
    },
    { kind: "submenu", id: "view", label: "View", items: view },
    { kind: "submenu", id: "go", label: "Go", items: go },
    { kind: "submenu", id: "help", label: "Help", items: help },
  ];
}

/** One row of Settings > Keyboard shortcuts. */
export interface ShortcutEntry {
  /** The menu the item is in: File, Edit, View, Go or Help. */
  area: string;
  /** The item's name, without the menu's trailing ellipsis. */
  name: string;
  keys: string;
}

/**
 * Every shortcut, by area, read from the menu itself so the page can never list a shortcut the menu doesn't have (or
 * miss one it does): every shortcut Featra has is on a menu item.
 */
export function listShortcuts(menu: readonly MenuNode[]): ShortcutEntry[] {
  const out: ShortcutEntry[] = [];
  const walk = (area: string, nodes: readonly MenuNode[]) => {
    for (const n of nodes) {
      if (n.kind === "submenu") walk(area, n.items);
      else if (n.kind !== "separator" && n.shortcut) out.push({ area, name: n.label.replace(/…$/, ""), keys: n.shortcut });
    }
  };
  for (const top of menu) if (top.kind === "submenu") walk(top.label, top.items);
  return out;
}

/** Search: every word must appear in the name, the keys or the area, ignoring case ("zoom", "ctrl+b", "view full"). */
export function filterShortcuts(entries: readonly ShortcutEntry[], query: string): ShortcutEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((e) => {
    const text = `${e.name} ${e.keys} ${e.area}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
