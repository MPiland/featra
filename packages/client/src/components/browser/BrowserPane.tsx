import { useEffect, useState } from "react";
import { BLANK_STATE, BROWSER_COPY, type BrowserBridge, type BrowserState } from "../../browser.ts";
import { DockedAside } from "../work/DockedAside.tsx";
import { AddressBar } from "./AddressBar.tsx";
import type { BrowserHostValue } from "./browser-context.tsx";
import { BrowserViewport } from "./BrowserViewport.tsx";
import { DeviceToolbar } from "./DeviceToolbar.tsx";

/** Where the pane's dev server is: starting, serving at its URL, or not started, and why. */
type Serving = { url: string | null; error: string | null };

let opened = 0;

/**
 * The pane's page: its own view in the host, the story's or feature's dev server started for it and shown in it, and
 * both let go when the pane closes (STORY-74). The view and the server are the pane's while it is mounted.
 */
function useBrowserPage(host: BrowserBridge, dir: string, id: string) {
  const [key] = useState(() => `browser-${++opened}`);
  const [state, setState] = useState<BrowserState>(BLANK_STATE);
  const [serving, setServing] = useState<Serving>({ url: null, error: null });
  useEffect(() => {
    let live = true;
    host.open(key);
    const off = host.onState((k, s) => {
      if (k === key) setState(s);
    });
    void host.start(dir, id).then((r) => {
      if (!live) return;
      setServing(r.ok ? { url: r.url, error: null } : { url: null, error: r.error });
      if (r.ok) host.navigate(key, r.url);
    });
    return () => {
      live = false;
      off();
      host.close(key);
      void host.stop(dir, id);
    };
  }, [host, key, dir, id]);
  return { key, state, serving };
}

export interface BrowserPaneProps {
  browser: BrowserHostValue;
  dir: string;
  /** The story or feature whose dev server it shows. */
  id: string;
  paneId: string;
  width: number;
  onClose: () => void;
}

/**
 * The Browser pane (STORY-74, ADR 0047): a story's or feature's running app, docked beside its card or chat. The page
 * is the host's own view over the pane's viewport; the pane holds the address bar and the device toolbar.
 */
export function BrowserPane({ browser, dir, id, paneId, width, onClose }: BrowserPaneProps) {
  const { host } = browser;
  const { key, state, serving } = useBrowserPage(host, dir, id);
  const devices = browser.devices(dir);
  const setDevices = (next: typeof devices) => browser.setDevices(dir, next);
  const note = serving.error ?? (state.failed ? BROWSER_COPY.failed(state.failed) : null);
  return (
    <DockedAside
      paneId={paneId}
      className="browser-pane"
      label={BROWSER_COPY.pane(id)}
      id={id}
      closeLabel={BROWSER_COPY.close}
      onClose={onClose}
      width={width}
    >
      <AddressBar host={host} pageKey={key} state={state} />
      <DeviceToolbar devices={devices} onChange={setDevices} />
      {note && (
        <p className="card-error browser-note" role="alert">
          {note}
        </p>
      )}
      <BrowserViewport
        host={host}
        pageKey={key}
        shown={serving.url !== null}
        waiting={serving.url === null && serving.error === null}
        devices={devices}
        onChange={setDevices}
      />
    </DockedAside>
  );
}
