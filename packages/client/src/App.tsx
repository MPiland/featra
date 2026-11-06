import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_WINDOW_STATE,
  type AppInfo,
  type AppSettings,
  type FeatraBridge,
  type SettingsSnapshot,
  type UiState,
  type WindowState,
} from "./bridge.ts";
import { Dialog } from "./components/Dialog.tsx";
import { SettingsView } from "./components/settings/SettingsView.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { TitleBar } from "./components/TitleBar.tsx";
import { ViewPlaceholder } from "./components/ViewPlaceholder.tsx";
import { buildAppMenu, listShortcuts, type MenuActions } from "./menu.ts";
import { canGoBack, canGoForward, currentView, goBack, goForward, initialNav, navigate } from "./navigation.ts";
import { firstSettingsPage, type SettingsPage } from "./settings-pages.ts";
import { matchShortcut, type AppShortcut } from "./shortcuts.ts";
import { applyTheme } from "./theme.ts";
import { viewDef, type ViewId } from "./views.ts";
import { DEFAULT_ZOOM, zoomIn, zoomOut } from "./zoom.ts";

export interface AppProps {
  bridge: FeatraBridge;
  initialUiState: UiState;
  initialSettings: SettingsSnapshot;
}

type OpenDialog = "about" | "resetAppData" | null;

const sameUiState = (a: UiState, b: UiState) => a.sidebarCollapsed === b.sidebarCollapsed && a.zoomFactor === b.zoomFactor;

export function App({ bridge, initialUiState, initialSettings }: AppProps) {
  const [nav, setNav] = useState(() => initialNav());
  const [ui, setUi] = useState(initialUiState);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [windowState, setWindowState] = useState<WindowState>(DEFAULT_WINDOW_STATE);
  const [settings, setSettings] = useState(initialSettings);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>(() => firstSettingsPage(initialSettings));
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
  const back = useCallback(() => setNav(goBack), []);
  const forward = useCallback(() => setNav(goForward), []);
  const showKeyboardShortcuts = useCallback(() => {
    setSettingsPage("shortcuts");
    open("settings");
  }, [open]);
  // The host stores app settings and applies them at once (the close button too); the UI applies the theme.
  const changeAppSettings = useCallback(
    (app: AppSettings) => {
      setSettings((s) => ({ ...s, app }));
      void bridge.settings.saveApp(app);
    },
    [bridge],
  );

  const actions: MenuActions = useMemo(
    () => ({
      openSettings: () => open("settings"),
      showKeyboardShortcuts,
      closeWindow: () => bridge.window.close(),
      quit: () => bridge.app.quit(),
      edit: (command) => bridge.edit(command),
      toggleSidebar,
      zoomReset: () => setZoom(() => DEFAULT_ZOOM),
      zoomIn: () => setZoom(zoomIn),
      zoomOut: () => setZoom(zoomOut),
      toggleFullScreen: () => bridge.window.toggleFullScreen(),
      reload: () => bridge.app.reload(),
      back,
      forward,
      open,
      showLogs: () => bridge.app.showLogs(),
      toggleDevTools: () => bridge.app.toggleDevTools(),
      clearCacheAndRestart: () => bridge.app.clearCacheAndRestart(),
      resetAppData: () => setDialog("resetAppData"),
      showAbout: () => setDialog("about"),
    }),
    [bridge, open, showKeyboardShortcuts, toggleSidebar, setZoom, back, forward],
  );
  const menu = useMemo(
    () =>
      buildAppMenu({
        platform: bridge.platform,
        sidebarShown: !collapsed,
        fullScreen: windowState.fullScreen,
        canGoBack: canGoBack(nav),
        canGoForward: canGoForward(nav),
        actions,
      }),
    [bridge.platform, collapsed, windowState.fullScreen, nav, actions],
  );
  const shortcuts = useMemo(() => listShortcuts(menu), [menu]);

  useEffect(() => {
    if (sameUiState(saved.current, ui)) return;
    saved.current = ui;
    void bridge.uiState.save(ui);
  }, [bridge, ui]);

  useEffect(() => bridge.window.setZoomFactor(ui.zoomFactor), [bridge, ui.zoomFactor]);
  // The window's maximized and full-screen state comes from the host, which reports every change, the OS's too.
  useEffect(() => {
    let live = true;
    const off = bridge.window.onStateChange((s) => live && setWindowState(s));
    void bridge.window.state().then((s) => live && setWindowState(s));
    return () => {
      live = false;
      off();
    };
  }, [bridge]);
  // The theme setting (Settings > Appearance; System by default, so the OS decides).
  const theme = settings.app.theme;
  useEffect(() => {
    applyTheme(theme);
    bridge.window.setTheme(theme);
  }, [bridge, theme]);

  useEffect(() => {
    if (dialog === "about" && !info) void bridge.app.info().then(setInfo);
  }, [bridge, dialog, info]);

  useEffect(() => {
    const run: Record<AppShortcut, () => void> = {
      settings: actions.openSettings,
      keyboardShortcuts: actions.showKeyboardShortcuts,
      closeWindow: actions.closeWindow,
      toggleSidebar: actions.toggleSidebar,
      zoomReset: actions.zoomReset,
      zoomIn: actions.zoomIn,
      zoomOut: actions.zoomOut,
      fullScreen: actions.toggleFullScreen,
      reload: actions.reload,
      back: actions.back,
      forward: actions.forward,
    };
    const onKey = (e: KeyboardEvent) => {
      const shortcut = matchShortcut(e, bridge.platform);
      if (!shortcut) return;
      // A plain browser tab keeps its own F11 and has no window to close.
      if (bridge.platform === "web" && (shortcut === "fullScreen" || shortcut === "closeWindow")) return;
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
          onBack={back}
          onForward={forward}
          menu={menu}
          windowState={windowState}
        />
        <div className={collapsed ? "app collapsed" : "app"}>
          <Sidebar collapsed={collapsed} current={view.id} onOpen={open} />
          <main aria-labelledby="view-title">
            {view.id === "settings" ? (
              <SettingsView
                bridge={bridge}
                snapshot={settings}
                page={settingsPage}
                onPage={setSettingsPage}
                onAppChange={changeAppSettings}
                shortcuts={shortcuts}
              />
            ) : (
              <ViewPlaceholder view={view} />
            )}
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
      {dialog === "resetAppData" && (
        <Dialog
          title="Reset App Data?"
          closeLabel="Cancel"
          onClose={() => setDialog(null)}
          actions={
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                setDialog(null);
                bridge.app.resetAppData();
              }}
            >
              Reset and Restart
            </button>
          }
        >
          <p>Featra forgets its window layout, zoom and other stored settings, then restarts.</p>
          <p>Your projects and their files are not touched. Logs are kept.</p>
        </Dialog>
      )}
    </>
  );
}
