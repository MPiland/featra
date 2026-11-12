/**
 * STORY-23 (the user's side): a story in Acceptance shows Accept and Send back at the end of its session, in its card
 * pane and in its Work row. The real App over a fake host: the card server applies work-format's rules for Accept and
 * Send back to the cards (the lane, the session message and the disk are proved by the server's tests).
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { evidenceState, recordEvidence, SEND_BACK_MAX, setStatus, type Card } from "@featra/work-format";
import { PROJECT, renderApp } from "../harness.tsx";
import { cardOf, workList, type CardSpec } from "../work-fixtures.ts";

afterEach(cleanup);

const cards = () => ({
  [PROJECT.dir]: [
    cardOf({ id: "FEAT-2", type: "feature", status: "active", title: "Delegation" }),
    cardOf({ id: "STORY-5", type: "story", parent: "FEAT-2", status: "New", title: "Spawn five", acs: [0, 1] }),
  ],
});
type Host = Parameters<typeof renderApp>[0];
type App = ReturnType<typeof renderApp>;

const rowOf = () => screen.getByRole("row", { name: /Spawn five/ });
const story = (app: App) => app.cardsIn(PROJECT.dir).find((c) => c.id === "STORY-5") as Card;
/** Where Send back's form opens for the row: just below it, not in its name cell. */
const belowRow = () => rowOf().nextElementSibling as HTMLElement;
const accept = (scope: HTMLElement) => within(scope).queryByRole("button", { name: "Accept STORY-5" });
const sendBack = (scope: HTMLElement) => within(scope).queryByRole("button", { name: "Send back STORY-5" });

/** Starts the story from its row, and its agent reports it ready for acceptance. */
async function waiting(host: Host = {}, verified = false) {
  const app = renderApp({ cards: cards(), ...host });
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(screen.getByRole("button", { name: "Delegation" }));
  await app.user.click(await screen.findByRole("button", { name: "Start STORY-5" }));
  await within(rowOf()).findByRole("button", { name: "Open the session of STORY-5" });
  app.chats.emit("story-chat-1", { type: "user", text: "Do STORY-5." }, { type: "started", model: "opus" });
  app.chats.emit(
    "story-chat-1",
    { type: "text", block: "m1:0", delta: "Ready for you." },
    { type: "turn-end", outcome: "done" },
  );
  let next = setStatus(story(app), "Acceptance", "session:story-chat-1", "2026-11-12T10:00:00Z");
  if (verified) next = recordEvidence(next, "verified", "system", "2026-11-12T10:01:00Z");
  app.pushCard(PROJECT.dir, next);
  return app;
}

const openPane = async (app: App) => {
  await app.user.click(within(rowOf()).getByRole("button", { name: "Spawn five" }));
  return screen.findByRole("complementary", { name: "STORY-5 card" });
};
const openSession = async (app: App) => {
  await app.user.click(within(rowOf()).getByRole("button", { name: "Open the session of STORY-5" }));
  return screen.findByRole("region", { name: "Developer" });
};

describe("AC1: Accept and Send back for a story in Acceptance", () => {
  it("are in its Work row, its card pane and the end of its session", async () => {
    const app = await waiting();
    await waitFor(() => expect(accept(rowOf())).toBeTruthy());
    expect(sendBack(rowOf())).toBeTruthy();
    const pane = await openPane(app);
    expect(accept(pane)).toBeTruthy();
    expect(sendBack(pane)).toBeTruthy();
    const session = await openSession(app);
    expect(accept(session)).toBeTruthy();
    expect(sendBack(session)).toBeTruthy();
    // At the end of the chat: after the transcript.
    const log = within(session).getByRole("log", { name: "Chat" });
    expect(log.compareDocumentPosition(accept(session) as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("are not offered on a story in another stage", async () => {
    const app = renderApp({ cards: cards() });
    await screen.findByRole("region", { name: "Work list" });
    await app.user.click(screen.getByRole("button", { name: "Delegation" }));
    expect(accept(rowOf())).toBeNull();
    expect(sendBack(rowOf())).toBeNull();
    expect(accept(await openPane(app))).toBeNull();
  });
});

describe("AC2: Accept", () => {
  it("records Accepted in the card's history, by the user, and leaves an unverified story in Acceptance", async () => {
    const app = await waiting();
    await app.user.click(await within(rowOf()).findByRole("button", { name: "Accept STORY-5" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(app.calls).toContain(`acceptStory:${PROJECT.dir}:STORY-5`));
    const saved = story(app);
    expect(saved.history.at(-1)).toMatchObject({ field: "accepted", to: "accepted", by: "user" });
    expect(saved.status).toBe("Acceptance");
  });

  it("moves a verified story to Done", async () => {
    const app = await waiting({}, true);
    await app.user.click(await within(rowOf()).findByRole("button", { name: "Accept STORY-5" }));
    await waitFor(() => expect(within(rowOf()).getByText("Done")).toBeTruthy());
    expect(story(app).status).toBe("Done");
  });

  it("shows the server's refusal in one sentence and keeps the button", async () => {
    const app = await waiting({
      review: { acceptStory: async () => ({ ok: false, error: "STORY-5 is already accepted." }) },
    });
    await app.user.click(await within(rowOf()).findByRole("button", { name: "Accept STORY-5" }));
    expect((await within(rowOf()).findByRole("alert")).textContent).toBe("STORY-5 is already accepted.");
    expect((accept(rowOf()) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("AC3: Send back", () => {
  it("asks for a reason, and can't be sent without one", async () => {
    const app = await waiting();
    const session = await openSession(app);
    await app.user.click(await within(session).findByRole("button", { name: "Send back STORY-5" }));
    const form = within(session).getByRole("form", { name: "Send back STORY-5" });
    const send = within(form).getByRole("button", { name: "Send" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    await app.user.type(within(form).getByRole("textbox", { name: "Reason" }), "   ");
    expect(send.disabled).toBe(true);
    expect(app.calls.some((c) => c.startsWith("sendBackStory:"))).toBe(false);
  });

  it("sends the reason, returns the story to In Progress and logs it, without a new criterion by default", async () => {
    const app = await waiting();
    const pane = await openPane(app);
    await app.user.click(within(pane).getByRole("button", { name: "Send back STORY-5" }));
    await app.user.type(within(pane).getByRole("textbox", { name: "Reason" }), "It loses the draft.");
    await app.user.click(within(pane).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(app.calls).toContain(`sendBackStory:${PROJECT.dir}:STORY-5:It loses the draft.:false`));
    const saved = story(app);
    expect(saved.status).toBe("In Progress");
    expect(saved.history.find((e) => e.field === "sent-back")).toMatchObject({ to: "It loses the draft.", by: "user" });
    expect(saved.acs).toHaveLength(1);
    await waitFor(() => expect(accept(rowOf())).toBeNull());
    expect(sendBack(rowOf())).toBeNull();
  });

  it("adds the reason as a new acceptance criterion when asked", async () => {
    const app = await waiting();
    await app.user.click(within(rowOf()).getByRole("button", { name: "Send back STORY-5" }));
    // The form opens below the row, across its width, and not in the row's name cell.
    expect(within(rowOf()).queryByRole("form")).toBeNull();
    const form = within(belowRow()).getByRole("form", { name: "Send back STORY-5" });
    await app.user.type(within(form).getByRole("textbox", { name: "Reason" }), "It loses the draft.");
    await app.user.click(within(form).getByRole("checkbox", { name: "Add as acceptance criterion" }));
    await app.user.click(within(form).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(app.calls).toContain(`sendBackStory:${PROJECT.dir}:STORY-5:It loses the draft.:true`));
    expect(story(app).acs.at(-1)).toEqual({ text: "It loses the draft.", done: false, test: null });
  });

  it("keeps the form and the reason when the server refuses, and shows why", async () => {
    const app = await waiting({
      review: { sendBackStory: async () => ({ ok: false, error: "The session of STORY-5 is gone." }) },
    });
    const session = await openSession(app);
    await app.user.click(await within(session).findByRole("button", { name: "Send back STORY-5" }));
    await app.user.type(within(session).getByRole("textbox", { name: "Reason" }), "Try again.");
    await app.user.click(within(session).getByRole("button", { name: "Send" }));
    expect((await within(session).findByRole("alert")).textContent).toBe("The session of STORY-5 is gone.");
    expect(within(session).getByRole<HTMLTextAreaElement>("textbox", { name: "Reason" }).value).toBe("Try again.");
    expect(story(app).status).toBe("Acceptance");
  });

  it("takes a reason up to the limit and no more", async () => {
    const app = await waiting();
    await app.user.click(within(rowOf()).getByRole("button", { name: "Send back STORY-5" }));
    const field = within(belowRow()).getByRole<HTMLTextAreaElement>("textbox", { name: "Reason" });
    expect(field.maxLength).toBe(SEND_BACK_MAX);
  });
});

describe("AC4: after Accept", () => {
  it("Accept and Send back are gone from the row, the pane and the session, and the session stays open", async () => {
    const app = await waiting();
    const pane = await openPane(app);
    await app.user.click(await within(rowOf()).findByRole("button", { name: "Accept STORY-5" }));
    await waitFor(() => expect(evidenceState(story(app)).accepted).toBe(true));
    await waitFor(() => expect(accept(rowOf())).toBeNull());
    for (const scope of [rowOf(), pane]) {
      expect(sendBack(scope)).toBeNull();
      expect(accept(scope)).toBeNull();
    }
    // The session stays open, with its transcript, and offers neither.
    const session = await openSession(app);
    expect(within(session).getByRole("log", { name: "Chat" })).toBeTruthy();
    expect(within(session).getByText("Ready for you.")).toBeTruthy();
    expect(sendBack(session)).toBeNull();
    expect(accept(session)).toBeNull();
  });
});

describe("AC1: a story whose owner has no editable copy", () => {
  const plan: CardSpec[] = [
    { id: "FEAT-2", type: "feature", status: "active", title: "Delegation" },
    { id: "STORY-5", type: "story", parent: "FEAT-2", status: "Acceptance", title: "Spawn five" },
  ];
  const show = async (canEdit: () => boolean) => {
    const app = renderApp({ work: { [PROJECT.dir]: workList(plan, [], [], [], canEdit) } });
    await screen.findByRole("region", { name: "Work list" });
    await app.user.click(screen.getByRole("button", { name: "Delegation" }));
    return rowOf();
  };

  it("shows neither in its Work row, as its card pane shows neither", async () => {
    const row = await show(() => false);
    expect(within(row).getByText("Acceptance")).toBeTruthy();
    expect(accept(row)).toBeNull();
    expect(sendBack(row)).toBeNull();
  });

  it("shows both in its Work row when it can be edited", async () => {
    const row = await show(() => true);
    expect(accept(row)).toBeTruthy();
    expect(sendBack(row)).toBeTruthy();
  });
});
