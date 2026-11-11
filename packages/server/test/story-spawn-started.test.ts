/**
 * BUG-15: a story session is "started" only once its provider session is. The Agent SDK is faked at the package
 * boundary with a slow start (the SDK takes a while to load); the spawn must not answer before it has run.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeClaude } from "./fake-query.ts";
import { storyWorld, type StoryWorld } from "./story-fixture.ts";

const SLOW_MS = 300;
const claude = fakeClaude();
let w: StoryWorld;
beforeAll(async () => {
  // The SDK loads slowly: the story's agent can't be started for SLOW_MS after it is asked for.
  const slow = claude.deps.loadQuery;
  claude.deps.loadQuery = async () => {
    await new Promise((r) => setTimeout(r, SLOW_MS));
    return slow();
  };
  w = await storyWorld({ claude });
});
afterAll(() => w.close());

describe("starting a story", () => {
  it("answers only once the provider session is started", async () => {
    const reply = await w.window.ask("story.start", { dir: w.repo.main, id: "STORY-5" });
    expect(reply.ok).toBe(true);
    // At the moment of the answer, not after it: the agent is already running, nothing to wait for.
    expect(claude.runs).toHaveLength(1);
  });
});
