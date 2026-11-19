// The local server's project needs side, as a fake: the test pushes what the server would count (the counting itself is
// proved against the real server in packages/server); only the socket is faked.
import { act } from "react";
import { EMPTY_NEEDS, type NeedsList } from "@featra/work-format";
import type { NeedsBridge } from "../src/needs.ts";

export function fakeNeedsServer(initial: NeedsList = EMPTY_NEEDS) {
  let current = initial;
  const listeners = new Set<(needs: NeedsList) => void>();
  const bridge: NeedsBridge = {
    watch(listener) {
      listeners.add(listener);
      queueMicrotask(() => listeners.has(listener) && listener(current));
      return () => void listeners.delete(listener);
    },
  };
  return {
    bridge,
    /** What a project needs changed: the server pushes the whole new list to every watch. */
    push: (next: NeedsList) =>
      act(() => {
        current = next;
        for (const l of listeners) l(next);
      }),
    watching: () => listeners.size,
  };
}
