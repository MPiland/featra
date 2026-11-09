import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_WINDOW_STATE,
  type AppInfo,
  type AppSettings,
  type FeatraBridge,
  type ProjectsSnapshot,
  type SettingsSnapshot,
  type UiState,
  type WindowState,
} from "./bridge.ts";
import { CHAT_COPY } from "./chats.ts";
import { ChatList, useChats } from "./components/chat/ChatList.tsx";
import { ChatPane } from "./components/chat/ChatView.tsx";
import { NewChatDialog } from "./components/chat/NewChatDialog.tsx";
import { Dialog } from "./components/Dialog.tsx";
import { ProjectSwitcher } from "./components/ProjectSwitcher.tsx";
import { SettingsView } from "./components/settings/SettingsView.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { TitleBar } from "./components/TitleBar.tsx";
import { useProjects } from "./components/useProjects.tsx";
import { useProjectSetup } from "./components/useProjectSetup.tsx";
import { useShortcuts } from "./components/useShortcuts.tsx";
import { ViewPlaceholder } from "./components/ViewPlaceholder.tsx";
import { WorkView } from "./components/WorkView.tsx";
import { buildAppMenu, listShortcuts, type MenuActions } from "./menu.ts";
import {
  canGoBack,
  canGoForward,
  chatEntry,
  currentView,
  entryChat,
  entryView,
  goBack,
  goForward,
  initialNav,
  leaveChats,
  navigate,
} from "./navigation.ts";
import { firstSettingsPage, type SettingsPage } from "./settings-pages.ts";
import { applyTheme } from "./theme.ts";
import { viewDef, type ViewId } from "./views.ts";
import { DEFAULT_ZOOM, zoomIn, zoomOut } from "./zoom.ts";

export interface AppProps {
  bridge: FeatraBridge;
  initialUiState: UiState;
  initialSettings: SettingsSnapshot;
  initialProjects: ProjectsSnapshot;
}

type OpenDialog = "about" | "resetAppData" | "newChat" | null;

const sameUiState = (a: UiState, b: UiState) =>
  a.sidebarCollapsed === b.sidebarCollapsed && a.zoomFactor === b.zoomFactor && a.cardPaneWidth === b.cardPaneWidth;

export function App({ bridge, initialUiState, initialSettings, initialProjects }: AppProps) {
  const [nav, setNav] = useState(() => initialNav());
  const [ui, setUi] = useState(initialUiState);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [windowState, setWindowState] = useState<WindowState>(DEFAULT_WINDOW_STATE);
  const [settings, setSettings] = useState(initialSettings);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>(() => firstSettingsPage(initialSettings));
  const saved = useRef(initialUiState);
  const entry = currentView(nav);
  const chatId = entryChat(entry);
  const view = viewDef(entryView(entry) ?? "work");
  const collapsed = ui.sidebarCollapsed;

  const toggleSidebar = useCallback(() => {
    // Collapsing makes the sidebar inert; move keyboard focus out first so it isn't stranded.
    if (document.getElementById("sidebar")?.contains(document.activeElement)) {
      document.querySelector<HTMLElement>("[aria-controls=sidebar]")?.focus();
    }
    setUi((s) => ({ ...s, sidebarCollapsed: !s.sidebarCollapsed }));
  }, []);
  const open = useCallback((v: ViewId) => setNav((n) => navigate(n, v)), []);
  const openChat = useCallback((id: string) => setNav((n) => navigate(n, chatEntry(id))), []);
  const setZoom = useCallback((f: (z: number) => number) => setUi((s) => ({ ...s, zoomFactor: f(s.zoomFactor) })), []);
  const setPaneWidth = useCallback((w: number) => setUi((s) => ({ ...s, cardPaneWidth: w })), []);
  const back = useCallback(() => setNav(goBack), []);
  const forward = useCallback(() => setNav(goForward), []);
  const showKeyboardShortcuts = useCallback(() => {
    setSettingsPage("shortcuts");
    open("settings");
  }, [open]);
  // Each Project Settings… opens the page afresh on the current project, even when Settings already shows another.
  const [projectSettingsOpened, setProjectSettingsOpened] = useState(0);
  const projectSettings = useCallback(() => {
    setSettingsPage("project");
    setProjectSettingsOpened((n) => n + 1);
    open("settings");
  }, [open]);
  const {
    projects,
    actions: projectActions,
    dialog: projectDialog,
  } = useProjects(bridge, initialProjects, projectSettings);
  const projectDir = projects.current?.dir ?? null;
  const { setupPage, openSetup } = useProjectSetup(bridge, projectDir, settings.app.work);
  const { list: chatList, chat, remember } = useChats(bridge.chats, projectDir, chatId, () => setNav(leaveChats));
  const title = chatId === null ? view.title : (chat?.role.name ?? CHAT_COPY.transcript);
  const hasProject = projects.current !== null;
  // Project settings > Set up project: the page shows in Work, on that project.
  const reopenSetup = useCallback(
    (dir: string) => {
      if (projects.current?.dir !== dir) projectActions.switchTo(dir);
      openSetup(dir);
      open("work");
    },
    [projects, projectActions, openSetup, open],
  );
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
      ...projectActions,
      // Without a project there is nowhere to start a chat: Work offers to open or create one.
      newChat: () => (hasProject ? setDialog("newChat") : open("work")),
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
    [bridge, projectActions, hasProject, open, showKeyboardShortcuts, toggleSidebar, setZoom, back, forward],
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

  useShortcuts(bridge.platform, actions);

  useEffect(() => {
    document.title = `Featra · ${title}`;
  }, [title]);

  return (
    <>
      <div className="shell" inert={dialog !== null || projectDialog !== null}>
        <TitleBar
          bridge={bridge}
          title={title}
          project={projects.current?.name}
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
          <Sidebar
            collapsed={collapsed}
            current={chatId === null ? view.id : null}
            onOpen={open}
            project={projects.current}
            onNewChat={() => setDialog("newChat")}
            chats={<ChatList list={chatList} current={chatId} onOpen={openChat} />}
            switcher={<ProjectSwitcher projects={projects} platform={bridge.platform} actions={projectActions} />}
          />
          <main aria-labelledby="view-title">
            {chatId !== null ? (
              <ChatPane chats={bridge.chats} chat={chat} />
            ) : view.id === "settings" ? (
              <SettingsView
                bridge={bridge}
                snapshot={settings}
                projects={projects}
                projectKey={`${projects.current?.dir ?? ""}:${projectSettingsOpened}`}
                page={settingsPage}
                onPage={setSettingsPage}
                onAppChange={changeAppSettings}
                shortcuts={shortcuts}
                onSetUp={reopenSetup}
              />
            ) : view.id === "work" ? (
              <WorkView
                projects={projects}
                platform={bridge.platform}
                actions={projectActions}
                work={bridge.work}
                paneWidth={{ chosen: ui.cardPaneWidth, choose: setPaneWidth }}
                setupPage={setupPage}
              />
            ) : (
              <ViewPlaceholder view={view} />
            )}
          </main>
        </div>
      </div>
      {projectDialog}
      {dialog === "newChat" && projects.current && (
        <NewChatDialog
          chats={bridge.chats}
          dir={projects.current.dir}
          onClose={() => setDialog(null)}
          onStarted={(id, role) => {
            setDialog(null);
            remember(id, role);
            openChat(id);
          }}
        />
      )}
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
