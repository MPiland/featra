import { useContext } from "react";
import { BROWSER_COPY } from "../../browser.ts";
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
