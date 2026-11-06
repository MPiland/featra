import { useId } from "react";
import { SETUP_COPY, type InitDone } from "../project-setup.ts";

export interface SetupDoneProps {
  done: InitDone;
  onDismiss: () => void;
}

/**
 * Confirms a Featra init: what it created and what it kept (files that were already there). The paths can be many,
 * so each list is one wrapping line. An empty list isn't shown.
 */
export function SetupDone({ done, onDismiss }: SetupDoneProps) {
  const titleId = useId();
  const lists = [
    { label: SETUP_COPY.done.created, paths: done.created },
    { label: SETUP_COPY.done.kept, paths: done.kept },
  ].filter((list) => list.paths.length > 0);
  return (
    <section className="setup-offer setup-done" aria-labelledby={titleId}>
      <div className="setup-done-body">
        <h2 id={titleId}>{SETUP_COPY.done.title}</h2>
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
      <div className="placeholder-actions">
        <button type="button" className="btn" onClick={onDismiss}>
          {SETUP_COPY.done.dismiss}
        </button>
      </div>
    </section>
  );
}
