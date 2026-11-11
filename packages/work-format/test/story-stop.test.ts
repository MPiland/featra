/** STORY-53: the pure rules of stopping and resuming a story's agent; Stopped is derived from the card's history. */
import { describe, expect, it } from "vitest";
import {
  buildWorkList,
  isStopped,
  MAIN,
  normalizeWorkList,
  parseCard,
  resumedStory,
  resumeRefusal,
  serializeCard,
  startedStory,
  stopRefusal,
  stoppedStory,
  STOP_MESSAGES,
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

describe("refusals", () => {
  it("refuses Stop on a card that is gone, isn't a story, has no agent or is already stopped", () => {
    expect(stopRefusal(undefined)).toBe(STOP_MESSAGES.gone);
    expect(stopRefusal({ ...started, type: "bug" })).toBe("STORY-53 isn't a story.");
    expect(stopRefusal(story("STORY-53", "FEAT-5"))).toBe("STORY-53 has no agent to stop.");
    expect(stopRefusal(stoppedStory(started, "user", at(2)))).toBe("STORY-53 is already stopped.");
    expect(stopRefusal(started)).toBeNull();
  });

  it("refuses Resume unless the card is stopped", () => {
    expect(resumeRefusal(undefined)).toBe(STOP_MESSAGES.gone);
    expect(resumeRefusal(started)).toBe("STORY-53 isn't stopped.");
    expect(resumeRefusal(stoppedStory(started, "user", at(2)))).toBeNull();
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
  it("says a story is stopped while its card is, with its stage unchanged, and not after Resume", () => {
    const stopped = stoppedStory(started, "user", at(2));
    expect(rowOf(started)).toMatchObject({ stopped: false, stage: "In Progress" });
    expect(rowOf(stopped)).toMatchObject({ stopped: true, stage: "In Progress" });
    expect(rowOf(resumedStory(stopped, "user", at(3)))).toMatchObject({ stopped: false });
  });
});
