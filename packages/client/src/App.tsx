import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppInfo, FeatraBridge, ThemeChoice, UiState } from "./bridge.ts";
import { Dialog } from "./components/Dialog.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { TitleBar } from "./components/TitleBar.tsx";
import { ViewPlaceholder } from "./components/ViewPlaceholder.tsx";
import { buildAppMenu, type MenuActions } from "./menu.ts";
import { canGoBack, canGoForward, currentView, goBack, goForward, initialNav, navigate } from "./navigation.ts";
import { matchShortcut, type AppShortcut } from "./shortcuts.ts";
import { applyTheme } from "./theme.ts";
import { viewDef, type ViewId } from "./views.ts";
import { DEFAULT_ZOOM, zoomIn, zoomOut } from "./zoom.ts";

export interface AppProps {
  bridge: FeatraBridge;
  initialUiState: UiState;
}

type OpenDialog = "about" | null;

const sameUiState = (a: UiState, b: UiState) =>
  a.sidebarCollapsed === b.sidebarCollapsed && a.zoomFactor === b.zoomFactor && a.theme === b.theme;

export function App({ bridge, initialUiState }: AppProps) {
  const [nav, setNav] = useState(() => initialNav());
  const [ui, setUi] = useState(initialUiState);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const saved = useRef(initialUiState);
  const view = viewDef(currentView(nav));
  const collapsed = ui.sidebarCollapsed;

  const toggleSidebar = useCallback(() => {
    // Collapsing makes the sidebar inert; move keyboard focus out first so it isn't stranded.
    if (document.getElementById("sidebar")?.contains(document.activeElement)) {
      document.querySelector<HTMLElement>("[aria-controls=sidebar]")?.focus();
    }
    setUi((s) => ({ ...s, sidebarCollapsed: !s.sidebarCollapsed }));
  }, []);
  const open = useCallback((v: ViewId) => setNav((n) => navigate(n, v)), []);
  const setZoom = useCallback((f: (z: number) => number) => setUi((s) => ({ ...s, zoomFactor: f(s.zoomFactor) })), []);
  const setTheme = useCallback((theme: ThemeChoice) => setUi((s) => ({ ...s, theme })), []);

  const actions: MenuActions = useMemo(
    () => ({
      openSettings: () => open("settings"),
      quit: () => bridge.app.quit(),
      edit: (command) => bridge.edit(command),
      toggleSidebar,
      zoomIn: () => setZoom(zoomIn),
      zoomOut: () => setZoom(zoomOut),
      zoomReset: () => setZoom(() => DEFAULT_ZOOM),
      setTheme,
      showAbout: () => setDialog("about"),
      reload: () => bridge.app.reload(),
      toggleDevTools: () => bridge.app.toggleDevTools(),
    }),
    [bridge, open, toggleSidebar, setZoom, setTheme],
  );
  const menu = useMemo(
    () => buildAppMenu({ platform: bridge.platform, theme: ui.theme, actions }),
    [bridge.platform, ui.theme, actions],
  );

  useEffect(() => {
    if (sameUiState(saved.current, ui)) return;
    saved.current = ui;
    void bridge.uiState.save(ui);
  }, [bridge, ui]);

  useEffect(() => bridge.window.setZoomFactor(ui.zoomFactor), [bridge, ui.zoomFactor]);
  useEffect(() => {
    applyTheme(ui.theme);
    bridge.window.setTheme(ui.theme);
  }, [bridge, ui.theme]);

  useEffect(() => {
    if (dialog === "about" && !info) void bridge.app.info().then(setInfo);
  }, [bridge, dialog, info]);

  useEffect(() => {
    const run: Record<AppShortcut, () => void> = {
      toggleSidebar: actions.toggleSidebar,
      settings: actions.openSettings,
      zoomIn: actions.zoomIn,
      zoomOut: actions.zoomOut,
      zoomReset: actions.zoomReset,
      quit: actions.quit,
    };
    const onKey = (e: KeyboardEvent) => {
      const shortcut = matchShortcut(e, bridge.platform);
      if (!shortcut) return;
      e.preventDefault();
      run[shortcut]();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bridge, actions]);

  useEffect(() => {
    document.title = `Featra · ${view.title}`;
  }, [view.title]);

  return (
    <>
      <div className="shell" inert={dialog !== null}>
        <TitleBar
          bridge={bridge}
          title={view.title}
          sidebarCollapsed={collapsed}
          onToggleSidebar={toggleSidebar}
          canGoBack={canGoBack(nav)}
          canGoForward={canGoForward(nav)}
          onBack={() => setNav(goBack)}
          onForward={() => setNav(goForward)}
          menu={menu}
        />
        <div className={collapsed ? "app collapsed" : "app"}>
          <Sidebar collapsed={collapsed} current={view.id} onOpen={open} />
          <main aria-labelledby="view-title">
            <ViewPlaceholder view={view} />
          </main>
        </div>
      </div>
      {dialog === "about" && (
        <Dialog title="About Featra" onClose={() => setDialog(null)}>
          <p className="about-name">{info?.name ?? "Featra"}</p>
          <p>Version {info?.version ?? "…"}</p>
          <p>Released under the MIT licence.</p>
        </Dialog>
      )}
    </>
  );
}
