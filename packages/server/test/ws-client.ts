/**
 * A bare WebSocket client for the server tests: Node's own `WebSocket` (the platform), sending raw frames so the tests
 * see exactly what crosses the wire. The client package's real client is tested against the server in apps/desktop.
 */
export interface Socket {
  /** Sends one text frame and resolves with the next frame the server sends back, parsed. */
  ask: (frame: string) => Promise<unknown>;
  /** Sends one text frame and waits for nothing. */
  send: (frame: string) => void;
  close: () => void;
}

export function connect(url: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener("error", () => reject(new Error(`Can't connect to ${url}`)), { once: true });
    ws.addEventListener(
      "open",
      () =>
        resolve({
          ask: (frame) =>
            new Promise((answer) => {
              ws.addEventListener("message", (e) => answer(JSON.parse(String(e.data))), { once: true });
              ws.send(frame);
            }),
          send: (frame) => ws.send(frame),
          close: () => ws.close(),
        }),
      { once: true },
    );
  });
}

export const request = (id: number, method: string, params: unknown) => JSON.stringify({ id, method, params });
