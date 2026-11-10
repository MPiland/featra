/**
 * STORY-52 AC1 (the user's side): Start on an approved feature, in Work's card pane and in the chat's docked pane. The
 * real App over a fake host whose card server records the call and changes the card as work-format's rules say; the
 * branch, the commit and the files are proved against a real repository by the server's tests.
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, planDraft, type Card } from "@featra/work-format";
import { PROJECT, renderApp } from "../harness.tsx";
import { cardOf } from "../work-fixtures.ts";

afterEach(cleanup);

const FEATURE = "FEAT-2";
const NO_BASE = "There's no main branch. Create it, or set baseBranch in .featra/config.yaml.";
type Host = Parameters<typeof renderApp>[0];

function drafted(chat: string): Card[] {
  const planned = planDraft(
    {
      feature: { title: "Shaping", description: "Talk a feature through." },
      stories: [
        { id: null, title: "Draft it", story: "As a builder, I draft.", criteria: ["It shows"], tasks: ["Build"] },
      ],
    },
    {
      cards: [cardOf({ id: "FEAT-1", type: "feature", status: "done", title: "Built" })],
      config: DEFAULT_CONFIG,
      chat,
      at: "2026-11-10T09:00:00Z",
    },
  );
  if (!planned.ok) throw new Error(planned.error);
  return planned.value.writes.map((w) => w.card);
}

function withStatus(to: string): Card[] {
  const cards = drafted("chat-9");
  for (const c of cards) if (c.id === FEATURE) c.status = to;
  return cards;
}

/** Work's own pane on the feature, opened from its row (an approved feature has no Review draft). */
async function workPane(host: Host = {}, status = "approved") {
  const app = renderApp({ ...host, cards: { [PROJECT.dir]: withStatus(status) } });
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(screen.getByRole("button", { name: `Open ${FEATURE}` }));
  return { app, pane: await screen.findByRole("complementary", { name: `${FEATURE} card` }) };
}

/** A Dev Lead chat whose draft is open in the docked pane and then approved there. */
async function approvedInChat(host: Host = {}) {
  const app = renderApp({ ...host, cards: { [PROJECT.dir]: drafted("chat-1") } });
  await app.chats.bridge.start(PROJECT.dir, "dev-lead");
  await screen.findByRole("region", { name: "Work list" });
  app.chats.retitle("chat-1", "Shaping", "draft");
  await app.user.click(screen.getByRole("button", { name: `Review draft ${FEATURE}` }));
  const pane = await screen.findByRole("complementary", { name: `${FEATURE} card` });
  await app.user.click(await within(pane).findByRole("button", { name: "Approve" }));
  return { app, pane };
}

const start = (pane: HTMLElement) => within(pane).findByRole<HTMLButtonElement>("button", { name: "Start" });
const status = (app: { cardsIn: (dir: string) => Card[] }) =>
  app.cardsIn(PROJECT.dir).find((c) => c.id === FEATURE)?.status;

describe("where Start is offered", () => {
  it("is in Work's card pane on an approved feature, named Start", async () => {
    const { pane } = await workPane();
    const button = await start(pane);
    expect(button.textContent).toBe("Start");
    expect(button.disabled).toBe(false);
  });

  it("appears in the chat's docked pane once the draft is approved there", async () => {
    const { pane } = await approvedInChat();
    await start(pane);
    expect(within(pane).queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("is not on a draft or an active feature, and neither has an Open button on its row", async () => {
    for (const kind of ["draft", "active"]) {
      renderApp({ cards: { [PROJECT.dir]: withStatus(kind) } });
      await screen.findByRole("region", { name: "Work list" });
      expect(screen.queryByRole("button", { name: `Open ${FEATURE}` })).toBeNull();
      expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
      cleanup();
    }
  });

  it("is on the pane of an approved feature opened by its Open button, reachable from the keyboard", async () => {
    const app = renderApp({ cards: { [PROJECT.dir]: withStatus("approved") } });
    await screen.findByRole("region", { name: "Work list" });
    screen.getByRole<HTMLButtonElement>("button", { name: `Open ${FEATURE}` }).focus();
    await app.user.keyboard("{Enter}");
    expect(await start(await screen.findByRole("complementary", { name: `${FEATURE} card` }))).toBeTruthy();
  });

  it("is not on a story of an approved feature", async () => {
    const app = renderApp({ cards: { [PROJECT.dir]: withStatus("approved") } });
    await screen.findByRole("region", { name: "Work list" });
    await app.user.click(screen.getByRole("button", { name: "Shaping" }));
    await app.user.click(screen.getByRole("button", { name: "Draft it" }));
    const story = await screen.findByRole("complementary", { name: /^STORY-\d+ card$/ });
    await within(story).findByRole("button", { name: "Title: Draft it" });
    expect(within(story).queryByRole("button", { name: "Start" })).toBeNull();
  });
});

describe("AC1: Start", () => {
  it("acts at once, with no confirmation, and the button is gone once the feature is active", async () => {
    const { app, pane } = await workPane();
    await app.user.click(await start(pane));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(app.calls).toContain(`start:${PROJECT.dir}:${FEATURE}`));
    await waitFor(() => expect(within(pane).queryByRole("button", { name: "Start" })).toBeNull());
    expect(status(app)).toBe("active");
    expect(document.activeElement).toBe(pane);
  });

  it("works from the chat's docked pane too", async () => {
    const { app, pane } = await approvedInChat();
    await app.user.click(await start(pane));
    await waitFor(() => expect(status(app)).toBe("active"));
    await waitFor(() => expect(within(pane).queryByRole("button", { name: "Start" })).toBeNull());
    expect(screen.getByRole("region", { name: "Dev Lead" })).toBeTruthy();
  });

  it("is reached and pressed from the keyboard", async () => {
    const { app, pane } = await workPane();
    (await start(pane)).focus();
    await app.user.keyboard("{Enter}");
    await waitFor(() => expect(status(app)).toBe("active"));
  });
});

describe("AC4: a refusal", () => {
  it("shows in an alert, keeps the button, and can be tried again", async () => {
    let tries = 0;
    const { app, pane } = await workPane({
      review: { start: async () => (++tries === 1 ? { ok: false, error: NO_BASE } : { ok: true }) },
    });
    await app.user.click(await start(pane));
    expect((await within(pane).findByRole("alert")).textContent).toBe(NO_BASE);
    expect((await start(pane)).disabled).toBe(false);
    await app.user.click(await start(pane));
    await waitFor(() => expect(tries).toBe(2));
    await waitFor(() => expect(within(pane).queryByRole("alert")).toBeNull());
  });

  it("shows a thrown error and turns the button back on", async () => {
    const { app, pane } = await workPane({
      review: {
        start: async () => {
          throw new Error("Socket closed.");
        },
      },
    });
    await app.user.click(await start(pane));
    expect((await within(pane).findByRole("alert")).textContent).toBe("Socket closed.");
    expect((await start(pane)).disabled).toBe(false);
  });

  it("turns the button off while it runs, so it can't be sent twice", async () => {
    const gate = { open: () => {} };
    const held = new Promise<void>((resolve) => {
      gate.open = resolve;
    });
    const { app, pane } = await workPane({ review: { start: () => held.then(() => ({ ok: true as const })) } });
    await app.user.click(await start(pane));
    await waitFor(async () => expect((await start(pane)).disabled).toBe(true));
    await app.user.click(within(pane).getByRole("button", { name: "Start" }));
    expect(app.calls.filter((c) => c.startsWith("start:"))).toHaveLength(1);
    gate.open();
  });
});
