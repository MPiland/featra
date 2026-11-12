import { createContext, useContext, type MouseEvent } from "react";
import { prLabel, type PrStatus } from "@featra/work-format/prs";
import { PR_COPY } from "../../card-pane.ts";

/** Opens a link in the OS browser (the host's `app.openExternal`); App provides it. Default: nothing opens. */
export const ExternalLinkContext = createContext<(url: string) => void>(() => {});

/**
 * A story's PR chip (STORY-11): the PR number as a link to the PR, its full URL on hover, then the PR's state and its
 * checks as last read. Before the first read, or in local mode, the link stands alone. `compact` (the Work row) shows
 * the checks as a mark that says itself on hover and to screen readers.
 */
export function PrChip({ url, status, compact = false }: { url: string; status?: PrStatus | null; compact?: boolean }) {
  const openExternal = useContext(ExternalLinkContext);
  const open = (e: MouseEvent) => {
    e.preventDefault();
    openExternal(url);
  };
  const checks = status && status.checks !== "none" ? status.checks : null;
  return (
    <span className="pr-chip">
      <a href={url} title={url} onClick={open}>
        {prLabel(url)}
      </a>
      {status && <span className={`pr-state pr-${status.state}`}>{PR_COPY.state[status.state]}</span>}
      {checks &&
        (compact ? (
          <span
            className={`pr-checks checks-${checks}`}
            role="img"
            aria-label={PR_COPY.checks[checks]}
            title={PR_COPY.checks[checks]}
          >
            {PR_COPY.mark[checks]}
          </span>
        ) : (
          <span className={`pr-checks checks-${checks}`}>{PR_COPY.checks[checks]}</span>
        ))}
    </span>
  );
}
