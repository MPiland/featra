/**
 * Capturing a page of a story's dev server (STORY-25, ADR 0044): the server asks the desktop host, whose Electron
 * Chromium loads it in a hidden window and captures it, so nothing is downloaded and no agent is involved. This end
 * numbers each ask and settles it with the host's answer. Without a host (tests, a server run on its own) nothing is
 * captured.
 */
import type { HostMessage, ServerMessage } from "./host-messages.ts";

export type Capture = { ok: true; data: Buffer; ext: "png" | "jpg" } | { ok: false; error: string };

/** Captures the page at `url` of the dev server at `origin`, which the host checks it against: the platform boundary. */
export type CapturePage = (url: string, origin: string) => Promise<Capture>;

export const NO_HOST = "Featra can't capture pages here.";

export function createHostCapture(send: ((message: ServerMessage) => void) | null) {
  const asked = new Map<number, (capture: Capture) => void>();
  let seq = 0;
  return {
    capture: ((url, origin) => {
      if (!send) return Promise.resolve({ ok: false, error: NO_HOST });
      seq += 1;
      const mine = seq;
      return new Promise<Capture>((resolve) => {
        asked.set(mine, resolve);
        send({ type: "capture", seq: mine, url, origin });
      });
    }) satisfies CapturePage,
    /** The host's answer to an ask. */
    settle(message: Extract<HostMessage, { type: "captured" }>) {
      const resolve = asked.get(message.seq);
      asked.delete(message.seq);
      resolve?.(
        "error" in message
          ? { ok: false, error: message.error }
          : { ok: true, data: Buffer.from(message.data, "base64"), ext: message.ext },
      );
    },
    /** The host is gone: every ask ends uncaptured. */
    close() {
      for (const resolve of asked.values()) resolve({ ok: false, error: NO_HOST });
      asked.clear();
    },
  };
}
