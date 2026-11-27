/**
 * The page's ask for the server's address, logged so a page that connects late shows where the time went (BUG-40).
 * Free of Electron imports. A page whose server is down asks again every second, so only an answer that differs from
 * the last one, or one slower than `SLOW_ASK_MS`, is logged: main.log stays small.
 */
import type { ServerEndpoint } from "@featra/client/bridge";

/** An ask that takes longer than this is logged with its time, whatever its answer. */
export const SLOW_ASK_MS = 100;

export function loggedEndpoint(
  endpoint: () => Promise<ServerEndpoint | null>,
  log: (message: string) => void,
  now: () => number = () => performance.now(),
): () => Promise<ServerEndpoint | null> {
  let last: boolean | undefined;
  return async () => {
    const start = now();
    const found = await endpoint();
    const ms = Math.round(now() - start);
    const given = found !== null;
    if (given !== last || ms > SLOW_ASK_MS) {
      log(`${given ? "Gave the page the server's address" : "No server address for the page"} after ${ms} ms`);
    }
    last = given;
    return found;
  };
}
