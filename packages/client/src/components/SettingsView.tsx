import { useEffect, useId, useRef, useState, useMemo, type KeyboardEvent, type ReactNode } from "react";
import type { FeatraBridge } from "../bridge.ts";
import { filterShortcuts, type ShortcutEntry } from "../menu.ts";
import {
  effectiveWork,
  isOverridden,
  WORK_SETTINGS,
  workValueLabel,
  type AppSettings,
  type CloseButton,
  type ProjectRef,
  type ProjectSettings,
  type SettingsSnapshot,
  type WorkSettingDef,
  type WorkSettingKey,
  type WorkSettings,
} from "../settings.ts";
import { THEME_CHOICES, type ThemeChoice } from "../theme.ts";
import { ChevronDownIcon } from "./icons.tsx";

/** Settings' pages. App pages hold the user's own settings; the Project page holds one project's overrides. */
export type SettingsPage = "general" | "appearance" | "workDefaults" | "shortcuts" | "project";

interface PageDef {
  id: SettingsPage;
  title: string;
  scope: "app" | "project";
}

/** App and Project name their work-settings page alike: the same settings, at two scopes. */
/** The work settings page: the same name at both scopes, and not a section heading inside it. */
const WORK_PAGE_TITLE = "Workflow";

const PAGES: readonly PageDef[] = [
  { id: "general", title: "General", scope: "app" },
  { id: "appearance", title: "Appearance", scope: "app" },
  { id: "workDefaults", title: WORK_PAGE_TITLE, scope: "app" },
  { id: "shortcuts", title: "Keyboard shortcuts", scope: "app" },
  { id: "project", title: WORK_PAGE_TITLE, scope: "project" },
];

/** Work settings, in titled groups. */
const WORK_GROUPS: readonly { title: string; keys: readonly WorkSettingKey[] }[] = [
  { title: "Progress and review", keys: ["progress", "requireAccept"] },
  { title: "Agents", keys: ["worktrees", "knowledge"] },
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
        <div className="settings-content">
          {current.id === "project" ? (
            <ProjectPage bridge={bridge} snapshot={snapshot} title={current.title} />
          ) : (
            <>
              <PageHeader title={current.title} />
              {current.id === "general" && snapshot.closeToTray && (
                <Group>
                  <CloseButtonSetting app={app} support={snapshot.closeToTray} onChange={(closeButton) => setApp({ closeButton })} />
                </Group>
              )}
              {current.id === "appearance" && (
                <Group>
                  <ChoiceRow
                    id="app-theme"
                    label="Theme"
                    value={app.theme}
                    choices={THEME_CHOICES.map((t) => ({ value: t, label: THEME_LABELS[t] }))}
                    onChange={(theme) => setApp({ theme })}
                  />
                </Group>
              )}
              {current.id === "workDefaults" && (
                <>
                  <p className="settings-intro">Every project uses these unless it overrides them.</p>
                  {WORK_GROUPS.map((g) => (
                    <Group key={g.title} title={g.title}>
                      {g.keys.map((key) => {
                        const def = WORK_SETTINGS.find((d) => d.key === key)!;
                        return (
                          <WorkRow
                            key={key}
                            scope="app"
                            def={def}
                            value={app.work[key]}
                            onChange={(value) => setApp({ work: { ...app.work, [key]: value } })}
                          />
                        );
                      })}
                    </Group>
                  ))}
                </>
              )}
              {current.id === "shortcuts" && <ShortcutsPage shortcuts={shortcuts} />}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="settings-header">
      <h2 id="settings-page-title">{title}</h2>
      {children}
    </div>
  );
}

/** A titled group of setting rows, drawn as one card. */
/** A card of rows; a title only where the page has more than one group. */
function Group({ title, children }: { title?: string; children: ReactNode }) {
  const id = useId();
  if (!title) return <div className="settings-group settings-card">{children}</div>;
  return (
    <section className="settings-group" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      <div className="settings-card">{children}</div>
    </section>
  );
}

interface Choice<V> {
  value: V;
  label: string;
}

/** What a row shows beside its label when a project overrides the app default. */
interface OverrideMark {
  defaultLabel: string;
  resetLabel: string;
  onReset(): void;
}

/**
 * One setting: its label and a short description on the left, the control on the right. `status` replaces nothing:
 * it is a note under the description (the reason a control is disabled).
 */
function Row(props: {
  id: string;
  label: string;
  help?: string;
  status?: string;
  override?: OverrideMark;
  children: ReactNode;
}) {
  const { id, label, help, status, override, children } = props;
  return (
    <div className="setting-row">
      <div className="setting-text">
        <div className="setting-label">
          <span id={`${id}-label`}>{label}</span>
          {override && (
            <span className="override">
              <span id={`${id}-status`} title={`App default: ${override.defaultLabel}`}>
                Overridden<span className="sr-only">. App default: {override.defaultLabel}</span>
              </span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                className="link"
                aria-label={override.resetLabel}
                title={`App default: ${override.defaultLabel}`}
                onClick={override.onReset}
              >
                Reset
              </button>
            </span>
          )}
        </div>
        {help && (
          <p className="setting-help" id={`${id}-help`}>
            {help}
          </p>
        )}
        {status && (
          <p className="setting-help" id={`${id}-status`}>
            {status}
          </p>
        )}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

const describedBy = (id: string, help: string | undefined, hasStatus: boolean) =>
  [help ? `${id}-help` : "", hasStatus ? `${id}-status` : ""].filter(Boolean).join(" ") || undefined;

/**
 * A segmented control: a radio group drawn as joined buttons. Tab reaches the chosen option, the arrow keys change
 * it, as with any radio group.
 */
function ChoiceRow<V extends string>(props: {
  id: string;
  label: string;
  help?: string;
  value: V;
  choices: readonly Choice<V>[];
  onChange(value: V): void;
  disabled?: boolean;
  status?: string;
  override?: OverrideMark;
}) {
  const { id, label, help, value, choices, onChange, disabled, status, override } = props;
  return (
    <Row id={id} label={label} help={help} status={status} override={override}>
      <div
        className="segmented"
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        aria-describedby={describedBy(id, help, Boolean(status || override))}
        aria-disabled={disabled || undefined}
      >
        {choices.map((c) => (
          <label key={c.value} className="segment">
            <input
              type="radio"
              id={`${id}-${c.value}`}
              name={id}
              value={c.value}
              checked={value === c.value}
              disabled={disabled}
              onChange={() => onChange(c.value)}
            />
            <span>{c.label}</span>
          </label>
        ))}
      </div>
    </Row>
  );
}

/** An on/off switch: Tab reaches it, Space or Enter flips it. */
function SwitchRow(props: {
  id: string;
  label: string;
  help?: string;
  value: boolean;
  onChange(value: boolean): void;
  disabled?: boolean;
  override?: OverrideMark;
}) {
  const { id, label, help, value, onChange, disabled, override } = props;
  return (
    <Row id={id} label={label} help={help} override={override}>
      <button
        type="button"
        role="switch"
        id={id}
        className="switch"
        aria-checked={value}
        aria-labelledby={`${id}-label`}
        aria-describedby={describedBy(id, help, Boolean(override))}
        disabled={disabled}
        onClick={() => onChange(!value)}
      >
        <span className="switch-thumb" aria-hidden="true" />
      </button>
    </Row>
  );
}

function WorkRow({
  scope,
  def,
  value,
  onChange,
  disabled,
  override,
}: {
  scope: "app" | "project";
  def: WorkSettingDef;
  value: WorkSettings[WorkSettingKey];
  onChange(value: WorkSettings[WorkSettingKey]): void;
  disabled?: boolean;
  override?: OverrideMark;
}) {
  const id = `${scope}-${def.key}`;
  if (def.kind === "toggle") {
    return <SwitchRow id={id} label={def.label} help={def.help} value={value as boolean} {...{ onChange, disabled, override }} />;
  }
  return (
    <ChoiceRow
      id={id}
      label={def.label}
      help={def.help}
      value={value as string}
      choices={def.choices}
      onChange={(v) => onChange(v as WorkSettings[WorkSettingKey])}
      disabled={disabled}
      override={override}
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
    <ChoiceRow
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
      status={support.available ? undefined : support.reason}
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
        <section key={area} className="settings-group">
          <h3 aria-hidden="true">{area}</h3>
          <div className="settings-card">
            <table className="shortcuts" aria-label={area}>
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
          </div>
        </section>
      ))}
      <p role="status" className="settings-intro">
        {shown.length === 0 ? `No shortcuts match “${query.trim()}”.` : ""}
      </p>
    </>
  );
}

/**
 * The app's own dropdown: a button that opens a list box. Enter, Space or the arrows open it; the arrows, Home and
 * End move; Enter or Space chooses; Escape closes. Focus comes back to the button.
 */
function Dropdown({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange(value: string): void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const selected = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const outside = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  const show = () => {
    setActive(selected);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const choose = (i: number) => {
    onChange(options[i]!.value);
    close();
  };
  const onButtonKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      show();
    }
  };
  const onListKey = (e: KeyboardEvent) => {
    const last = options.length - 1;
    const moves: Record<string, () => void> = {
      ArrowDown: () => setActive((i) => Math.min(last, i + 1)),
      ArrowUp: () => setActive((i) => Math.max(0, i - 1)),
      Home: () => setActive(0),
      End: () => setActive(last),
      Enter: () => choose(active),
      " ": () => choose(active),
      Escape: close,
    };
    if (e.key === "Tab") return setOpen(false);
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    e.stopPropagation(); // Escape here closes the list, not anything behind it
    move();
  };

  return (
    <div className="dropdown" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="dropdown-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={onButtonKey}
      >
        {name}: {options[selected]?.label}
        <ChevronDownIcon />
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          className="dropdown-list"
          role="listbox"
          aria-label={name}
          tabIndex={-1}
          aria-activedescendant={`${id}-opt-${active}`}
          onKeyDown={onListKey}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === selected}
              className={i === active ? "active" : undefined}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectPicker({ projects, dir, onChange }: { projects: readonly ProjectRef[]; dir: string; onChange(dir: string): void }) {
  return <Dropdown name="Project" value={dir} options={projects.map((p) => ({ value: p.dir, label: p.name }))} onChange={onChange} />;
}

function ProjectPage({ bridge, snapshot, title }: { bridge: FeatraBridge; snapshot: SettingsSnapshot; title: string }) {
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
    return (
      <>
        <PageHeader title={title} />
        <p className="settings-intro">No project is open. Featra opens the project folder it was started in.</p>
      </>
    );
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
    page.current?.querySelector<HTMLElement>(`#project-${key}, #project-${key}-${String(defaults[key])}`)?.focus();
  };

  return (
    <div ref={page} aria-busy={!project}>
      <PageHeader title={title}>
        <ProjectPicker projects={snapshot.projects} dir={dir} onChange={setDir} />
      </PageHeader>
      <p className="settings-intro">
        <span title="Stored in the project's .featra/config.yaml">Saved with this project (shared through git).</span>
      </p>
      {project?.error && (
        <p role="alert" className="setting-error">
          Featra can't change this project's settings: {project.error}
        </p>
      )}
      {WORK_GROUPS.map((g) => (
        <Group key={g.title} title={g.title}>
          {g.keys.map((key) => {
            const def = WORK_SETTINGS.find((d) => d.key === key)!;
            return (
              <WorkRow
                key={key}
                scope="project"
                def={def}
                value={values[key]}
                disabled={!project || project.error !== null}
                onChange={(value) => void set(key, value)}
                override={
                  isOverridden(overrides, key)
                    ? {
                        defaultLabel: workValueLabel(key, defaults[key]),
                        resetLabel: `Reset ${def.label} to the app default`,
                        onReset: () => void reset(key),
                      }
                    : undefined
                }
              />
            );
          })}
        </Group>
      ))}
    </div>
  );
}
