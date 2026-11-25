import { createContext, useContext } from "react";
import { PROOF_COPY } from "@featra/work-format/proof";
import type { PreviewResult } from "../../card-pane.ts";
import { useAction } from "./useAction.ts";

/** Opens a story's dev server in a Featra window (the host's `app.openPreview`); App provides it. */
export const OpenPreviewContext = createContext<(url: string, title: string) => void>(() => {});

/**
 * Preview (STORY-25): in the card pane of a story whose project's proof offers it, it starts the story's dev server in
 * its worktree, or reuses the running one, and opens it in a Featra window. A dev server that doesn't start says why
 * next to the button, with its last output.
 */
export function PreviewStory({ id, preview }: { id: string; preview: (id: string) => Promise<PreviewResult> }) {
  const open = useContext(OpenPreviewContext);
  const { busy, error, run } = useAction();
  return (
    <span className="story-action">
      <button
        type="button"
        className="review-draft"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const r = await preview(id);
            if (r.ok) open(r.url, PROOF_COPY.previewTitle(id));
            return r;
          })
        }
      >
        {PROOF_COPY.preview}
      </button>
      {error && (
        <span className="card-error proof-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
