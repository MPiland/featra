import type { ReactNode } from "react";
import type { FeatraBridge } from "../bridge.ts";
import type { SetupItemId } from "../project-setup.ts";
import type { WorkSettings } from "../settings.ts";
import { SETUP_PAGE_COPY, setupRows, type SetupRow } from "../setup-page.ts";
import { Checkbox } from "./controls/Checkbox.tsx";
import { SettingRow } from "./controls/SettingRow.tsx";
import { ProjectWorkGroups } from "./settings/ProjectWorkGroups.tsx";
import { SettingsGroup } from "./settings/SettingsGroup.tsx";
import { SetupResult } from "./SetupResult.tsx";
import { useSetupPage } from "./useSetupPage.tsx";

export interface ProjectSetupPageProps {
  bridge: FeatraBridge;
  dir: string;
  /** The app's work defaults: what the project's workflow settings start from. */
  defaults: WorkSettings;
  onSkip: () => void;
  onDone: () => void;
}

/** One section of the page. STORY-33 adds more (role presets, agent instructions, artifacts, acceptance proof). */
interface SetupSection {
  id: string;
  title: string;
  intro?: string;
  body: ReactNode;
}

/**
 * Sets a project up on one screen (STORY-42): git and the Featra folder (required), the knowledge files to add, a
 * starter `.gitignore` when there is none, and the project's workflow settings. One Set up does it all, then the page
 * shows what it created and kept.
 */
export function ProjectSetupPage({ bridge, dir, defaults, onSkip, onDone }: ProjectSetupPageProps) {
  const { phase, choice, overrides, retry, toggle, setValue, setUp } = useSetupPage(bridge, dir);
  const copy = SETUP_PAGE_COPY;
  const skip = (
    <button type="button" className="btn" onClick={onSkip}>
      {copy.skip}
    </button>
  );

  let content: ReactNode;
  switch (phase.kind) {
    case "loading":
      content = (
        <>
          <Head />
          <p className="settings-intro">{copy.loading}</p>
        </>
      );
      break;
    case "error":
      content = (
        <>
          <Head />
          <p role="alert" className="setting-error">
            {copy.cantCheck}: {phase.error}
          </p>
          <div className="setup-actions">
            {skip}
            <button type="button" className="btn primary" onClick={retry}>
              {copy.retry}
            </button>
          </div>
        </>
      );
      break;
    case "offer": {
      const rows = setupRows(phase.plan);
      const item = (r: SetupRow) => (
        <ItemRow
          key={r.id}
          row={r}
          chosen={r.id !== "git" && choice.has(r.id)}
          disabled={phase.running}
          onToggle={toggle}
        />
      );
      const sections: SetupSection[] = [
        { id: "repository", title: copy.sections.repository, body: rows.repository.map(item) },
        { id: "knowledge", title: copy.sections.knowledge, body: rows.knowledge.map(item) },
        {
          id: "workflow",
          title: copy.sections.workflow,
          intro: copy.workflowIntro,
          body: (
            <ProjectWorkGroups
              defaults={defaults}
              overrides={overrides}
              disabled={phase.running}
              groupLevel={4}
              onSet={setValue}
            />
          ),
        },
      ];
      content = (
        <>
          <Head intro={copy.intro} />
          {sections.map((s) => (
            <section key={s.id} className="setup-section" aria-labelledby={`setup-${s.id}`}>
              <h3 id={`setup-${s.id}`}>{s.title}</h3>
              {s.intro && <p className="setup-section-intro">{s.intro}</p>}
              {s.id === "workflow" ? s.body : <SettingsGroup>{s.body}</SettingsGroup>}
            </section>
          ))}
          <p className="setup-error" role="alert">
            {phase.error}
          </p>
          <div className="setup-actions">
            {skip}
            <button type="button" className="btn primary" disabled={phase.running} onClick={() => void setUp()}>
              {phase.running ? copy.settingUp : copy.setUp}
            </button>
          </div>
        </>
      );
      break;
    }
    case "done":
      content = <SetupResult result={phase.result} workflowError={phase.workflowError} onDone={onDone} />;
      break;
    default:
      content = phase satisfies never;
  }

  return (
    // Work for this project, as the list would be: the same view and project marks.
    <div className="setup-page" data-view="work" data-project={dir}>
      <section
        className="setup-content"
        aria-labelledby="setup-title"
        aria-busy={phase.kind === "loading" || (phase.kind === "offer" && phase.running)}
      >
        {content}
      </section>
    </div>
  );
}

function Head({ intro }: { intro?: string }) {
  return (
    <div className="setup-head">
      <h2 id="setup-title">{SETUP_PAGE_COPY.title}</h2>
      {intro && <p className="settings-intro">{intro}</p>}
    </div>
  );
}

/** One thing setup can add: a checkbox, locked on when it is required or already there (with why beside it). */
function ItemRow(props: {
  row: SetupRow;
  chosen: boolean;
  disabled: boolean;
  onToggle: (id: SetupItemId, on: boolean) => void;
}) {
  const { row, chosen, disabled, onToggle } = props;
  const id = `setup-item-${row.id}`;
  const locked = row.state !== "choice";
  const tag = row.state === "required" ? SETUP_PAGE_COPY.required : row.state === "kept" ? SETUP_PAGE_COPY.kept : null;
  return (
    <SettingRow id={id} label={row.label} help={row.help}>
      {(aria) => (
        <span className="setup-item-control">
          {tag && (
            <span className={`setup-tag ${row.state}`} id={`${id}-tag`}>
              {tag}
            </span>
          )}
          <Checkbox
            id={id}
            checked={locked || chosen}
            disabled={locked || disabled}
            onChange={(on) => row.id !== "git" && onToggle(row.id, on)}
            labelledBy={aria.labelledBy}
            describedBy={[aria.describedBy, tag ? `${id}-tag` : ""].filter(Boolean).join(" ") || undefined}
          />
        </span>
      )}
    </SettingRow>
  );
}
