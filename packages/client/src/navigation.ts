import { DEFAULT_VIEW, type ViewId } from "./views.ts";

/** A place in the history: a view, or a chat by its id (STORY-21). */
export type NavEntry = ViewId | `chat:${string}`;

/** The history entry for a chat. */
export const chatEntry = (id: string): NavEntry => `chat:${id}`;

const isChatEntry = (entry: NavEntry): entry is `chat:${string}` => entry.startsWith("chat:");

/** The chat an entry opens, or null when it is a view. */
export const entryChat = (entry: NavEntry): string | null => (isChatEntry(entry) ? entry.slice(5) : null);

/** The view an entry opens, or null when it is a chat. */
export const entryView = (entry: NavEntry): ViewId | null => (isChatEntry(entry) ? null : entry);

/** Browser-style history behind the title bar's back and forward buttons: the views and chats the user opened. */
export interface NavState {
  readonly entries: readonly NavEntry[];
  readonly index: number;
}

export function initialNav(view: ViewId = DEFAULT_VIEW): NavState {
  return { entries: [view], index: 0 };
}

export function currentView(nav: NavState): NavEntry {
  return nav.entries[nav.index] ?? DEFAULT_VIEW;
}

/** Opens a view or chat. Re-opening the current one is a no-op; opening another drops any forward entries. */
export function navigate(nav: NavState, entry: NavEntry): NavState {
  if (currentView(nav) === entry) return nav;
  const entries = [...nav.entries.slice(0, nav.index + 1), entry];
  return { entries, index: entries.length - 1 };
}

/**
 * The history once the project changes: its chats belong to the old project, so they leave it. A chat in front
 * gives way to Work, and the entries after it go, as when the user opens a view.
 */
export function leaveChats(nav: NavState): NavState {
  if (!nav.entries.some(isChatEntry)) return nav;
  const onChat = isChatEntry(currentView(nav));
  const entries: NavEntry[] = [];
  let index = 0;
  nav.entries.forEach((e, i) => {
    if (onChat && i > nav.index) return;
    const entry: NavEntry = i === nav.index && onChat ? "work" : e;
    if (!isChatEntry(entry) && entries.at(-1) !== entry) entries.push(entry);
    if (i === nav.index) index = entries.length - 1;
  });
  return { entries, index };
}

export const canGoBack = (nav: NavState): boolean => nav.index > 0;
export const canGoForward = (nav: NavState): boolean => nav.index < nav.entries.length - 1;

export function goBack(nav: NavState): NavState {
  return canGoBack(nav) ? { ...nav, index: nav.index - 1 } : nav;
}

export function goForward(nav: NavState): NavState {
  return canGoForward(nav) ? { ...nav, index: nav.index + 1 } : nav;
}
