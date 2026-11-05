import { DEFAULT_VIEW, type ViewId } from "./views.ts";

/** Browser-style view history behind the title bar's back and forward buttons. */
export interface NavState {
  readonly entries: readonly ViewId[];
  readonly index: number;
}

export function initialNav(view: ViewId = DEFAULT_VIEW): NavState {
  return { entries: [view], index: 0 };
}

export function currentView(nav: NavState): ViewId {
  return nav.entries[nav.index] ?? DEFAULT_VIEW;
}

/** Opens a view. Re-opening the current view is a no-op; opening another drops any forward entries. */
export function navigate(nav: NavState, view: ViewId): NavState {
  if (currentView(nav) === view) return nav;
  const entries = [...nav.entries.slice(0, nav.index + 1), view];
  return { entries, index: entries.length - 1 };
}

export const canGoBack = (nav: NavState): boolean => nav.index > 0;
export const canGoForward = (nav: NavState): boolean => nav.index < nav.entries.length - 1;

export function goBack(nav: NavState): NavState {
  return canGoBack(nav) ? { ...nav, index: nav.index - 1 } : nav;
}

export function goForward(nav: NavState): NavState {
  return canGoForward(nav) ? { ...nav, index: nav.index + 1 } : nav;
}
