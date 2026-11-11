/**
 * STORY-53 (the user's side): a story session opens read-only with its thinking; Stop and Resume sit in the story's Work
 * row and in its session, and the Stopped mark shows in both. The real App over a fake host: the card server applies
 * work-format's rules for Stop and Resume (the agent, the lane and the cap are proved by the server's tests) and the
 * chat server lists the session as the server does.
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PROJECT, renderApp } from "../harness.tsx";
import { cardOf } from "../work-fixtures.ts";

afterEach(cleanup);

const cards = () => ({
  [PROJECT.dir]: [
    cardOf({ id: "FEAT-2", type: "feature", status: "active", title: "Delegation" }),
    cardOf({ id: "STORY-5", type: "story", parent: "FEAT-2", status: "New", title: "Spawn five" }),
  ],
});
type Host = Parameters<typeof renderApp>[0];

/** Starts the story from its row, and the agent starts a turn. */
async function running(host: Host = {}) {
  const app = renderApp({ cards: cards(), ...host });
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(screen.getByRole("button", { name: "Delegation" }));
  await app.user.click(await screen.findByRole("button", { name: "Start STORY-5" }));
  const row = screen.getByRole("row", { name: /Spawn five/ });
  await within(row).findByRole("button", { name: "Open the session of STORY-5" });
  app.chats.emit("story-chat-1", { type: "user", text: "Do STORY-5." }, { type: "started", model: "opus" });
  return { app, row: () => screen.getByRole("row", { name: /Spawn five/ }) };
}
const stop = () => screen.findByRole<HTMLButtonElement>("button", { name: "Stop STORY-5" });
const resume = () => screen.findByRole<HTMLButtonElement>("button", { name: "Resume STORY-5" });

describe("AC1: watching a story session", () => {
  it("opens read-only: the transcript with the agent's thinking, and no composer", async () => {
    const { app, row } = await running();
    await app.user.click(within(row()).getByRole("button", { name: "Open the session of STORY-5" }));
    app.chats.emit(
      "story-chat-1",
      { type: "thinking", block: "m1:0", delta: "The worktree is clean." },
      { type: "text", block: "m1:1", delta: "Starting." },
    );
    const log = await screen.findByRole("log", { name: "Chat" });
    expect(await within(log).findByText("Starting.")).toBeTruthy();
    expect(within(log).getByText("Thinking")).toBeTruthy();
    expect(within(log).getByText("The worktree is clean.")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });
});

describe("AC2: Stop", () => {
  it("is in the row while the turn runs, with no confirmation, and leaves the story's stage with a Stopped mark", async () => {
    const { app, row } = await running();
    await app.user.click(await within(row()).findByRole("button", { name: "Stop STORY-5" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(app.calls).toContain(`stopStory:${PROJECT.dir}:STORY-5`));
    await within(row()).findByText("Stopped");
    expect(within(row()).getByText(/In Progress/)).toBeTruthy();
    expect(within(row()).queryByRole("button", { name: "Stop STORY-5" })).toBeNull();
  });

  it("is in the session too, and the mark shows there", async () => {
    const { app, row } = await running();
    await app.user.click(within(row()).getByRole("button", { name: "Open the session of STORY-5" }));
    const session = await screen.findByRole("region", { name: "Developer" });
    await app.user.click(await within(session).findByRole("button", { name: "Stop STORY-5" }));
    await within(session).findByText("Stopped");
    expect(within(session).getByRole("button", { name: "Resume STORY-5" })).toBeTruthy();
  });

  it("shows the server's refusal in one sentence and keeps the button", async () => {
    const { app, row } = await running({
      review: { stopStory: async () => ({ ok: false, error: "STORY-5 isn't running." }) },
    });
    await app.user.click(await within(row()).findByRole("button", { name: "Stop STORY-5" }));
    expect((await within(row()).findByRole("alert")).textContent).toBe("STORY-5 isn't running.");
    expect((await stop()).disabled).toBe(false);
  });

  it("is not offered while the agent isn't running", async () => {
    const { app, row } = await running();
    app.chats.emit("story-chat-1", { type: "turn-end", outcome: "done" });
    await waitFor(() => expect(within(row()).queryByRole("button", { name: "Stop STORY-5" })).toBeNull());
  });
});

describe("AC3: Resume", () => {
  it("clears the Stopped mark, with no confirmation", async () => {
    const { app, row } = await running();
    await app.user.click(await within(row()).findByRole("button", { name: "Stop STORY-5" }));
    app.chats.emit("story-chat-1", { type: "turn-end", outcome: "stopped" });
    await app.user.click(await within(row()).findByRole("button", { name: "Resume STORY-5" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(app.calls).toContain(`resumeStory:${PROJECT.dir}:STORY-5`));
    await waitFor(() => expect(within(row()).queryByText("Stopped")).toBeNull());
  });

  it("shows the server's refusal when the provider can't resume, and stays Stopped", async () => {
    const refusal = "This agent can't resume a stopped session.";
    const { app, row } = await running({ review: { resumeStory: async () => ({ ok: false, error: refusal }) } });
    await app.user.click(await within(row()).findByRole("button", { name: "Stop STORY-5" }));
    app.chats.emit("story-chat-1", { type: "turn-end", outcome: "stopped" });
    await app.user.click(await resume());
    expect((await within(row()).findByRole("alert")).textContent).toBe(refusal);
    expect(within(row()).getByText("Stopped")).toBeTruthy();
  });
});
