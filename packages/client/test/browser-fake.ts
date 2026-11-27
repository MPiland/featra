// The fake Browser pane host (STORY-74): the server's dev server start and stop, and the host's view. Both are the
// platform's to prove (a process, a port, Chromium); the fake records each call and lets a test push the page's state.
import { act } from "@testing-library/react";
import type { BrowserBridge, BrowserLayout, BrowserState, BrowserTarget } from "../src/browser.ts";
import { BLANK_STATE } from "../src/browser.ts";

export function fakeBrowserHost(calls: string[], start?: BrowserBridge["start"]) {
  const listeners = new Set<(key: string, state: BrowserState) => void>();
  const escapes = new Set<(key: string) => void>();
  /** What each pane was opened on, by key. */
  const targets = new Map<string, BrowserTarget>();
  /** The pane keys each start and stop named, in order. */
  const keys: string[] = [];
  /** The host's calls, in order: `open:key`, `navigate:key:url`, and so on; start and stop also go to `calls`. */
  const log: string[] = [];
  /** Each pane's last layout, by key. */
  const layouts = new Map<string, BrowserLayout>();
  const open = new Set<string>();
  const bridge: BrowserBridge = {
    start: async (dir, id, key) => {
      calls.push(`browserStart:${dir}:${id}`);
      keys.push(key);
      return start ? start(dir, id, key) : { ok: true, url: "http://localhost:5173/" };
    },
    stop: async (dir, id, key) => {
      calls.push(`browserStop:${dir}:${id}`);
      keys.push(key);
    },
    open: (key, target) => {
      open.add(key);
      targets.set(key, target);
      log.push(`open:${key}`);
    },
    focus: (key) => void log.push(`focus:${key}`),
    onEscape: (listener) => {
      escapes.add(listener);
      return () => void escapes.delete(listener);
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
    const shown = [...open];
    if (shown.length !== 1) throw new Error(`Expected one open Browser view, found ${shown.length}.`);
    return shown[0]!;
  };
  return {
    bridge,
    log,
    open,
    targets,
    keys,
    current,
    /** The open pane's last layout. */
    layout: () => layouts.get(current()),
    /** The host says where the open pane's page is now. */
    push: (state: Partial<BrowserState>) =>
      act(async () => {
        const key = current();
        for (const l of listeners) l(key, { ...BLANK_STATE, ...state });
      }),
    /** Escape is pressed in the open pane's page. */
    escape: () =>
      act(async () => {
        const key = current();
        for (const l of escapes) l(key);
      }),
  };
}
