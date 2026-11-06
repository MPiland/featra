/** The top-level views reachable from the sidebar. Order here is the order in the sidebar. */
export type ViewId = "work" | "inbox" | "artifacts" | "plugins" | "settings";

export interface ViewDef {
  id: ViewId;
  title: string;
  /** Top of the sidebar, or pinned to its foot (below the chat list). */
  placement: "top" | "bottom";
  /** Shown until the story that builds the view lands. */
  placeholder: string;
}

export const VIEWS: readonly ViewDef[] = [
  { id: "work", title: "Work", placement: "top", placeholder: "Your features and stories will show here." },
  {
    id: "inbox",
    title: "Inbox",
    placement: "top",
    placeholder: "Questions and approvals from your agents will show here.",
  },
  { id: "artifacts", title: "Artifacts", placement: "top", placeholder: "Files your agents produce will show here." },
  {
    id: "plugins",
    title: "Plugins",
    placement: "bottom",
    placeholder: "Plugins you can turn on for chats will show here.",
  },
  { id: "settings", title: "Settings", placement: "bottom", placeholder: "App and project settings will show here." },
];

export const DEFAULT_VIEW: ViewId = "work";

export function viewDef(id: ViewId): ViewDef {
  const def = VIEWS.find((v) => v.id === id);
  if (!def) throw new Error(`Unknown view: ${id}`);
  return def;
}
