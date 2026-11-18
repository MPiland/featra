/**
 * Every unit test project's setup file (BUG-30), through `HANG_GUARD` in `hang-guard.ts`. A test that fails while a
 * wait is still open, as one the hang guard stops always is, gets one more error: what it was waiting for, how long,
 * and the test line that asked (`waits.ts`). `expect.poll` is noted here; `until`, `next` and Testing Library's waits
 * note their own. `vi.waitFor` isn't: it gives up after its own 1 s and names its last error, so no hang guard stops it.
 */
import { afterEach, expect } from "vitest";
import { codeOf, endWaits, forgetWaits, openWaits, waitingFor } from "./waits.ts";

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  (typeof v === "object" || typeof v === "function") &&
  v !== null &&
  typeof (v as { then?: unknown }).then === "function";

/** `expect.poll`'s chain, each matcher's promise noted as a wait for `what` and that matcher. */
function noted<T extends object>(what: string, chain: T): T {
  return new Proxy(chain, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof key === "symbol") return value;
      if (typeof value === "function") {
        return (...args: unknown[]) => {
          const result: unknown = Reflect.apply(value, target, args);
          const call = `${what}.${key}(${args.map(codeOf).join(", ")})`;
          return isThenable(result) ? waitingFor(call, result) : result;
        };
      }
      return typeof value === "object" && value !== null ? noted(`${what}.${key}`, value) : value;
    },
  });
}

// Wraps the poll itself rather than calling it, which these rules read as a stray `expect`.
// oxlint-disable-next-line vitest/no-standalone-expect, vitest/valid-expect, vitest/require-awaited-expect-poll
const poll = expect.poll.bind(expect);
expect.poll = ((fn, options) => noted(`expect.poll(${codeOf(fn)})`, poll(fn, options))) as typeof expect.poll;

afterEach(({ task }) => {
  if (task.result?.state !== "fail") return forgetWaits();
  const report = openWaits();
  endWaits();
  if (report === undefined) return;
  const error = new Error(report);
  error.stack = report; // the waits' own lines say where; this file's would only add noise
  throw error;
});
