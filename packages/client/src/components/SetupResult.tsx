import type { InitResult } from "../project-setup.ts";
import { SETUP_PAGE_COPY } from "../setup-page.ts";

export interface SetupResultProps {
  result: Extract<InitResult, { ok: true }>;
  /** Why the workflow settings couldn't be saved, or null. */
  workflowError: string | null;
  onDone: () => void;
}

/**
 * The setup page's last step: what setup created and what it kept (things that were already there). The paths can
 * be many, so each list wraps; an empty list isn't shown.
 */
export function SetupResult({ result, workflowError, onDone }: SetupResultProps) {
  const copy = SETUP_PAGE_COPY.result;
  const lists = [
    { label: copy.created, paths: result.created },
    { label: copy.kept, paths: result.kept },
  ].filter((list) => list.paths.length > 0);
  return (
    <>
      <div className="setup-head">
        <h2 id="setup-title">{copy.title}</h2>
      </div>
      {workflowError && (
        <p role="alert" className="setting-error">
          {SETUP_PAGE_COPY.cantSaveWorkflow}: {workflowError}
        </p>
      )}
      <div className="settings-card setup-result">
        {lists.length === 0 && <p className="setup-result-empty">{copy.nothing}</p>}
        <dl>
          {lists.map(({ label, paths }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                {paths.map((path) => (
                  <code key={path}>{path}</code>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="setup-actions">
        <button type="button" className="btn primary" onClick={onDone}>
          {SETUP_PAGE_COPY.done}
        </button>
      </div>
    </>
  );
}
