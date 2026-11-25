/**
 * STORY-73: the Dev Lead's design review of a story's screenshots, on the real services: a real repository and
 * worktrees, the agent socket, card reports, proof capture, the chat manager and its notices. Only the platform is
 * faked: the Agent SDK, the clock, and the dev server and page capture behind the proof (proof-world.ts).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DESIGN_REVIEW_COPY,
  DESIGN_REVIEW_ERRORS,
  leadMessage,
  noticeMessage,
  PROOF_COPY,
  type ProofView,
} from "@featra/work-format";
import { changesOf, designWorld, FINDINGS, PAGE, type DesignWorld } from "./design-review-world.ts";
import { sdk } from "./fake-query.ts";
import { folder, platform, TWO } from "./proof-world.ts";
import type { Client, StoryWorld } from "./story-fixture.ts";
import { finish, noticesIn, settled, type Lead } from "./story-lead.ts";

let d: DesignWorld;
let w: StoryWorld;
let lead: Lead;

beforeAll(async () => {
  d = await designWorld();
  ({ w, lead } = d);
});
afterAll(() => w.close());

const update = (agent: Client, params: Record<string, unknown>) => d.update(agent, params);
const view = (id: string) => d.view(id);
const spawned = (id: string, name: string) => d.spawned(id, name);
const leadHeard = (n: number) => d.leadHeard(n);

describe("AC1 and AC2: a story with screenshots waits in review for the Dev Lead's design review", () => {
  let s: Awaited<ReturnType<typeof spawned>>;
  const shot = `${folder("STORY-5")}ac1-page.png`;

  it("tells the Dev Lead when the story's turn ends that it waits for design review, naming the screenshots", async () => {
    s = await spawned("STORY-5", "STORY-5-spawn-five");
    const moved = await update(s.session, { criteria: PAGE, stage: "In Review" });
    expect(moved).toMatchObject({ ok: true });
    expect(changesOf(moved)).toContain(PROOF_COPY.captured(1, folder("STORY-5")));
    // The session's turn is on: the notice waits for the turn's own and goes with it, in one message.
    await settled(w);
    expect(noticesIn(lead.events())).toHaveLength(0);
    finish(s.run, "Ready for review.");
    await w.until(() => noticesIn(lead.events()).length === 1);
    expect(noticesIn(lead.events())[0]).toBe(
      noticeMessage([
        { story: "STORY-5", outcome: "ended", summary: "Ready for review." },
        {
          story: "STORY-5",
          outcome: "waits for design review",
          summary: DESIGN_REVIEW_COPY.notice(folder("STORY-5"), ["ac1-page.png"], false),
        },
      ]),
    );
    expect(noticesIn(lead.events())[0]).toContain(`Screenshots in ${folder("STORY-5")}: ac1-page.png`);
    await leadHeard(1);
    expect((await view("STORY-5")).designReview).toEqual({ status: "waiting", shots: [shot] });
  });

  it("keeps the story in review: the move to Acceptance is refused until the check is cleared", async () => {
    const refused = await update(s.session, { stage: "Acceptance" });
    expect(refused).toMatchObject({ ok: false, error: DESIGN_REVIEW_ERRORS.waits("STORY-5") });
    expect((await w.card("STORY-5", s.tree)).status).toBe("In Review");
  });

  it("sends the Dev Lead's findings to the story's session, and records them on the card", async () => {
    const sent = await update(lead.agent, { card: "STORY-5", designReview: { findings: FINDINGS } });
    expect(sent).toMatchObject({ ok: true });
    expect(changesOf(sent)).toEqual([DESIGN_REVIEW_COPY.sent("STORY-5")]);
    await w.until(() => s.run.heard.length === 2);
    expect(s.run.heard[1]).toBe(leadMessage(DESIGN_REVIEW_COPY.message("STORY-5", FINDINGS)));
    const card = await w.card("STORY-5", s.tree);
    expect(card.status).toBe("In Review");
    expect(card.history.at(-1)).toMatchObject({ field: "design-review", to: `findings: ${FINDINGS}` });
    expect((await view("STORY-5")).designReview).toEqual({ status: "findings", shots: [shot], findings: FINDINGS });
    expect(await update(s.session, { stage: "Acceptance" })).toMatchObject({
      ok: false,
      error: DESIGN_REVIEW_ERRORS.waits("STORY-5"),
    });
  });

  it("captures the screenshots again when the session reports the findings fixed, and the Dev Lead reviews again", async () => {
    const captured = platform.captured.length;
    const fixed = await update(s.session, { designReview: { fixed: true } });
    expect(fixed).toMatchObject({ ok: true });
    expect(changesOf(fixed)).toEqual([DESIGN_REVIEW_COPY.fixed, PROOF_COPY.captured(1, folder("STORY-5"))]);
    expect(platform.captured.length).toBe(captured + 1);
    finish(s.run, "Fixed the overlap.");
    await w.until(() => noticesIn(lead.events()).length === 2);
    expect(noticesIn(lead.events())[1]).toContain(
      `STORY-5 waits for design review: ${DESIGN_REVIEW_COPY.notice(folder("STORY-5"), ["ac1-page.png"], true)}`,
    );
    await leadHeard(2);
    expect((await view("STORY-5")).designReview).toEqual({ status: "waiting", shots: [shot], fixed: true });
  });

  it("lets the Dev Lead clear the check and move the story on to Acceptance in one call", async () => {
    const cleared = await update(lead.agent, { card: "STORY-5", designReview: { clear: true }, stage: "Acceptance" });
    expect(cleared).toMatchObject({ ok: true });
    expect(changesOf(cleared)).toEqual([DESIGN_REVIEW_COPY.cleared, "moved to Acceptance"]);
    const card = await w.card("STORY-5", s.tree);
    expect(card.status).toBe("Acceptance");
    expect(card.history.filter((e) => e.field === "design-review").map((e) => e.to)).toEqual([
      `findings: ${FINDINGS}`,
      "fixed",
      "cleared",
    ]);
    expect((await view("STORY-5")).designReview).toEqual({ status: "cleared", shots: [shot] });
  });
});

describe("findings the story's session can't take now", () => {
  it("are refused while it is working, and nothing is recorded", async () => {
    const s = await spawned("STORY-6", "STORY-6-spawn-six");
    expect(await update(s.session, { criteria: PAGE, stage: "In Review" })).toMatchObject({ ok: true });
    const refused = await update(lead.agent, { card: "STORY-6", designReview: { findings: FINDINGS } });
    expect(refused).toMatchObject({
      ok: false,
      error: "STORY-6 is working. Its next notice says when it can be messaged.",
    });
    expect((await w.card("STORY-6", s.tree)).history.some((e) => e.field === "design-review")).toBe(false);
    expect(s.run.heard).toHaveLength(1);
    const told = noticesIn(lead.events()).length;
    finish(s.run, "Ready.");
    await leadHeard(told + 1);
  });
});

describe("AC3: a story with no screenshots moves on without the check", () => {
  it("is not reviewed, and the Dev Lead isn't told it waits", async () => {
    const s = await spawned("STORY-7", "STORY-7-spawn-seven");
    expect(await update(s.session, { stage: "In Review" })).toMatchObject({ ok: true });
    expect(await update(s.session, { stage: "Acceptance" })).toMatchObject({ ok: true });
    expect((await w.card("STORY-7", s.tree)).status).toBe("Acceptance");
    expect((await view("STORY-7")).designReview).toBeUndefined();
    const told = noticesIn(lead.events()).length;
    finish(s.run, "Done.");
    await w.until(() => noticesIn(lead.events()).length === told + 1);
    expect(noticesIn(lead.events()).at(-1)).not.toContain("waits for design review");
    await leadHeard(told + 1);
  });
});

/** Story `id` started by the user from its card: its session has no Dev Lead chat. */
async function started(id: string, name: string) {
  const before = w.claude.runs.length;
  const answer = await w.window.ask("story.start", { dir: w.dir, id });
  const chat = (answer.result as { chat: string }).chat;
  await w.until(() => (w.claude.runs[before]?.heard.length ?? 0) === 1);
  const run = w.claude.runs[before]!;
  run.say(sdk.init());
  const tree = join(w.repo.main, ".claude", "worktrees", name);
  await w.repo.write(tree, { ...(await w.card(id, tree)), acs: TWO });
  const session = await w.agentOf(chat);
  expect(await update(session, { criteria: PAGE, stage: "In Review" })).toMatchObject({ ok: true });
  finish(run, "Ready.");
  return { tree, run, session };
}

describe("when the Dev Lead chat that started the story is gone", () => {
  it("says so on the card, and the user's Clear records it and moves the story to Acceptance", async () => {
    const s = await started("STORY-9", "STORY-9-spawn-9");
    const shown = (await view("STORY-9")).designReview;
    expect(shown).toEqual({ status: "waiting", shots: [`${folder("STORY-9")}ac1-page.png`], leadGone: true });
    expect(await w.window.ask("story.clearDesignReview", { dir: w.dir, id: "STORY-9" })).toMatchObject({
      ok: true,
      result: null,
    });
    const card = await w.card("STORY-9", s.tree);
    expect(card.status).toBe("Acceptance");
    expect(card.history.slice(-2)).toMatchObject([
      { field: "design-review", to: "cleared", by: "user" },
      { field: "status", from: "In Review", to: "Acceptance", by: "user" },
    ]);
    expect((await view("STORY-9")).designReview).toEqual({
      status: "cleared",
      shots: [`${folder("STORY-9")}ac1-page.png`],
    });
    expect(await w.window.ask("story.clearDesignReview", { dir: w.dir, id: "STORY-9" })).toMatchObject({
      ok: false,
      error: "STORY-9 has no design review waiting.",
    });
  });

  it("lets the user send the story back from review, and it is reviewed again when it returns", async () => {
    const s = await started("STORY-10", "STORY-10-spawn-10");
    await w.until(() => s.run.heard.length === 1);
    const sent = await w.window.ask("story.sendBack", {
      dir: w.dir,
      id: "STORY-10",
      reason: "The header is cut off.",
      addCriterion: false,
    });
    expect(sent).toMatchObject({ ok: true, result: { recorded: true } });
    await w.until(() => s.run.heard.length === 2);
    expect(s.run.heard[1]).toBe("Sent back STORY-10: The header is cut off.");
    expect((await w.card("STORY-10", s.tree)).status).toBe("In Progress");
    expect((await view("STORY-10")).designReview).toBeUndefined();
    expect(await update(s.session, { stage: "In Review" })).toMatchObject({ ok: true });
    expect((await view("STORY-10")).designReview).toMatchObject({ status: "waiting", leadGone: true });
  });
});

describe("AC4: the project turns the check off in Settings", () => {
  it("shows it on by default with screenshots, writes the choice, and lets a story with screenshots move on", async () => {
    const before = (await w.window.ask("proof.load", { dir: w.dir })).result as ProofView;
    expect(before.designReview).toBe(true);
    const after = (await w.window.ask("proof.set", { dir: w.dir, patch: { designReview: false } })).result as ProofView;
    expect(after).toMatchObject({ designReview: false, error: null });
    expect(await readFile(join(w.dir, ".featra", "config.yaml"), "utf8")).toContain("designReview: false");

    const s = await spawned("STORY-11", "STORY-11-spawn-11");
    expect(await update(s.session, { criteria: PAGE, stage: "In Review" })).toMatchObject({ ok: true });
    expect((await w.card("STORY-11", s.tree)).acs[0]?.evidence).toBe(`${folder("STORY-11")}ac1-page.png`);
    expect(await update(s.session, { stage: "Acceptance" })).toMatchObject({ ok: true });
    expect((await view("STORY-11")).designReview).toBeUndefined();
    const told = noticesIn(lead.events()).length;
    finish(s.run, "Done.");
    await w.until(() => noticesIn(lead.events()).length === told + 1);
    expect(noticesIn(lead.events()).at(-1)).not.toContain("waits for design review");
    await leadHeard(told + 1);
  });
});
