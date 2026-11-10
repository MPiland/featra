/**
 * STORY-50: Send back on a draft, as the user sees it. The real App over a fake host whose card server only records the
 * call and answers what the test sets. The send-then-record order and the validation are proved by the server's tests.
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, planDraft, SEND_BACK_MAX, type Card } from "@featra/work-format";
import { PROJECT, renderApp } from "../harness.tsx";
import { cardOf } from "../work-fixtures.ts";

afterEach(cleanup);

const BUILT = [cardOf({ id: "FEAT-1", type: "feature", status: "done", title: "Built" })];
const FEATURE = "FEAT-2";

function drafted(chat: string): Card[] {
  const planned = planDraft(
    {
      feature: { title: "Shaping", description: "Talk a feature through." },
      stories: [
        { id: null, title: "Draft it", story: "As a builder, I draft.", criteria: ["It shows"], tasks: ["Build"] },
      ],
    },
    { cards: BUILT, config: DEFAULT_CONFIG, chat, at: "2026-11-10T09:00:00Z" },
  );
  if (!planned.ok) throw new Error(planned.error);
  return planned.value.writes.map((w) => w.card);
}

type App = ReturnType<typeof renderApp>;
/** A Dev Lead chat (chat-1) that has drafted FEAT-2, open with its pane. */
async function chatWithDraft(host: Parameters<typeof renderApp>[0] = {}) {
  const app = renderApp({ ...host, cards: { [PROJECT.dir]: [...BUILT, ...drafted("chat-1")] } });
  await app.chats.bridge.start(PROJECT.dir, "dev-lead");
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(screen.getByRole("button", { name: `Review draft ${FEATURE}` }));
  return { app, pane: await screen.findByRole("complementary", { name: `${FEATURE} card` }) };
}
const history = (app: App) => (app.cardsIn(PROJECT.dir).find((c) => c.id === FEATURE) as Card).history;

describe("AC1: Send back… asks for a reason and can't be sent without one", () => {
  it("is in the draft pane in the chat, and opens a form that takes the reason", async () => {
    const { app, pane } = await chatWithDraft();
    await within(pane).findByRole("button", { name: "Title: Shaping" });
    await app.user.click(within(pane).getByRole("button", { name: "Send back…" }));
    const form = await within(pane).findByRole("form", { name: "Send back" });
    expect(within(form).getByRole("textbox", { name: "Reason" })).toBeTruthy();
  });

  it("can't be sent while the reason is empty or only whitespace, and sends nothing", async () => {
    const { app, pane } = await chatWithDraft();
    await app.user.click(await within(pane).findByRole("button", { name: "Send back…" }));
    const send = within(pane).getByRole("button", { name: "Send" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    const reason = within(pane).getByRole("textbox", { name: "Reason" });
    await app.user.type(reason, "   ");
    expect(send.disabled).toBe(true);
    await app.user.type(reason, "{Enter}\t");
    expect(app.calls.some((c) => c.startsWith("sendBack:") || c.startsWith("chat.send:"))).toBe(false);
    expect(history(app).some((e) => e.field === "sent-back")).toBe(false);
    await app.user.type(reason, "Too big");
    expect(send.disabled).toBe(false);
  });

  it("Cancel closes the form without sending, and Escape cancels the form rather than closing the pane", async () => {
    const { app, pane } = await chatWithDraft();
    await app.user.click(await within(pane).findByRole("button", { name: "Send back…" }));
    await app.user.type(within(pane).getByRole("textbox", { name: "Reason" }), "x{Escape}");
    expect(within(pane).queryByRole("form", { name: "Send back" })).toBeNull();
    expect(screen.getByRole("complementary", { name: `${FEATURE} card` })).toBeTruthy();
    expect(document.activeElement).toBe(within(pane).getByRole("button", { name: "Send back…" }));
    expect(app.calls.some((c) => c.startsWith("sendBack:"))).toBe(false);
  });
});

/** Opens the form on the chat's draft and types `text` as the reason. */
async function fillReason(host: Parameters<typeof renderApp>[0], text: string) {
  const { app, pane } = await chatWithDraft(host);
  await app.user.click(await within(pane).findByRole("button", { name: "Send back…" }));
  await app.user.type(within(pane).getByRole("textbox", { name: "Reason" }), text);
  return { app, pane };
}

describe("AC2 and AC3: the reason goes to the server, which sends it to the chat and records it", () => {
  it("sends the reason to the server's send-back method and closes the form", async () => {
    const { app, pane } = await fillReason({}, "Split the second story.");
    await app.user.click(within(pane).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(app.calls).toContain(`sendBack:${PROJECT.dir}:${FEATURE}:Split the second story.`));
    await waitFor(() => expect(within(pane).queryByRole("form", { name: "Send back" })).toBeNull());
    expect(within(pane).queryByRole("status")).toBeNull();
    // The client never writes history or talks to the chat itself.
    expect(app.calls.some((c) => c.startsWith("chat.send:") || c.startsWith("updateCard:"))).toBe(false);
    expect(history(app).some((e) => e.field === "sent-back")).toBe(false);
  });

  it("shows the refusal, keeps the reason, and puts focus back in the reason field", async () => {
    const { app, pane } = await fillReason(
      { sendBack: async () => ({ ok: false, error: "Wait for the reply, or stop it." }) },
      "Too big",
    );
    await app.user.click(within(pane).getByRole("button", { name: "Send" }));
    expect((await within(pane).findByRole("alert")).textContent).toBe("Wait for the reply, or stop it.");
    const reason = within(pane).getByRole<HTMLTextAreaElement>("textbox", { name: "Reason" });
    expect(reason.value).toBe("Too big");
    expect(document.activeElement).toBe(reason);
  });

  it("closes the form and says so, as a notice and not an error, when the chat has it but history doesn't", async () => {
    const { app, pane } = await fillReason({ sendBack: async () => ({ ok: true, recorded: false }) }, "Too big");
    await app.user.click(within(pane).getByRole("button", { name: "Send" }));
    expect((await within(pane).findByRole("status")).textContent).toBe("Sent. Couldn't record it in history.");
    expect(within(pane).queryByRole("form", { name: "Send back" })).toBeNull();
    expect(within(pane).queryByRole("alert")).toBeNull();
  });

  it("shows a thrown error in the alert and lets Send be used again", async () => {
    let calls = 0;
    const { app, pane } = await fillReason(
      {
        sendBack: async () => {
          if (++calls === 1) throw new Error("Socket closed.");
          return { ok: true, recorded: true };
        },
      },
      "Too big",
    );
    const send = within(pane).getByRole<HTMLButtonElement>("button", { name: "Send" });
    await app.user.click(send);
    expect((await within(pane).findByRole("alert")).textContent).toBe("Socket closed.");
    expect(send.disabled).toBe(false);
    await app.user.click(send);
    await waitFor(() => expect(within(pane).queryByRole("form", { name: "Send back" })).toBeNull());
    expect(calls).toBe(2);
  });
});

describe("the reason's limit", () => {
  it("stops at 2,000 characters and shows a counter near the limit, not before", async () => {
    const { app, pane } = await fillReason({}, "short");
    expect(within(pane).queryByText(/ \/ /)).toBeNull();
    const reason = within(pane).getByRole<HTMLTextAreaElement>("textbox", { name: "Reason" });
    await app.user.clear(reason);
    await app.user.click(reason);
    await app.user.paste("x".repeat(SEND_BACK_MAX + 100));
    expect(reason.value).toHaveLength(SEND_BACK_MAX);
    expect(within(pane).getByText("2,000 / 2,000")).toBeTruthy();
    expect(within(pane).getByRole<HTMLButtonElement>("button", { name: "Send" }).disabled).toBe(false);
  });
});

describe("Escape in the send-back form", () => {
  it("closes only the form, from any control in it, and the pane stays open", async () => {
    const { app, pane } = await fillReason({}, "x");
    within(pane).getByRole<HTMLButtonElement>("button", { name: "Cancel" }).focus();
    await app.user.keyboard("{Escape}");
    expect(within(pane).queryByRole("form", { name: "Send back" })).toBeNull();
    expect(screen.getByRole("complementary", { name: `${FEATURE} card` })).toBeTruthy();
    expect(document.activeElement).toBe(within(pane).getByRole("button", { name: "Send back…" }));
  });
});

describe("where Send back is offered", () => {
  it("is disabled, with a short reason, in Work's card pane when the drafting chat is gone: nothing is recorded", async () => {
    // Review draft with no chat opens the draft feature in Work's own pane.
    const app = renderApp({ cards: { [PROJECT.dir]: [...BUILT, ...drafted("chat-9")] } });
    await screen.findByRole("region", { name: "Work list" });
    await app.user.click(screen.getByRole("button", { name: `Review draft ${FEATURE}` }));
    const pane = await screen.findByRole("complementary", { name: `${FEATURE} card` });
    const button = (await within(pane).findByRole("button", { name: "Send back…" })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(within(pane).getByText("Its chat is gone.").id).toBe(button.getAttribute("aria-describedby"));
    await app.user.click(button);
    expect(within(pane).queryByRole("form")).toBeNull();
    expect(history(app).some((e) => e.field === "sent-back")).toBe(false);
  });

  it("is not on a story of the draft, in the chat's pane or in Work's", async () => {
    const { app, pane } = await chatWithDraft();
    await app.user.click(await within(pane).findByRole("button", { name: /Draft it/ }));
    const story = await screen.findByRole("complementary", { name: /^STORY-\d+ card$/ });
    await within(story).findByRole("button", { name: "Title: Draft it" });
    expect(within(story).queryByRole("button", { name: "Send back…" })).toBeNull();
  });

  it("is gone once the feature is no longer a draft (the pane follows the card)", async () => {
    const { app, pane } = await chatWithDraft();
    await within(pane).findByRole("button", { name: "Send back…" });
    const feature = app.cardsIn(PROJECT.dir).find((c) => c.id === FEATURE) as Card;
    app.pushCard(PROJECT.dir, { ...feature, status: "approved" });
    await waitFor(() => expect(within(pane).queryByRole("button", { name: "Send back…" })).toBeNull());
  });
});
