/** STORY-53: the pure rules of stopping and resuming a story's agent; Stopped is derived from the card's history. */
import { describe, expect, it } from "vitest";
import {
  buildWorkList,
  canResume,
  isStopped,
  leftQueue,
  MAIN,
  normalizeWorkList,
  parseCard,
  resumedStory,
  resumeRefusal,
  serializeCard,
  startedStory,
  stopRefusal,
  stoppedIn,
  stoppedStory,
  STOP_MESSAGES,
  type StoryTurn,
} from "../src/index.ts";
import { at, config, feature, story } from "./fixtures.ts";

const started = startedStory(
  story("STORY-53", "FEAT-5", { status: "Ready" }),
  { agent: "claude", role: "developer", model: "m", reasoning: "high", session: "chat-1", branch: "featra/story-53" },
  "user",
  at(1),
);

describe("Stopped is derived from history", () => {
  it("is not set on a started story, is set by Stop's event, and is cleared by Resume's", () => {
    expect(isStopped(started)).toBe(false);
    const stopped = stoppedStory(started, "user", at(2));
    expect(isStopped(stopped)).toBe(true);
    expect(stopped.history.at(-1)).toEqual({ at: at(2), field: "stopped", from: null, to: "stopped", by: "user" });
    const resumed = resumedStory(stopped, "user", at(3));
    expect(isStopped(resumed)).toBe(false);
    expect(resumed.history.at(-1)).toEqual({ at: at(3), field: "stopped", from: "stopped", to: null, by: "user" });
    expect(isStopped(stoppedStory(resumed, "user", at(4)))).toBe(true);
  });

  it("keeps the stage and every other field of the card", () => {
    const stopped = stoppedStory(started, "user", at(2));
    expect({ ...stopped, history: [] }).toEqual({ ...started, history: [] });
    expect(stopped.status).toBe("In Progress");
  });

  it("is a no-op when the card is already in that state, so history gets no duplicate", () => {
    const stopped = stoppedStory(started, "user", at(2));
    expect(stoppedStory(stopped, "user", at(3))).toBe(stopped);
    expect(resumedStory(started, "user", at(3))).toBe(started);
  });

  it("survives the card file: a card read back from its text is still stopped", () => {
    const stopped = stoppedStory(started, "user", at(2));
    expect(isStopped(parseCard(serializeCard(stopped)))).toBe(true);
  });
});

const idle: StoryTurn = { running: false, queued: false, stalled: false };

describe("refusals", () => {
  it("refuses Stop on a card that is gone, isn't a story, has no agent or is already stopped", () => {
    expect(stopRefusal(undefined, "active")).toBe(STOP_MESSAGES.gone);
    expect(stopRefusal({ ...started, type: "bug" }, "active")).toBe("STORY-53 isn't a story.");
    expect(stopRefusal(story("STORY-53", "FEAT-5"), "active")).toBe("STORY-53 has no agent to stop.");
    expect(stopRefusal(stoppedStory(started, "user", at(2)), "active")).toBe("STORY-53 is already stopped.");
    expect(stopRefusal(started, "active")).toBeNull();
  });

  it("refuses Resume unless the card is stopped or its session is stalled In Progress, and nothing is running", () => {
    expect(resumeRefusal(undefined, "active", idle)).toBe(STOP_MESSAGES.gone);
    expect(resumeRefusal(started, "active", idle)).toBe("STORY-53 isn't stopped.");
    const stopped = stoppedStory(started, "user", at(2));
    expect(resumeRefusal(stopped, "active", idle)).toBeNull();
    expect(resumeRefusal(stopped, "active", { ...idle, running: true })).toBe("STORY-53 is running.");
    expect(resumeRefusal(stopped, "active", { ...idle, queued: true })).toBe("STORY-53 is waiting for a slot.");
  });

  it("offers Resume on a stalled session only while its story is In Progress", () => {
    expect(resumeRefusal(started, "active", { ...idle, stalled: true })).toBeNull();
    expect(resumeRefusal(started, "review", { ...idle, stalled: true })).toBe("STORY-53 isn't stopped.");
    expect(resumeRefusal(started, "done", { ...idle, stalled: true })).toBe("STORY-53 isn't stopped.");
    expect(canResume(false, true, "active")).toBe(true);
    expect(canResume(false, false, "active")).toBe(false);
  });
});

describe("Stopped does not outlive the session", () => {
  it("is not stopped in a Done or Cancelled stage, whatever the history says", () => {
    const stopped = stoppedStory(started, "user", at(2));
    expect(stoppedIn(stopped, "active")).toBe(true);
    expect(stoppedIn(stopped, "review")).toBe(true);
    expect(stoppedIn(stopped, "done")).toBe(false);
    expect(stoppedIn(stopped, "cancelled")).toBe(false);
    expect(resumeRefusal(stopped, "done", idle)).toBe("STORY-53 isn't stopped.");
    expect(stopRefusal(stopped, "done")).toBeNull();
  });

  it("starting the story again clears Stopped with the clearing event", () => {
    const stopped = stoppedStory(started, "user", at(2));
    const again = startedStory(
      { ...stopped, status: "Ready" },
      {
        agent: "claude",
        role: "developer",
        model: "m",
        reasoning: "high",
        session: "chat-2",
        branch: "featra/story-53",
      },
      "user",
      at(3),
    );
    expect(isStopped(again)).toBe(false);
    expect(again.history.findLast((e) => e.field === "stopped")).toEqual({
      at: at(3),
      field: "stopped",
      from: "stopped",
      to: null,
      by: "user",
    });
  });

  it("leaves a started story that was never stopped without a stopped event", () => {
    expect(started.history.some((e) => e.field === "stopped")).toBe(false);
  });
});

describe("a story dropped from the queue", () => {
  it("gets a history event and no Stopped mark, and keeps its stage", () => {
    const card = story("STORY-53", "FEAT-5", { status: "Ready" });
    const left = leftQueue(card, "user", at(2));
    expect(left.history.at(-1)).toEqual({ at: at(2), field: "queued", from: "queued", to: null, by: "user" });
    expect(left.status).toBe("Ready");
    expect(isStopped(left)).toBe(false);
    expect(isStopped(parseCard(serializeCard(left)))).toBe(false);
    expect(parseCard(serializeCard(left)).history.at(-1)?.field).toBe("queued");
  });
});

const rowOf = (card: typeof started) => {
  const cards = [feature("FEAT-5", "active", null), card].map((c) => ({
    card: c,
    owner: MAIN,
    shownFrom: MAIN,
    path: `.featra/cards/${c.id}.md`,
  }));
  const built = buildWorkList({ cards, stale: [], problems: [] }, config);
  const list = normalizeWorkList(JSON.parse(JSON.stringify(built)));
  return list.epics.flatMap((e) => e.features).flatMap((f) => f.stories)[0];
};

describe("the Work row", () => {
  it("shows no Stopped on a finished story whose history says stopped", () => {
    const stopped = stoppedStory(started, "user", at(2));
    expect(rowOf({ ...stopped, status: "Done" })).toMatchObject({ stopped: false });
    expect(rowOf({ ...stopped, status: "Cancelled" })).toMatchObject({ stopped: false });
  });

  it("says a story is stopped while its card is, with its stage unchanged, and not after Resume", () => {
    const stopped = stoppedStory(started, "user", at(2));
    expect(rowOf(started)).toMatchObject({ stopped: false, stage: "In Progress" });
    expect(rowOf(stopped)).toMatchObject({ stopped: true, stage: "In Progress" });
    expect(rowOf(resumedStory(stopped, "user", at(3)))).toMatchObject({ stopped: false });
  });
});
