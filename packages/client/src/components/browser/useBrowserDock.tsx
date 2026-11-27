import { useCallback, useContext, useId, useMemo, useRef, useState } from "react";
import { BROWSER_COPY } from "../../browser.ts";
import { BROWSER_WIDTH, PANE_WIDTH, paneWidthFor } from "../../pane-width.ts";
import { PaneHandle } from "../work/PaneHandle.tsx";
import { BrowserHostContext, type BrowserOpener } from "./browser-context.tsx";
import { BrowserPane } from "./BrowserPane.tsx";

/**
 * The Browser pane docked at the right of Work or of a chat (STORY-74, ADR 0047), beside the card pane when that is
 * open: its handle, then the pane, at the width the user chose, fitted to the area so the card pane and the list keep
 * their minimums. The host passes `reserve` to `useDockedPane`, and renders `pane(split)` after the card pane.
 */
export function useBrowserDock(dir: string, cardOpen: boolean) {
  const browser = useContext(BrowserHostContext);
  const [shown, setShown] = useState<string | null>(null);
  // The width while the handle is dragged; kept in the UI state when the drag ends.
  const [dragged, setDragged] = useState<number | null>(null);
  // Where focus goes back to when the pane closes: what opened it.
  const opener = useRef<HTMLElement | null>(null);
  const paneId = useId();
  // The area the Browser pane may take: the card pane, when open, keeps its minimum.
  const areaOf = (split: number) => split - (cardOpen ? PANE_WIDTH.min : 0);
  const chosen = dragged ?? browser?.width.chosen ?? null;
  const widthIn = (split: number) => paneWidthFor(chosen, areaOf(split), BROWSER_WIDTH);
  const reserve = (split: number) => (shown && browser ? widthIn(split) : 0);

  const close = useCallback(() => {
    setShown(null);
    const to = opener.current;
    opener.current = null;
    if (to?.isConnected) to.focus();
  }, []);
  const toggle = useCallback(
    (id: string) => {
      if (shown === id) return close();
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setShown(id);
    },
    [shown, close],
  );
  const openerValue = useMemo<BrowserOpener | null>(
    () => (browser ? { shown, paneId, toggle } : null),
    [browser, shown, paneId, toggle],
  );

  const pane = (split: number) => {
    if (!shown || !browser) return null;
    const width = widthIn(split);
    return (
      <>
        <PaneHandle
          width={width}
          split={areaOf(split)}
          spec={BROWSER_WIDTH}
          label={BROWSER_COPY.resize}
          paneId={paneId}
          onMove={setDragged}
          onChoose={(w) => {
            setDragged(null);
            browser.width.choose(w);
          }}
          onClose={close}
        />
        <BrowserPane key={shown} browser={browser} dir={dir} id={shown} paneId={paneId} width={width} onClose={close} />
      </>
    );
  };
  return { opener: openerValue, reserve, pane };
}
