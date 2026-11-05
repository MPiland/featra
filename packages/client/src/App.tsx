import { useCallback, useEffect, useRef, useState } from "react";
import type { FeatraBridge, UiState } from "./bridge.ts";
import type { MenuItem } from "./components/AppMenu.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { TitleBar } from "./components/TitleBar.tsx";
import { ViewPlaceholder } from "./components/ViewPlaceholder.tsx";
import { canGoBack, canGoForward, currentView, goBack, goForward, initialNav, navigate } from "./navigation.ts";
import { isToggleSidebarShortcut, toggleSidebarShortcutLabel } from "./shortcuts.ts";
import { viewDef, type ViewId } from "./views.ts";

export interface AppProps {
  bridge: FeatraBridge;
  initialUiState: UiState;
}

export function App({ bridge, initialUiState }: AppProps) {
  const [nav, setNav] = useState(() => initialNav());
  const [collapsed, setCollapsed] = useState(initialUiState.sidebarCollapsed);
  const saved = useRef(initialUiState.sidebarCollapsed);
  const view = viewDef(currentView(nav));

  const toggleSidebar = useCallback(() => {
    // Collapsing makes the sidebar inert; move keyboard focus out first so it isn't stranded.
    if (document.getElementById("sidebar")?.contains(document.activeElement)) {
      document.querySelector<HTMLElement>("[aria-controls=sidebar]")?.focus();
    }
    setCollapsed((c) => !c);
  }, []);
  const open = useCallback((v: ViewId) => setNav((n) => navigate(n, v)), []);

  useEffect(() => {
    if (saved.current === collapsed) return;
    saved.current = collapsed;
    void bridge.uiState.save({ sidebarCollapsed: collapsed });
  }, [bridge, collapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isToggleSidebarShortcut(e, bridge.platform)) return;
      e.preventDefault();
      toggleSidebar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bridge, toggleSidebar]);

  useEffect(() => {
    document.title = `Featra · ${view.title}`;
  }, [view.title]);

  const menuItems: MenuItem[] = [
    {
      id: "toggle-sidebar",
      label: "Toggle sidebar",
      shortcut: toggleSidebarShortcutLabel(bridge.platform),
      onSelect: toggleSidebar,
    },
    { id: "settings", label: "Settings", onSelect: () => open("settings") },
    { id: "reload", label: "Reload window", onSelect: () => bridge.app.reload(), separated: true },
    { id: "devtools", label: "Toggle developer tools", onSelect: () => bridge.app.toggleDevTools() },
    { id: "quit", label: "Quit Featra", onSelect: () => bridge.app.quit(), separated: true },
  ];

  return (
    <div className="shell">
      <TitleBar
        bridge={bridge}
        title={view.title}
        sidebarCollapsed={collapsed}
        onToggleSidebar={toggleSidebar}
        canGoBack={canGoBack(nav)}
        canGoForward={canGoForward(nav)}
        onBack={() => setNav(goBack)}
        onForward={() => setNav(goForward)}
        menuItems={menuItems}
      />
      <div className={collapsed ? "app collapsed" : "app"}>
        <Sidebar collapsed={collapsed} current={view.id} onOpen={open} />
        <main aria-labelledby="view-title">
          <ViewPlaceholder view={view} />
        </main>
      </div>
    </div>
  );
}
