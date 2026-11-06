import { useEffect, useRef, useState } from "react";
import type { FeatraBridge } from "../../bridge.ts";
import {
  effectiveWork,
  isOverridden,
  workSettingDef,
  workValueLabel,
  type ProjectSettings,
  type SettingsSnapshot,
  type WorkSettingKey,
  type WorkSettings,
} from "../../settings.ts";
import { resetLabel } from "../../settings-pages.ts";
import { Dropdown } from "../controls/Dropdown.tsx";
import { PageHeader } from "./PageHeader.tsx";
import { WorkSettingGroups } from "./WorkSettingGroups.tsx";

export interface ProjectPageProps {
  bridge: FeatraBridge;
  snapshot: SettingsSnapshot;
  title: string;
}

/** The Project scope's Workflow page: one project's work settings, each either the app default or an override. */
export function ProjectPage({ bridge, snapshot, title }: ProjectPageProps) {
  const [dir, setDir] = useState(snapshot.currentProject?.dir ?? snapshot.projects[0]?.dir ?? null);
  // Settings are kept with the folder they were read from, so switching folders shows nothing until the new one loads.
  const [loaded, setLoaded] = useState<{ dir: string; settings: ProjectSettings } | null>(null);
  const project = loaded && loaded.dir === dir ? loaded.settings : null;
  const page = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    if (dir) {
      void bridge.settings.loadProject(dir).then((settings) => {
        if (live) setLoaded({ dir, settings });
      });
    }
    return () => {
      live = false;
    };
  }, [bridge, dir]);

  if (!dir) {
    return (
      <>
        <PageHeader title={title} />
        <p className="settings-intro">No project is open.</p>
      </>
    );
  }
  const defaults = snapshot.app.work;
  const overrides = project?.overrides ?? {};
  const set = async (key: WorkSettingKey, value: WorkSettings[WorkSettingKey] | null) => {
    // Show the change at once; what the file then holds replaces it.
    setLoaded((l) => {
      if (l?.dir !== dir) return l;
      const { [key]: _old, ...rest } = l.settings.overrides;
      return { dir, settings: { ...l.settings, overrides: value === null ? rest : { ...rest, [key]: value } } };
    });
    const settings = await bridge.settings.setProjectValue(dir, key, value);
    setLoaded({ dir, settings });
  };
  const reset = async (key: WorkSettingKey) => {
    await set(key, null);
    // The Reset button goes away with the override: keep keyboard focus on the setting instead of losing it.
    page.current?.querySelector<HTMLElement>(`#project-${key}, #project-${key}-${String(defaults[key])}`)?.focus();
  };

  return (
    <div ref={page} aria-busy={!project}>
      <PageHeader title={title}>
        <Dropdown
          name="Project"
          value={dir}
          options={snapshot.projects.map((p) => ({ value: p.dir, label: p.name }))}
          onChange={setDir}
        />
      </PageHeader>
      <p className="settings-intro">
        <span title="Stored in the project's .featra/config.yaml">Saved in the project, shared through git.</span>
      </p>
      {project?.error && (
        <p role="alert" className="setting-error">
          Can't read project settings: {project.error}
        </p>
      )}
      <WorkSettingGroups
        scope="project"
        values={effectiveWork(defaults, overrides)}
        disabled={!project || project.error !== null}
        onChange={(key, value) => void set(key, value)}
        override={(key) =>
          isOverridden(overrides, key)
            ? {
                defaultLabel: workValueLabel(key, defaults[key]),
                resetLabel: resetLabel(workSettingDef(key).label),
                onReset: () => void reset(key),
              }
            : undefined
        }
      />
    </div>
  );
}
