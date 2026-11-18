/** A socket for the server tests that keeps every frame, so a test can wait for the one it wants. */
export interface SocketFrame<D = unknown> {
  id?: number;
  event?: string;
  watch?: number;
  ok?: boolean;
  result?: unknown;
  error?: string;
  data?: D;
}

export interface FrameSocket<D> {
  send: (f: object) => void;
  /**
   * The first frame `match` takes; it is taken off `frames`. With `ms`, only one that comes within it, for a criterion
   * that promises a time. Without, it waits as long as the run's hang guard allows (BUG-28).
   */
  next: (match: (f: SocketFrame<D>) => boolean, ms?: number) => Promise<SocketFrame<D>>;
  frames: SocketFrame<D>[];
  close: () => void;
}

export function openFrames<D>(url: string): Promise<FrameSocket<D>> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const frames: SocketFrame<D>[] = [];
    const waiting = new Set<() => void>();
    ws.addEventListener("message", (e) => {
      frames.push(JSON.parse(String(e.data)) as SocketFrame<D>);
      for (const w of waiting) w();
    });
    ws.addEventListener("error", () => reject(new Error("Can't connect")), { once: true });
    ws.addEventListener("open", () =>
      resolve({
        frames,
        send: (f) => ws.send(JSON.stringify(f)),
        next: (match, ms) =>
          new Promise((done, fail) => {
            const check = () => {
              const i = frames.findIndex(match);
              if (i < 0) return;
              waiting.delete(check);
              clearTimeout(timer);
              done(frames.splice(i, 1)[0] as SocketFrame<D>);
            };
            const timer =
              ms === undefined
                ? undefined
                : setTimeout(() => {
                    waiting.delete(check);
                    fail(new Error(`No matching frame in ${ms} ms`));
                  }, ms);
            waiting.add(check);
            check();
          }),
        close: () => ws.close(),
      }),
    );
  });
}
