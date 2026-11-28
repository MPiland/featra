import { useEffect, useMemo, useRef, useState } from "react";
import { ANNOTATE_COPY, NO_ANNOTATIONS, type AnnotationsState } from "../../annotations.ts";
import { BLANK_STATE, BROWSER_COPY, type BrowserBridge, type BrowserState } from "../../browser.ts";
import { ConfirmAsk } from "../work/ConfirmAsk.tsx";
import { DockedAside } from "../work/DockedAside.tsx";
import { AddressBar } from "./AddressBar.tsx";
import { AnnotationPanel } from "./AnnotationPanel.tsx";
import type { BrowserHostValue } from "./browser-context.tsx";
import { BrowserViewport } from "./BrowserViewport.tsx";
import { DeviceToolbar } from "./DeviceToolbar.tsx";

/** Where the pane's dev server is: installing its dependencies, starting, serving at its URL, or not started, and why. */
type Serving = { url: string | null; error: string | null; installing: boolean };

/**
 * This page load's own mark in each pane key: the server knows a pane by its key, so one reloaded page's keys never
 * name another load's panes.
 */
const LOAD =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
let opened = 0;

/**
 * The pane's page: its own view in the host, the story's or feature's dev server started for it and shown in it, and
 * both let go when the pane closes (STORY-74). The view and the server are the pane's while it is mounted. An address
 * the user goes to is theirs: the dev server coming up later doesn't take the page back.
 */
function useBrowserPage(host: BrowserBridge, dir: string, id: string) {
  const [key] = useState(() => `browser-${LOAD}-${++opened}`);
  const [state, setState] = useState<BrowserState>(BLANK_STATE);
  const [serving, setServing] = useState<Serving>({ url: null, error: null, installing: false });
  const [navigated, setNavigated] = useState(false);
  const userPage = useRef(false);
  useEffect(() => {
    // Whether the pane is still mounted, as a late answer lands.
    const live = { now: true };
    host.open(key, { dir, id });
    const off = host.onState((k, s) => {
      if (k === key) setState(s);
    });
    void (async () => {
      let r = await host.start(dir, id, key);
      if (live.now && r.ok && "installing" in r) {
        setServing({ url: null, error: null, installing: true });
        r = await host.start(dir, id, key);
      }
      if (!live.now) return;
      if (!r.ok) return setServing({ url: null, error: r.error, installing: false });
      if (!("url" in r)) return;
      setServing({ url: r.url, error: null, installing: false });
      if (!userPage.current) host.navigate(key, r.url);
    })();
    return () => {
      live.now = false;
      off();
      host.close(key);
      void host.stop(dir, id, key);
    };
  }, [host, key, dir, id]);
  // The address bar's navigation marks the page as the user's.
  const pageHost = useMemo(
    () => ({
      ...host,
      navigate: (k: string, url: string) => {
        userPage.current = true;
        setNavigated(true);
        host.navigate(k, url);
      },
    }),
    [host],
  );
  return { key, state, serving, navigated, pageHost };
}

/** A pane's annotations as the main process says them (STORY-75), with how many there are for the pane's host. */
function useAnnotations(host: BrowserBridge, key: string, onUnsent: (n: number) => void) {
  const [annotations, setAnnotations] = useState<AnnotationsState>(NO_ANNOTATIONS);
  useEffect(() => host.onAnnotations((k, s) => k === key && setAnnotations(s)), [host, key]);
  // A pick still being captured is an annotation in a moment: it counts as unsent.
  const unsent = annotations.list.length + (annotations.capturing ? 1 : 0);
  useEffect(() => onUnsent(unsent), [onUnsent, unsent]);
  return annotations;
}

/** The question before the pane closes with unsent annotations; its host decides what goes ahead does. */
export interface CloseAsk {
  confirm: () => void;
  cancel: () => void;
}

export interface BrowserPaneProps {
  browser: BrowserHostValue;
  dir: string;
  /** The story or feature whose dev server it shows. */
  id: string;
  paneId: string;
  width: number;
  onClose: () => void;
  /** Hears how many unsent annotations the pane has. */
  onUnsent: (n: number) => void;
  /** Asks before closing, while its host waits for an answer; null otherwise. */
  closeAsk: CloseAsk | null;
}

/**
 * The Browser pane (STORY-74, ADR 0047): a story's or feature's running app, docked beside its card or chat. The page
 * is the host's own view over the pane's viewport; the pane holds the address bar and the device toolbar.
 */
export function BrowserPane(props: BrowserPaneProps) {
  const { browser, dir, id, paneId, width, onClose, onUnsent, closeAsk } = props;
  const { host } = browser;
  const { key, state, serving, navigated, pageHost } = useBrowserPage(host, dir, id);
  const annotations = useAnnotations(host, key, onUnsent);
  const { annotating } = annotations;
  const [scale, setScale] = useState<number | null>(null);
  const devices = browser.devices(dir);
  const setDevices = (next: typeof devices) => browser.setDevices(dir, next);
  // Escape in the page closes the pane, as Escape in the pane does.
  useEffect(() => host.onEscape((k) => k === key && onClose()), [host, key, onClose]);
  const note = serving.error ?? (state.failed ? BROWSER_COPY.failed(state.failed) : null);
  const starting = serving.url === null && serving.error === null;
  return (
    <DockedAside
      paneId={paneId}
      className="browser-pane"
      label={BROWSER_COPY.pane(id)}
      id={BROWSER_COPY.title(id)}
      closeLabel={BROWSER_COPY.close}
      onClose={onClose}
      // Escape leaves Annotate before it closes the pane.
      onEscape={() => {
        if (annotating) host.annotate(key, false);
        return annotating;
      }}
      width={width}
      actions={
        <button
          type="button"
          className="review-draft"
          aria-pressed={annotating}
          disabled={serving.url === null && !navigated}
          onClick={() => host.annotate(key, !annotating)}
        >
          {ANNOTATE_COPY.annotate}
        </button>
      }
    >
      <AddressBar host={pageHost} pageKey={key} state={state} />
      <DeviceToolbar devices={devices} onChange={setDevices} scale={scale} />
      {closeAsk && (
        <ConfirmAsk
          label={BROWSER_COPY.close}
          cancel={ANNOTATE_COPY.keep}
          onCancel={closeAsk.cancel}
          actions={
            <button type="button" className="btn danger" onClick={closeAsk.confirm}>
              {ANNOTATE_COPY.closeAnyway}
            </button>
          }
        >
          <p>{ANNOTATE_COPY.closeAsk(Math.max(1, annotations.list.length))}</p>
        </ConfirmAsk>
      )}
      {annotating && <p className="meta browser-annotating">{ANNOTATE_COPY.annotateHint}</p>}
      {note && (
        <p className="card-error browser-note" role="alert">
          {note}
        </p>
      )}
      <BrowserViewport
        host={host}
        pageKey={key}
        shown={serving.url !== null || navigated}
        waiting={starting && !navigated ? (serving.installing ? BROWSER_COPY.installing : BROWSER_COPY.starting) : null}
        devices={devices}
        onChange={setDevices}
        onScale={setScale}
      />
      <AnnotationPanel host={host} pageKey={key} state={annotations} />
    </DockedAside>
  );
}
