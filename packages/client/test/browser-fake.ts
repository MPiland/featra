// The fake Browser pane host (STORY-74): the server's dev server start and stop, and the host's view. Both are the
// platform's to prove (a process, a port, Chromium); the fake records each call and lets a test push the page's state.
import { act } from "@testing-library/react";
import type { BrowserBridge, BrowserLayout, BrowserState } from "../src/browser.ts";
import { BLANK_STATE } from "../src/browser.ts";

export function fakeBrowserHost(calls: string[], start?: BrowserBridge["start"]) {
  const listeners = new Set<(key: string, state: BrowserState) => void>();
  /** The host's calls, in order: `open:key`, `navigate:key:url`, and so on; start and stop also go to `calls`. */
  const log: string[] = [];
  /** Each pane's last layout, by key. */
  const layouts = new Map<string, BrowserLayout>();
  const open = new Set<string>();
  const bridge: BrowserBridge = {
    start: async (dir, id) => {
      calls.push(`browserStart:${dir}:${id}`);
      return start ? start(dir, id) : { ok: true, url: "http://localhost:5173/" };
    },
    stop: async (dir, id) => void calls.push(`browserStop:${dir}:${id}`),
    open: (key) => {
      open.add(key);
      log.push(`open:${key}`);
    },
    layout: (key, layout) => void layouts.set(key, layout),
    navigate: (key, url) => void log.push(`navigate:${key}:${url}`),
    back: (key) => void log.push(`back:${key}`),
    forward: (key) => void log.push(`forward:${key}`),
    reload: (key) => void log.push(`reload:${key}`),
    close: (key) => {
      open.delete(key);
      log.push(`close:${key}`);
    },
    onState: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  /** The one pane's view open now. */
  const current = () => {
    const keys = [...open];
    if (keys.length !== 1) throw new Error(`Expected one open Browser view, found ${keys.length}.`);
    return keys[0]!;
  };
  return {
    bridge,
    log,
    open,
    current,
    /** The open pane's last layout. */
    layout: () => layouts.get(current()),
    /** The host says where the open pane's page is now. */
    push: (state: Partial<BrowserState>) =>
      act(async () => {
        const key = current();
        for (const l of listeners) l(key, { ...BLANK_STATE, ...state });
      }),
  };
}
