import type { WorkSettings } from "../../settings.ts";
import { WorkSettingGroups } from "./WorkSettingGroups.tsx";

/** The App scope's Workflow page: the work settings every project uses unless it overrides them. */
export function WorkDefaultsPage({ work, onChange }: { work: WorkSettings; onChange(work: WorkSettings): void }) {
  return (
    <>
      <p className="settings-intro">Defaults for all projects.</p>
      <WorkSettingGroups scope="app" values={work} onChange={(key, value) => onChange({ ...work, [key]: value })} />
    </>
  );
}
