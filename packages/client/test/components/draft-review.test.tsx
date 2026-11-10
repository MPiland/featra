/**
 * STORY-51: Approve and Reject on a draft, as the user sees it. The real App over a fake host whose card server only
 * records the calls and changes the cards as work-format's rules say (planApproval); git, the commit and the files are
 * proved against a real repository by the server's tests.
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, planDraft, type Card } from "@featra/work-format";
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
        { id: null, title: "Review it", story: "As a builder, I review.", criteria: ["It opens"], tasks: ["Wire"] },
      ],
    },
    { cards: BUILT, config: DEFAULT_CONFIG, chat, at: "2026-11-10T09:00:00Z" },
  );
  if (!planned.ok) throw new Error(planned.error);
  return planned.value.writes.map((w) => w.card);
}

type Host = Parameters<typeof renderApp>[0];

/** A Dev Lead chat (chat-1) that has drafted FEAT-2, open with its pane. */
async function chatWithDraft(host: Host = {}, more: Card[] = []) {
  const app = renderApp({ ...host, cards: { [PROJECT.dir]: [...BUILT, ...drafted("chat-1"), ...more] } });
  await app.chats.bridge.start(PROJECT.dir, "dev-lead");
  await screen.findByRole("region", { name: "Work list" });
  app.chats.retitle("chat-1", "Shaping", "draft");
  await app.user.click(screen.getByRole("button", { name: `Review draft ${FEATURE}` }));
  return { app, pane: await screen.findByRole("complementary", { name: `${FEATURE} card` }) };
}

/** The draft with no chat: Review draft opens it in Work's own pane. */
async function workPane(host: Host = {}) {
  const app = renderApp({ ...host, cards: { [PROJECT.dir]: [...BUILT, ...drafted("chat-9")] } });
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(screen.getByRole("button", { name: `Review draft ${FEATURE}` }));
  return { app, pane: await screen.findByRole("complementary", { name: `${FEATURE} card` }) };
}

const button = (pane: HTMLElement, name: string) => within(pane).getByRole<HTMLButtonElement>("button", { name });
const gone = (pane: HTMLElement, ...names: string[]) =>
  names.forEach((name) => expect(within(pane).queryByRole("button", { name })).toBeNull());

describe("where Approve and Reject are offered", () => {
  it("sit next to Send back in the chat's draft pane, with exactly these names", async () => {
    const { pane } = await chatWithDraft();
    const send = await within(pane).findByRole("button", { name: "Send back…" });
    const approve = button(pane, "Approve");
    const reject = button(pane, "Reject");
    expect(approve.textContent).toBe("Approve");
    expect(reject.textContent).toBe("Reject");
    expect(approve.parentElement?.parentElement).toBe(send.parentElement?.parentElement);
  });

  it("are in Work's card pane for a draft whose chat is gone", async () => {
    const { pane } = await workPane();
    await within(pane).findByRole("button", { name: "Send back…" });
    expect(button(pane, "Approve").disabled).toBe(false);
    expect(button(pane, "Reject").disabled).toBe(false);
  });

  it("are not on a story of the draft", async () => {
    const { app, pane } = await chatWithDraft();
    await app.user.click(await within(pane).findByRole("button", { name: /Draft it/ }));
    const story = await screen.findByRole("complementary", { name: /^STORY-\d+ card$/ });
    await within(story).findByRole("button", { name: "Title: Draft it" });
    expect(within(story).queryByRole("button", { name: "Approve" })).toBeNull();
    expect(within(story).queryByRole("button", { name: "Reject" })).toBeNull();
  });
});

describe("AC1 and AC3: Approve", () => {
  it("acts at once, with no confirmation, and Approve, Reject and Send back are gone afterwards", async () => {
    const { app, pane } = await chatWithDraft();
    await app.user.click(await within(pane).findByRole("button", { name: "Approve" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(pane).queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(app.calls).toContain(`approve:${PROJECT.dir}:${FEATURE}`));
    await waitFor(() => gone(pane, "Approve", "Reject", "Send back…"));
    expect(app.cardsIn(PROJECT.dir).find((c) => c.id === FEATURE)?.status).toBe("approved");
  });

  it("keeps the chat open and its title, and takes away the Review badge and the Review draft button", async () => {
    const { app, pane } = await chatWithDraft();
    await app.user.click(await within(pane).findByRole("button", { name: "Approve" }));
    await waitFor(() => gone(pane, "Approve"));
    expect(screen.getByRole("region", { name: "Dev Lead" })).toBeTruthy();
    expect(document.querySelector("[data-chat=chat-1]")?.textContent).toBe("Shaping");
    expect(screen.queryByRole("button", { name: `Review draft ${FEATURE}` })).toBeNull();
    await app.user.click(screen.getByRole("button", { name: "Work" }));
    await screen.findByRole("region", { name: "Work list" });
    expect(screen.queryByRole("img", { name: `${FEATURE} draft, needs review` })).toBeNull();
  });

  it("also works from Work's pane, and the buttons go there too", async () => {
    const { app, pane } = await workPane();
    await app.user.click(await within(pane).findByRole("button", { name: "Approve" }));
    await waitFor(() => gone(pane, "Approve", "Reject", "Send back…"));
    expect(app.calls).toContain(`approve:${PROJECT.dir}:${FEATURE}`);
  });

  it("shows a refusal in an alert and gives the buttons back, so it can be tried again", async () => {
    let tries = 0;
    const { app, pane } = await chatWithDraft({
      review: {
        approve: async () => (++tries === 1 ? { ok: false, error: "Main isn't checked out on main." } : { ok: true }),
      },
    });
    await app.user.click(await within(pane).findByRole("button", { name: "Approve" }));
    expect((await within(pane).findByRole("alert")).textContent).toBe("Main isn't checked out on main.");
    expect(button(pane, "Approve").disabled).toBe(false);
    expect(button(pane, "Reject").disabled).toBe(false);
    await app.user.click(button(pane, "Approve"));
    await waitFor(() => expect(tries).toBe(2));
  });

  it("shows a thrown error in the alert and resets the busy state", async () => {
    const { app, pane } = await chatWithDraft({
      review: {
        approve: async () => {
          throw new Error("Socket closed.");
        },
      },
    });
    await app.user.click(await within(pane).findByRole("button", { name: "Approve" }));
    expect((await within(pane).findByRole("alert")).textContent).toBe("Socket closed.");
    expect(button(pane, "Approve").disabled).toBe(false);
  });

  it("turns both buttons off while it runs, so it can't be sent twice", async () => {
    const gate = { open: () => {} };
    const held = new Promise<void>((resolve) => {
      gate.open = resolve;
    });
    const { app, pane } = await chatWithDraft({
      review: { approve: () => held.then(() => ({ ok: true as const })) },
    });
    await app.user.click(await within(pane).findByRole("button", { name: "Approve" }));
    await waitFor(() => expect(button(pane, "Approve").disabled).toBe(true));
    expect(button(pane, "Reject").disabled).toBe(true);
    await app.user.click(button(pane, "Approve"));
    expect(app.calls.filter((c) => c.startsWith("approve:"))).toHaveLength(1);
    gate.open();
  });
});

describe("AC2: Reject", () => {
  it("asks first, naming the feature and how many stories go, and does nothing until confirmed", async () => {
    const { app, pane } = await chatWithDraft();
    await app.user.click(await within(pane).findByRole("button", { name: "Reject" }));
    const ask = await within(pane).findByRole("alertdialog", { name: "Reject" });
    expect(within(ask).getByText(`Delete ${FEATURE} and its 2 stories?`)).toBeTruthy();
    expect(document.activeElement).toBe(within(ask).getByRole("button", { name: "Cancel" }));
    expect(app.calls.some((c) => c.startsWith("reject:"))).toBe(false);
  });

  it("Cancel and Escape put the question away, leaving the draft and the pane", async () => {
    const { app, pane } = await chatWithDraft();
    await app.user.click(await within(pane).findByRole("button", { name: "Reject" }));
    await app.user.click(within(pane).getByRole("button", { name: "Cancel" }));
    expect(within(pane).queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(button(pane, "Reject"));
    await app.user.click(button(pane, "Reject"));
    await app.user.keyboard("{Escape}");
    expect(within(pane).queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("complementary", { name: `${FEATURE} card` })).toBeTruthy();
    expect(app.calls.some((c) => c.startsWith("reject:"))).toBe(false);
  });

  it("deletes on confirm: the pane closes, the draft is gone from Work, the chat stays with its title and hears nothing", async () => {
    const { app, pane } = await chatWithDraft();
    await app.user.click(await within(pane).findByRole("button", { name: "Reject" }));
    await app.user.click(within(pane).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(app.calls).toContain(`reject:${PROJECT.dir}:${FEATURE}`));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: `${FEATURE} card` })).toBeNull());
    expect(app.cardsIn(PROJECT.dir).map((c) => c.id)).toEqual(["FEAT-1"]);
    expect(screen.getByRole("region", { name: "Dev Lead" })).toBeTruthy();
    expect(document.querySelector("[data-chat=chat-1]")?.textContent).toBe("Shaping");
    expect(screen.queryByRole("button", { name: `Review draft ${FEATURE}` })).toBeNull();
    expect(app.calls.some((c) => c.startsWith("chat.send:") || c.startsWith("sendBack:"))).toBe(false);
  });

  it("shows a refusal in an alert and gives the buttons back", async () => {
    const { app, pane } = await chatWithDraft({
      review: { reject: async () => ({ ok: false, error: "FEAT-2 can't be deleted: git tracks it." }) },
    });
    await app.user.click(await within(pane).findByRole("button", { name: "Reject" }));
    await app.user.click(within(pane).getByRole("button", { name: "Delete" }));
    expect((await within(pane).findByRole("alert")).textContent).toBe("FEAT-2 can't be deleted: git tracks it.");
    expect(button(pane, "Approve").disabled).toBe(false);
    expect(button(pane, "Reject").disabled).toBe(false);
    expect(screen.getByRole("complementary", { name: `${FEATURE} card` })).toBeTruthy();
  });

  it("works from Work's pane, and closes it", async () => {
    const { app, pane } = await workPane();
    await app.user.click(await within(pane).findByRole("button", { name: "Reject" }));
    await app.user.click(within(pane).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: `${FEATURE} card` })).toBeNull());
    expect(app.calls).toContain(`reject:${PROJECT.dir}:${FEATURE}`);
  });

  it("counts every story it deletes: a Cancelled one and one the user added too", async () => {
    const { app, pane } = await chatWithDraft({}, [
      cardOf({ id: "STORY-90", type: "story", parent: FEATURE, status: "New" }),
      cardOf({ id: "STORY-91", type: "story", parent: FEATURE, status: "Cancelled" }),
    ]);
    await app.user.click(await within(pane).findByRole("button", { name: "Reject" }));
    const ask = await within(pane).findByRole("alertdialog", { name: "Reject" });
    expect(within(ask).getByText(`Delete ${FEATURE} and its 4 stories?`)).toBeTruthy();
  });
});

/** A chat with a draft whose Reject question is open. */
const openAsk = async (host: Host = {}) => {
  const made = await chatWithDraft(host);
  await made.app.user.click(await within(made.pane).findByRole("button", { name: "Reject" }));
  return { ...made, ask: await within(made.pane).findByRole("alertdialog", { name: "Reject" }) };
};

describe("the Reject question as a dialog", () => {
  it("describes itself with the question", async () => {
    const { ask } = await openAsk();
    expect(ask.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(ask.getAttribute("aria-describedby") as string)?.textContent).toBe(
      `Delete ${FEATURE} and its 2 stories?`,
    );
  });

  it("closes on Escape with focus on Delete, on Cancel, or on nothing in particular", async () => {
    const { app, pane, ask } = await openAsk();
    within(ask).getByRole<HTMLButtonElement>("button", { name: "Delete" }).focus();
    await app.user.keyboard("{Escape}");
    expect(within(pane).queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(button(pane, "Reject"));
    await app.user.click(button(pane, "Reject"));
    await app.user.click(within(pane).getByText(`Delete ${FEATURE} and its 2 stories?`));
    (document.activeElement as HTMLElement | null)?.blur();
    await app.user.keyboard("{Escape}");
    expect(within(pane).queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("complementary", { name: `${FEATURE} card` })).toBeTruthy();
    expect(app.calls.some((c) => c.startsWith("reject:"))).toBe(false);
  });

  it("keeps focus inside: Tab wraps between Delete and Cancel, and focus moved outside comes back", async () => {
    const { app, ask } = await openAsk();
    const del = within(ask).getByRole<HTMLButtonElement>("button", { name: "Delete" });
    const cancel = within(ask).getByRole<HTMLButtonElement>("button", { name: "Cancel" });
    expect(document.activeElement).toBe(cancel);
    await app.user.tab();
    expect(ask.contains(document.activeElement)).toBe(true);
    await app.user.tab();
    expect(ask.contains(document.activeElement)).toBe(true);
    await app.user.tab({ shift: true });
    expect(ask.contains(document.activeElement)).toBe(true);
    del.focus();
    await app.user.tab();
    expect(document.activeElement).toBe(cancel);
    screen.getByRole("button", { name: "Work" }).focus();
    expect(ask.contains(document.activeElement)).toBe(true);
  });

  it("puts focus back on Reject after a refused delete, with the error shown", async () => {
    const { app, pane } = await openAsk({
      review: { reject: async () => ({ ok: false, error: "FEAT-2 can't be deleted: git tracks it." }) },
    });
    await app.user.click(within(pane).getByRole("button", { name: "Delete" }));
    expect((await within(pane).findByRole("alert")).textContent).toBe("FEAT-2 can't be deleted: git tracks it.");
    expect(document.activeElement).toBe(button(pane, "Reject"));
  });
});
