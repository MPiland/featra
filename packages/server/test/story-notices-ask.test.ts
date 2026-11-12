/**
 * STORY-54 AC2: a story agent's question goes to the Dev Lead as a notice, not to the user; the Dev Lead answers it with
 * `message_session` or asks the user itself. A story with no Dev Lead chat still asks the user. Real services, sockets,
 * git and cards; only the Agent SDK and the clock are faked.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ASKED_LEAD,
  askedSummary,
  leadMessage,
  noticeMessage,
  type ChatEvent,
  type Question,
} from "@featra/work-format";
import { storyWorld, type StoryWorld } from "./story-fixture.ts";
import { sdk } from "./fake-query.ts";
import { finish, idleLead, noticesIn } from "./story-lead.ts";

let w: StoryWorld;
beforeAll(async () => {
  w = await storyWorld({ config: "maxStoryAgents: 10\n" });
});
afterAll(() => w.close());

const COLOUR: Question = {
  question: "Which colour do you prefer?",
  header: "Colour",
  options: [
    { label: "Blue", description: "Calm" },
    { label: "Red", description: "Loud" },
  ],
  multiSelect: false,
};
const ASK = "AskUserQuestion";
const ofType = (events: ChatEvent[], type: ChatEvent["type"]) => events.filter((e) => e.type === type);

describe("AC2: a story's question", { timeout: 30_000 }, () => {
  it("goes to the Dev Lead as a notice once its turn ends, and the session is told so, not the user asked", async () => {
    const lead = await idleLead(w);
    const child = await w.spawnAs(lead, "STORY-5");
    const events = await w.window.watch(child.chat);
    child.run.say(sdk.init());

    const refused = await child.run.ask(ASK, { questions: [COLOUR] }, "q1");
    // A refusal that ends its turn by its own choice: the agent is told, and not interrupted.
    expect(refused).toEqual({ behavior: "deny", message: ASKED_LEAD });
    expect(ofType(events(), "question")).toEqual([]);
    const inbox = await w.window.ask("inbox.watch", { dir: w.repo.main, waitMs: 0 });
    expect((inbox.result as { items: unknown[] }).items).toEqual([]);

    finish(child.run, "I need to know the colour.");
    await w.until(() => noticesIn(lead.events()).length === 1);
    expect(noticesIn(lead.events())).toEqual([
      noticeMessage([{ story: "STORY-5", outcome: "asks", summary: askedSummary([[COLOUR]]) }]),
    ]);
    // The Dev Lead can answer from the notice: it holds the question and each option.
    expect(noticesIn(lead.events())[0]).toContain("Which colour do you prefer? (Blue / Red)");
  });

  it("names the subagent that asked, in the notice text", async () => {
    const lead = await idleLead(w);
    const child = await w.spawnAs(lead, "STORY-13");
    const events = await w.window.watch(child.chat);
    child.run.say(sdk.init(), sdk.taskStarted("task-9", "call-9"), sdk.assistant("m1", [sdk.text("marker")]));
    // The messages are read in order: once the marker shows, the subagent is known.
    await w.until(() => JSON.stringify(events()).includes("marker"));
    await child.run.ask(ASK, { questions: [COLOUR] }, "q1", { agentID: "task-9" });
    finish(child.run, "I need to know the colour.");
    await w.until(() => noticesIn(lead.events()).length === 1);
    expect(noticesIn(lead.events())).toEqual([
      noticeMessage([{ story: "STORY-13", outcome: "asks", summary: askedSummary([[COLOUR]], ["Review the diff"]) }]),
    ]);
    expect(noticesIn(lead.events())[0]).toContain("Asked by the subagent Review the diff: Which colour");
  });

  it("holds every question the turn asked, in one notice", async () => {
    const lead = await idleLead(w);
    const child = await w.spawnAs(lead, "STORY-12");
    child.run.say(sdk.init());
    const SIZE: Question = {
      question: "Which size?",
      header: "Size",
      options: [
        { label: "Small", description: "Tidy" },
        { label: "Large", description: "Roomy" },
      ],
      multiSelect: false,
    };
    await child.run.ask(ASK, { questions: [COLOUR] }, "q1");
    await child.run.ask(ASK, { questions: [SIZE] }, "q2");
    finish(child.run, "Two questions.");
    await w.until(() => noticesIn(lead.events()).length === 1);
    expect(noticesIn(lead.events())).toEqual([
      noticeMessage([{ story: "STORY-12", outcome: "asks", summary: askedSummary([[COLOUR], [SIZE]]) }]),
    ]);
    expect(noticesIn(lead.events())[0]).toContain(
      "Which colour do you prefer? (Blue / Red) | Which size? (Small / Large)",
    );
  });

  it("is answered by the Dev Lead with message_session, which the story's session hears", async () => {
    const lead = await idleLead(w);
    const child = await w.spawnAs(lead, "STORY-6");
    const events = await w.window.watch(child.chat);
    child.run.say(sdk.init());
    await child.run.ask(ASK, { questions: [COLOUR] }, "q1");
    finish(child.run, "Waiting for the colour.");
    await w.until(() => noticesIn(lead.events()).length === 1);
    await w.until(() => events().some((e) => e.type === "turn-end"));

    expect(await lead.agent.ask("session.message", { story: "STORY-6", text: "Blue." })).toMatchObject({
      ok: true,
      result: { story: "STORY-6" },
    });
    await w.until(() => child.run.heard.length === 2);
    expect(child.run.heard[1]).toBe(leadMessage("Blue."));
  });

  it("can instead be escalated: the Dev Lead asks the user itself, and the user answers it", async () => {
    const lead = await idleLead(w);
    const child = await w.spawnAs(lead, "STORY-7");
    child.run.say(sdk.init());
    await child.run.ask(ASK, { questions: [COLOUR] }, "q1");
    finish(child.run, "Waiting for the colour.");
    await w.until(() => noticesIn(lead.events()).length === 1);

    // The Dev Lead's own turn, started by the notice, asks the user.
    lead.run.say(sdk.init());
    const answered = lead.run.ask(ASK, { questions: [COLOUR] }, "lead-q");
    await w.until(() => ofType(lead.events(), "question").length === 1);
    const reply = await w.window.ask("chat.answer", {
      id: lead.id,
      tool: "lead-q",
      answers: { [COLOUR.question]: ["Red"] },
    });
    expect(reply).toMatchObject({ ok: true });
    expect(await answered).toMatchObject({ behavior: "allow" });
  });

  it("asks the user in the session's own chat when it has no Dev Lead chat", async () => {
    const before = w.claude.runs.length;
    const started = await w.window.ask("story.start", { dir: w.repo.main, id: "STORY-9" });
    const chat = (started.result as { chat: string }).chat;
    await w.until(() => w.claude.runs.length === before + 1 && w.claude.runs[before]!.heard.length === 1);
    const run = w.claude.runs[before]!;
    const events = await w.window.watch(chat);
    run.say(sdk.init());

    const asked = run.ask(ASK, { questions: [COLOUR] }, "q1");
    await w.until(() => ofType(events(), "question").length === 1);
    await w.window.ask("chat.answer", { id: chat, tool: "q1", answers: { [COLOUR.question]: ["Blue"] } });
    expect(await asked).toMatchObject({ behavior: "allow" });
  });
});
