import type { FeatraBridge } from "../bridge.ts";
import { toggleSidebarShortcutLabel } from "../shortcuts.ts";
import type { MenuNode } from "../menu.ts";
import { AppMenu } from "./AppMenu.tsx";
import { BackIcon, CloseIcon, ForwardIcon, MaximizeIcon, MinimizeIcon, SidebarIcon } from "./icons.tsx";

export interface TitleBarProps {
  bridge: FeatraBridge;
  title: string;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  menu: readonly MenuNode[];
}

export function TitleBar(p: TitleBarProps) {
  const isMac = p.bridge.platform === "darwin";
  // macOS keeps its native traffic lights; a plain browser has no window to control.
  const ownWindowControls = p.bridge.platform === "win32" || p.bridge.platform === "linux";
  const shortcut = toggleSidebarShortcutLabel(p.bridge.platform);
  return (
    <header className={isMac ? "titlebar mac" : "titlebar"}>
      <AppMenu nodes={p.menu} />
      <button
        type="button"
        className={p.sidebarCollapsed ? "tb" : "tb on"}
        aria-label="Toggle sidebar"
        aria-keyshortcuts={isMac ? "Meta+B" : "Control+B"}
        aria-expanded={!p.sidebarCollapsed}
        aria-controls="sidebar"
        data-tip={`Toggle sidebar  ${shortcut}`}
        onClick={p.onToggleSidebar}
      >
        <SidebarIcon />
      </button>
      <button type="button" className="tb" aria-label="Back" data-tip="Back" disabled={!p.canGoBack} onClick={p.onBack}>
        <BackIcon />
      </button>
      <button
        type="button"
        className="tb"
        aria-label="Forward"
        data-tip="Forward"
        disabled={!p.canGoForward}
        onClick={p.onForward}
      >
        <ForwardIcon />
      </button>
      {/* STORY-29 turns the title into the chat actions menu (rename, fork, export, move). */}
      <h1 className="ttl" id="view-title">
        {p.title}
      </h1>
      <span className="grow" />
      {/* STORY-26..28: pane toggles (changes, terminal, environment) go here. */}
      {ownWindowControls && (
        <>
          <span className="sep" aria-hidden="true" />
          <button type="button" className="tb" aria-label="Minimize" onClick={() => p.bridge.window.minimize()}>
            <MinimizeIcon />
          </button>
          <button type="button" className="tb" aria-label="Maximize" onClick={() => p.bridge.window.toggleMaximize()}>
            <MaximizeIcon />
          </button>
          <button type="button" className="tb close" aria-label="Close window" onClick={() => p.bridge.window.close()}>
            <CloseIcon />
          </button>
        </>
      )}
    </header>
  );
}
