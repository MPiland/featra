import type { FeatraBridge } from "../../bridge.ts";
import type { ShortcutEntry } from "../../menu.ts";
import type { AppSettings, SettingsSnapshot } from "../../settings.ts";
import { SCOPE_TITLES, settingsPages, type SettingsPage, type SettingsScope } from "../../settings-pages.ts";
import { AppearancePage } from "./AppearancePage.tsx";
import { GeneralPage } from "./GeneralPage.tsx";
import { PageHeader } from "./PageHeader.tsx";
import { ProjectPage } from "./ProjectPage.tsx";
import { ShortcutsPage } from "./ShortcutsPage.tsx";
import { WorkDefaultsPage } from "./WorkDefaultsPage.tsx";

export interface SettingsViewProps {
  bridge: FeatraBridge;
  snapshot: SettingsSnapshot;
  page: SettingsPage;
  onPage(page: SettingsPage): void;
  onAppChange(settings: AppSettings): void;
  shortcuts: readonly ShortcutEntry[];
}

const SCOPES: readonly SettingsScope[] = ["app", "project"];

/** Settings: the page list, by scope, and the chosen page. */
export function SettingsView({ bridge, snapshot, page, onPage, onAppChange, shortcuts }: SettingsViewProps) {
  const pages = settingsPages(snapshot);
  const current = pages.find((p) => p.id === page) ?? pages[0];
  return (
    <div className="settings">
      <nav className="settings-nav" aria-label="Settings pages">
        {SCOPES.map((scope) => (
          <div key={scope} className="settings-scope">
            <p className="settings-scope-title" id={`settings-scope-${scope}`}>
              {SCOPE_TITLES[scope]}
            </p>
            <ul aria-labelledby={`settings-scope-${scope}`}>
              {pages
                .filter((p) => p.scope === scope)
                .map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={p.id === current?.id ? "nav on" : "nav"}
                      aria-current={p.id === current?.id ? "page" : undefined}
                      onClick={() => onPage(p.id)}
                    >
                      {p.title}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </nav>
      <section className="settings-page" aria-labelledby="settings-page-title">
        <div className="settings-content">
          {current?.id === "project" ? (
            <ProjectPage bridge={bridge} snapshot={snapshot} title={current.title} />
          ) : (
            current && (
              <>
                <PageHeader title={current.title} />
                <AppPage id={current.id} snapshot={snapshot} onAppChange={onAppChange} shortcuts={shortcuts} />
              </>
            )
          )}
        </div>
      </section>
    </div>
  );
}

/** An App page: the user's own settings. */
function AppPage({ id, snapshot, onAppChange, shortcuts }: Pick<SettingsViewProps, "snapshot" | "onAppChange" | "shortcuts"> & {
  id: Exclude<SettingsPage, "project">;
}) {
  const app = snapshot.app;
  const setApp = (patch: Partial<AppSettings>) => onAppChange({ ...app, ...patch });
  switch (id) {
    case "general":
      return (
        snapshot.closeToTray && (
          <GeneralPage app={app} support={snapshot.closeToTray} onCloseButton={(closeButton) => setApp({ closeButton })} />
        )
      );
    case "appearance":
      return <AppearancePage theme={app.theme} onTheme={(theme) => setApp({ theme })} />;
    case "workDefaults":
      return <WorkDefaultsPage work={app.work} onChange={(work) => setApp({ work })} />;
    case "shortcuts":
      return <ShortcutsPage shortcuts={shortcuts} />;
    default: {
      const unknown: never = id;
      return unknown;
    }
  }
}
