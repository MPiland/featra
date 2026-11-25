/**
 * STORY-73 review fixes, on the real services (design-review-world.ts): FEAT-2 drafted by a chat of its own, and its
 * stories spawned by another Dev Lead. A capture held open, findings in a report that is refused, and a chat that may
 * update the story but didn't start it. Only the platform is faked.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DESIGN_REVIEW_ERRORS } from "@featra/work-format";
import { designWorld, FINDINGS, PAGE, type DesignWorld } from "./design-review-world.ts";
import { folder, platform } from "./proof-world.ts";
import type { Client } from "./story-fixture.ts";
import { finish, noticesIn, settled } from "./story-lead.ts";

let d: DesignWorld;
let drafter: Client;

beforeAll(async () => {
  d = await designWorld(true);
  drafter = await d.w.agentOf(d.w.drafter);
});
afterAll(() => d.w.close());

/** Story `id` spawned by the Dev Lead, moved to review with a page; its session's turn has ended. */
async function inReview(id: string, name: string) {
  const s = await d.spawned(id, name);
  expect(await d.update(s.session, { criteria: PAGE, stage: "In Review" })).toMatchObject({ ok: true });
  const told = noticesIn(d.lead.events()).length;
  finish(s.run, "Ready for review.");
  await d.leadHeard(told + 1);
  return s;
}

describe("a chat that didn't start the story", () => {
  it("can't record findings or clear its design review, even the chat that drafted its feature", async () => {
    const s = await inReview("STORY-12", "STORY-12-spawn-12");
    expect(await d.update(drafter, { card: "STORY-12", designReview: { clear: true } })).toMatchObject({
      ok: false,
      error: DESIGN_REVIEW_ERRORS.leadOnly("STORY-12"),
    });
    expect(await d.update(drafter, { card: "STORY-12", designReview: { findings: FINDINGS } })).toMatchObject({
      ok: false,
      error: DESIGN_REVIEW_ERRORS.leadOnly("STORY-12"),
    });
    const card = await d.w.card("STORY-12", s.tree);
    expect(card.history.some((e) => e.field === "design-review")).toBe(false);
    expect(s.run.heard).toHaveLength(1);
  });
});

describe("findings in a report that is refused", () => {
  it("never reach the story's session", async () => {
    const s = await d.spawned("STORY-13", "STORY-13-spawn-13");
    expect(await d.update(s.session, { criteria: PAGE, stage: "In Review" })).toMatchObject({ ok: true });
    const told = noticesIn(d.lead.events()).length;
    finish(s.run, "Ready for review.");
    await d.leadHeard(told + 1);
    const missing = `${folder("STORY-13")}missing.png`;
    const refused = await d.update(d.lead.agent, {
      card: "STORY-13",
      designReview: { findings: FINDINGS },
      criteria: [{ criterion: "A test shows it", evidence: missing }],
    });
    expect(refused).toMatchObject({
      ok: false,
      error: `${missing} isn't there: write the file in your worktree first.`,
    });
    await settled(d.w);
    expect(s.run.heard).toHaveLength(1);
    expect((await d.w.card("STORY-13", s.tree)).history.some((e) => e.field === "design-review")).toBe(false);
  });
});

describe("a story whose screenshots are still being captured", () => {
  it("can't move on to Acceptance until they are attached, and then waits for its design review", async () => {
    const s = await d.spawned("STORY-9", "STORY-9-spawn-9");
    const held: { release?: () => void } = {};
    platform.hold = new Promise<void>((resolve) => {
      held.release = resolve;
    });
    const before = platform.captured.length;
    const moving = d.update(s.session, { criteria: PAGE, stage: "In Review" });
    // The move to review is written and the card lane is free; the page is being captured.
    await d.w.until(() => platform.captured.length === before + 1);
    expect(await d.update(d.lead.agent, { card: "STORY-9", stage: "Acceptance" })).toMatchObject({
      ok: false,
      error: DESIGN_REVIEW_ERRORS.capturing("STORY-9"),
    });
    held.release?.();
    platform.hold = null;
    expect(await moving).toMatchObject({ ok: true });
    expect((await d.w.card("STORY-9", s.tree)).status).toBe("In Review");
    expect((await d.view("STORY-9")).designReview).toMatchObject({ status: "waiting" });
    expect(await d.update(d.lead.agent, { card: "STORY-9", stage: "Acceptance" })).toMatchObject({
      ok: false,
      error: DESIGN_REVIEW_ERRORS.waits("STORY-9"),
    });
  });
});
