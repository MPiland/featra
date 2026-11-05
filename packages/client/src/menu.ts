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
 * toggles, Keyboard Shortcuts, Find, Previous/Next Chat). Only Back and Forward grey out, when there's nowhere to go.
 */
export function buildAppMenu({ platform, sidebarShown, canGoBack, canGoForward, actions: a }: MenuContext): MenuNode[] {
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
  if (inWindow) view.push(sep("view.sep2"), item("view.fullScreen", "Full Screen", a.toggleFullScreen, "fullScreen"));
  view.push(sep("view.sep3"), item("view.reload", "Reload", a.reload, "reload"));

  const go: MenuNode[] = [
    item("go.back", "Back", a.back, "back", !canGoBack),
    item("go.forward", "Forward", a.forward, "forward", !canGoForward),
    sep("go.sep"),
    ...GO_VIEWS.map((id) => item(`go.${id}`, VIEWS.find((v) => v.id === id)!.title, () => a.open(id))),
  ];

  const help: MenuNode[] = [];
  if (inWindow) {
    help.push(
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
