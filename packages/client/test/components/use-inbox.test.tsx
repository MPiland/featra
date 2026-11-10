/** STORY-7 review fix: a watch the page has replaced can still be heard from; its pushes must not show. */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Inbox, InboxItem } from "@featra/work-format/inbox";
import type { InboxBridge, InboxUpdate } from "../../src/inbox.ts";
import { useInbox } from "../../src/components/inbox/useInbox.ts";

const item = (chat: string): InboxItem => ({
  chat,
  chatName: chat,
  request: { type: "approval", id: "t1", name: "Bash", input: {}, forChat: true },
  since: "2026-11-09T10:00:00.000Z",
});
const inboxOf = (...chats: string[]): Inbox => ({ items: chats.map(item) });

/** A bridge whose watches stay in the test's hands, and go on pushing after they are stopped, as a late frame would. */
function lateBridge() {
  const watches: { wait: number; push: (inbox: Inbox) => void; stopped: boolean }[] = [];
  const bridge: InboxBridge = {
    watch(_dir, wait, listener: (u: InboxUpdate) => void) {
      const w = { wait, push: (inbox: Inbox) => listener({ inbox, error: null }), stopped: false };
      watches.push(w);
      return () => void (w.stopped = true);
    },
    asked: () => () => {},
  };
  return { bridge, watches };
}

describe("a replaced watch", () => {
  it("is stopped when the wait changes, and what it still sends is ignored", () => {
    const { bridge, watches } = lateBridge();
    const { result, rerender } = renderHook(({ wait }) => useInbox(bridge, true, wait), {
      initialProps: { wait: 600_000 },
    });
    act(() => watches[0]!.push(inboxOf("old-1")));
    expect(result.current.items.map((i) => i.chat)).toEqual(["old-1"]);
    rerender({ wait: 300_000 });
    expect(watches.map((w) => [w.wait, w.stopped])).toEqual([
      [600_000, true],
      [300_000, false],
    ]);
    act(() => watches[1]!.push(inboxOf("new-1", "new-2")));
    act(() => watches[0]!.push(inboxOf("stale")));
    expect(result.current.items.map((i) => i.chat)).toEqual(["new-1", "new-2"]);
  });

  it("keeps the last list until the new watch answers, so a changed wait doesn't flash it empty", () => {
    const { bridge, watches } = lateBridge();
    const { result, rerender } = renderHook(({ wait }) => useInbox(bridge, true, wait), {
      initialProps: { wait: 600_000 },
    });
    act(() => watches[0]!.push(inboxOf("a")));
    rerender({ wait: 60_000 });
    expect(result.current.items.map((i) => i.chat)).toEqual(["a"]);
  });

  it("shows nothing and watches nothing without a project", () => {
    const { bridge, watches } = lateBridge();
    const { result } = renderHook(() => useInbox(bridge, false, 600_000));
    expect(watches).toEqual([]);
    expect(result.current.items).toEqual([]);
  });
});
