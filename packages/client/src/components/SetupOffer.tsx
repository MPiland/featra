import { SETUP_COPY, type ProjectSetup } from "../project-setup.ts";

export interface SetupOfferProps {
  setup: ProjectSetup;
  /** An init is running: the buttons wait. */
  busy: boolean;
  /** Why the last init failed, or null. */
  error: string | null;
  onInitGit: () => void;
  onInitFeatra: () => void;
  onDismiss: () => void;
}

/**
 * Offers the next setup step for the current project: git init for a plain folder, Featra init for a repository
 * without `.featra/`. A status that couldn't be read shows why. Nothing shows for a project that is set up.
 */
export function SetupOffer({ setup, busy, error, onInitGit, onInitFeatra, onDismiss }: SetupOfferProps) {
  let message: string;
  let action: { label: string; run: () => void } | null = null;
  switch (setup.state) {
    case "ready":
      return null;
    case "no-git":
      message = SETUP_COPY["no-git"].message;
      action = { label: SETUP_COPY["no-git"].action, run: onInitGit };
      break;
    case "no-featra":
      message = SETUP_COPY["no-featra"].message;
      action = { label: SETUP_COPY["no-featra"].action, run: onInitFeatra };
      break;
    case "error":
      message = `Can't check this project: ${setup.error}`;
      break;
    default:
      return setup satisfies never;
  }
  return (
    <section className="setup-offer" aria-label={SETUP_COPY.region} aria-busy={busy}>
      <p>{message}</p>
      <p className="setup-error" role="alert">
        {error}
      </p>
      <div className="placeholder-actions">
        {action && (
          <button type="button" className="btn primary" disabled={busy} onClick={action.run}>
            {action.label}
          </button>
        )}
        <button type="button" className="btn" onClick={onDismiss}>
          {SETUP_COPY.notNow}
        </button>
      </div>
    </section>
  );
}
