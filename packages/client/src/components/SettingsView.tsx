import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { FeatraBridge } from "../bridge.ts";
import { filterShortcuts, type ShortcutEntry } from "../menu.ts";
import {
  effectiveWork,
  isOverridden,
  WORK_SETTINGS,
  workValueLabel,
  type AppSettings,
  type CloseButton,
  type ProjectSettings,
  type SettingsSnapshot,
  type WorkSettingDef,
  type WorkSettingKey,
  type WorkSettings,
} from "../settings.ts";
import { THEME_CHOICES, type ThemeChoice } from "../theme.ts";

/** Settings' pages. App pages hold the user's own settings; the Project page holds one project's overrides. */
export type SettingsPage = "general" | "appearance" | "workDefaults" | "shortcuts" | "project";

interface PageDef {
  id: SettingsPage;
  title: string;
  scope: "app" | "project";
}

const PAGES: readonly PageDef[] = [
  { id: "general", title: "General", scope: "app" },
  { id: "appearance", title: "Appearance", scope: "app" },
  { id: "workDefaults", title: "Work defaults", scope: "app" },
  { id: "shortcuts", title: "Keyboard shortcuts", scope: "app" },
  { id: "project", title: "Work", scope: "project" },
];

/** General holds only the close button, which a browser tab doesn't have: there the page is left out. */
export function settingsPages(snapshot: SettingsSnapshot): readonly PageDef[] {
  return PAGES.filter((p) => p.id !== "general" || snapshot.closeToTray !== null);
}

export function firstSettingsPage(snapshot: SettingsSnapshot): SettingsPage {
  return settingsPages(snapshot)[0]!.id;
}

export interface SettingsViewProps {
  bridge: FeatraBridge;
  snapshot: SettingsSnapshot;
  page: SettingsPage;
  onPage(page: SettingsPage): void;
  onAppChange(settings: AppSettings): void;
  shortcuts: readonly ShortcutEntry[];
}

const THEME_LABELS: Record<ThemeChoice, string> = { system: "System", light: "Light", dark: "Dark" };

export function SettingsView({ bridge, snapshot, page, onPage, onAppChange, shortcuts }: SettingsViewProps) {
  const pages = settingsPages(snapshot);
  const current = pages.find((p) => p.id === page) ?? pages[0]!;
  const app = snapshot.app;
  const setApp = (patch: Partial<AppSettings>) => onAppChange({ ...app, ...patch });

  return (
    <div className="settings">
      <nav className="settings-nav" aria-label="Settings pages">
        {(["app", "project"] as const).map((scope) => (
          <div key={scope} className="settings-scope">
            <p className="settings-scope-title" id={`settings-scope-${scope}`}>
              {scope === "app" ? "App" : "Project"}
            </p>
            <ul aria-labelledby={`settings-scope-${scope}`}>
              {pages
                .filter((p) => p.scope === scope)
                .map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={p.id === current.id ? "nav on" : "nav"}
                      aria-current={p.id === current.id ? "page" : undefined}
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
        <h2 id="settings-page-title">{current.title}</h2>
        {current.id === "general" && snapshot.closeToTray && (
          <CloseButtonSetting app={app} support={snapshot.closeToTray} onChange={(closeButton) => setApp({ closeButton })} />
        )}
        {current.id === "appearance" && (
          <ChoiceSetting
            id="app-theme"
            label="Theme"
            help="System follows your computer's light or dark mode."
            value={app.theme}
            choices={THEME_CHOICES.map((t) => ({ value: t, label: THEME_LABELS[t] }))}
            onChange={(theme) => setApp({ theme })}
          />
        )}
        {current.id === "workDefaults" && (
          <>
            <p className="settings-intro">Every project uses these unless its own settings override them.</p>
            {WORK_SETTINGS.map((def) => (
              <WorkSetting
                key={def.key}
                scope="app"
                def={def}
                value={app.work[def.key]}
                onChange={(value) => setApp({ work: { ...app.work, [def.key]: value } })}
              />
            ))}
          </>
        )}
        {current.id === "shortcuts" && <ShortcutsPage shortcuts={shortcuts} />}
        {current.id === "project" && <ProjectPage bridge={bridge} snapshot={snapshot} />}
      </section>
    </div>
  );
}

interface Choice<V> {
  value: V;
  label: string;
}

/** A radio group: Tab reaches the chosen option, the arrow keys change it. */
function ChoiceSetting<V extends string>(props: {
  id: string;
  label: string;
  help?: string;
  value: V;
  choices: readonly Choice<V>[];
  onChange(value: V): void;
  disabled?: boolean;
  status?: ReactNode;
}) {
  const { id, label, help, value, choices, onChange, disabled, status } = props;
  return (
    <fieldset className="setting" role="radiogroup" aria-describedby={describedBy(id, help, status)} disabled={disabled}>
      <legend>{label}</legend>
      {help && (
        <p className="setting-help" id={`${id}-help`}>
          {help}
        </p>
      )}
      <div className="choices">
        {choices.map((c) => (
          <label key={c.value} className="choice">
            <input
              type="radio"
              id={`${id}-${c.value}`}
              name={id}
              value={c.value}
              checked={value === c.value}
              disabled={disabled}
              onChange={() => onChange(c.value)}
            />
            {c.label}
          </label>
        ))}
      </div>
      {status}
    </fieldset>
  );
}

/** A checkbox: Tab reaches it, Space changes it. */
function ToggleSetting(props: {
  id: string;
  label: string;
  help?: string;
  value: boolean;
  onChange(value: boolean): void;
  disabled?: boolean;
  status?: ReactNode;
}) {
  const { id, label, help, value, onChange, disabled, status } = props;
  return (
    <div className="setting">
      <label className="toggle">
        <input
          type="checkbox"
          id={id}
          checked={value}
          disabled={disabled}
          aria-describedby={describedBy(id, help, status)}
          onChange={(e) => onChange(e.currentTarget.checked)}
        />
        {label}
      </label>
      {help && (
        <p className="setting-help" id={`${id}-help`}>
          {help}
        </p>
      )}
      {status}
    </div>
  );
}

const describedBy = (id: string, help: string | undefined, status: ReactNode) =>
  [help ? `${id}-help` : "", status ? `${id}-status` : ""].filter(Boolean).join(" ") || undefined;

function WorkSetting({
  scope,
  def,
  value,
  onChange,
  disabled,
  status,
}: {
  scope: "app" | "project";
  def: WorkSettingDef;
  value: WorkSettings[WorkSettingKey];
  onChange(value: WorkSettings[WorkSettingKey]): void;
  disabled?: boolean;
  status?: ReactNode;
}) {
  const id = `${scope}-${def.key}`;
  if (def.kind === "toggle") {
    return <ToggleSetting id={id} label={def.label} help={def.help} value={value as boolean} {...{ onChange, disabled, status }} />;
  }
  return (
    <ChoiceSetting
      id={id}
      label={def.label}
      help={def.help}
      value={value as string}
      choices={def.choices}
      onChange={(v) => onChange(v as WorkSettings[WorkSettingKey])}
      disabled={disabled}
      status={status}
    />
  );
}

function CloseButtonSetting({
  app,
  support,
  onChange,
}: {
  app: AppSettings;
  support: NonNullable<SettingsSnapshot["closeToTray"]>;
  onChange(value: CloseButton): void;
}) {
  const keep = support.available && support.place === "dock" ? "Keep running in the Dock" : "Keep running in the tray";
  return (
    <ChoiceSetting
      id="app-closeButton"
      label="Close button"
      help="Agent sessions keep working while Featra runs in the background."
      // Without a tray, close always quits: show what really happens rather than a choice that does nothing.
      value={support.available ? app.closeButton : "quit"}
      choices={[
        { value: "tray", label: keep },
        { value: "quit", label: "Quit Featra" },
      ]}
      onChange={onChange}
      disabled={!support.available}
      status={
        !support.available && (
          <p className="setting-status" id="app-closeButton-status">
            {support.reason}
          </p>
        )
      }
    />
  );
}

function ShortcutsPage({ shortcuts }: { shortcuts: readonly ShortcutEntry[] }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => filterShortcuts(shortcuts, query), [shortcuts, query]);
  const areas = [...new Set(shown.map((s) => s.area))];
  return (
    <>
      <input
        type="search"
        className="settings-search"
        aria-label="Search shortcuts"
        placeholder="Search shortcuts"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
      />
      {areas.map((area) => (
        <table key={area} className="shortcuts" aria-label={area}>
          <caption>{area}</caption>
          <tbody>
            {shown
              .filter((s) => s.area === area)
              .map((s) => (
                <tr key={s.name}>
                  <th scope="row">{s.name}</th>
                  <td>
                    <kbd>{s.keys}</kbd>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      ))}
      <p role="status" className="settings-intro">
        {shown.length === 0 ? `No shortcuts match “${query.trim()}”.` : ""}
      </p>
    </>
  );
}

function ProjectPage({ bridge, snapshot }: { bridge: FeatraBridge; snapshot: SettingsSnapshot }) {
  const pickerId = useId();
  const [dir, setDir] = useState(snapshot.currentProject?.dir ?? snapshot.projects[0]?.dir ?? null);
  const [project, setProject] = useState<ProjectSettings | null>(null);
  const page = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dir) return;
    let live = true;
    setProject(null);
    void bridge.settings.loadProject(dir).then((p) => live && setProject(p));
    return () => {
      live = false;
    };
  }, [bridge, dir]);

  if (!dir) {
    return <p className="settings-intro">No project is open. Featra opens the project folder it was started in.</p>;
  }
  const defaults = snapshot.app.work;
  const overrides = project?.overrides ?? {};
  const values = effectiveWork(defaults, overrides);
  const set = async (key: WorkSettingKey, value: WorkSettings[WorkSettingKey] | null) => {
    // Show the change at once; what the file then holds replaces it.
    setProject((p) => {
      if (!p) return p;
      const { [key]: _old, ...rest } = p.overrides;
      return { ...p, overrides: value === null ? rest : { ...rest, [key]: value } };
    });
    setProject(await bridge.settings.setProjectValue(dir, key, value as never));
  };
  const reset = async (key: WorkSettingKey) => {
    await set(key, null);
    // The Reset button goes away with the override: keep keyboard focus on the setting instead of losing it.
    page.current?.querySelector<HTMLInputElement>(`#project-${key}, #project-${key}-${String(defaults[key])}`)?.focus();
  };

  return (
    <div ref={page}>
      <div className="setting picker">
        <label htmlFor={pickerId}>Project</label>
        <select id={pickerId} value={dir} onChange={(e) => setDir(e.currentTarget.value)}>
          {snapshot.projects.map((p) => (
            <option key={p.dir} value={p.dir}>
              {p.name}
            </option>
          ))}
        </select>
        <p className="setting-help">Saved in this project's .featra/config.yaml.</p>
      </div>
      {project?.error && (
        <p role="alert" className="setting-error">
          Featra can't change this project's settings: {project.error}
        </p>
      )}
      {WORK_SETTINGS.map((def) => {
        const overridden = isOverridden(overrides, def.key);
        const label = def.label;
        return (
          <WorkSetting
            key={def.key}
            scope="project"
            def={def}
            value={values[def.key]}
            disabled={!project || project.error !== null}
            onChange={(value) => void set(def.key, value)}
            status={
              <div className="setting-status" id={`project-${def.key}-status`}>
                {overridden ? (
                  <>
                    <span className="badge">Override</span>
                    <span>App default: {workValueLabel(def.key, defaults[def.key])}</span>
                    <button
                      type="button"
                      className="btn small"
                      aria-label={`Reset ${label} to the app default`}
                      onClick={() => void reset(def.key)}
                    >
                      Reset
                    </button>
                  </>
                ) : (
                  <span>App default</span>
                )}
              </div>
            }
          />
        );
      })}
    </div>
  );
}
