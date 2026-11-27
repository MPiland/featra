import { useContext } from "react";
import { BROWSER_COPY } from "../../browser.ts";
import type { CardBridge } from "../../card-pane.ts";
import { useCard } from "../work/useCard.ts";
import { OpenBrowserContext } from "./browser-context.tsx";

/** Browser (STORY-74): opens a story's or feature's running app in the Browser pane, or closes the pane showing it. */
export function BrowserButton({ id }: { id: string }) {
  const opener = useContext(OpenBrowserContext);
  if (!opener) return null;
  const shown = opener.shown === id;
  return (
    <button
      type="button"
      className="review-draft"
      aria-expanded={shown}
      aria-controls={shown ? opener.paneId : undefined}
      onClick={() => opener.toggle(id)}
    >
      {BROWSER_COPY.open}
    </button>
  );
}

/**
 * Browser in a chat's header: shown only when the card can be served (its view says `browser`), as the card pane's
 * own Browser is: a story with its own worktree, or a feature in progress.
 */
export function CardBrowserButton({ work, dir, id }: { work: CardBridge; dir: string; id: string }) {
  const { view } = useCard(work, dir, id);
  return view?.browser ? <BrowserButton id={id} /> : null;
}
