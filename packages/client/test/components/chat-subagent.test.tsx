/**
 * STORY-55 (the user's side): a subagent a session spawned is nested under it in the sidebar with its live transcript,
 * read-only; Stop is offered only where the provider can end it alone; its approvals and questions name it. The real App
 * over a fake host: the chat server keeps each row with work-format's real rules, and the test plays the server.
 */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CHAT_COPY } from "../../src/chats.ts";
import { renderApp } from "../harness.tsx";

afterEach(cleanup);

type App = ReturnType<typeof renderApp>;

/** A Developer chat the user started, whose agent has spawned one subagent. */
async function spawned(stoppable = true) {
  const app = renderApp();
  await app.user.keyboard("{Control>}n{/Control}");
  await app.user.click(await screen.findByRole("button", { name: /^Developer/ }));
  await screen.findByRole("region", { name: "Developer" });
  const session = "chat-1";
  const sub = app.chats.addSubagent(session, "Review the diff", stoppable);
  return { app, session, sub };
}

const nest = () => screen.findByRole("list", { name: CHAT_COPY.subagentsOf("Developer") });
const open = async (app: App) => app.user.click(within(await nest()).getByRole("button", { name: /Review the diff/ }));

describe("AC1: a subagent nested under its session, read-only", () => {
  it("shows it under the session in the sidebar, and opens its live transcript with no composer", async () => {
    const { app, sub } = await spawned();
    expect(within(await nest()).getAllByRole("button")).toHaveLength(1);
    await open(app);
    app.chats.emit(sub, { type: "user", text: "Review the diff." }, { type: "text", block: "m1:0", delta: "Looking." });
    const log = await screen.findByRole("log", { name: "Chat" });
    expect(await within(log).findByText("Looking.")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: CHAT_COPY.composer })).toBeNull();
    expect(screen.queryByRole("button", { name: CHAT_COPY.send })).toBeNull();
    expect(screen.getByRole("note").textContent).toBe(CHAT_COPY.watchingSubagent);
    app.chats.emit(sub, { type: "text", block: "m1:0", delta: " Done." });
    expect(await within(log).findByText("Looking. Done.")).toBeTruthy();
  });
});

describe("AC2: Stop on a nested subagent", () => {
  it("stops that subagent alone, and the button goes when it ends", async () => {
    const { app, session, sub } = await spawned();
    await open(app);
    await app.user.click(await screen.findByRole("button", { name: CHAT_COPY.stopSubagent("Subagent") }));
    expect(app.calls).toContain(`chat.stop:${sub}`);
    expect(app.calls).not.toContain(`chat.stop:${session}`);
    app.chats.endSubagent(sub);
    await expect.poll(() => screen.queryByRole("button", { name: CHAT_COPY.stopSubagent("Subagent") })).toBeNull();
  });

  it("shows no Stop where the provider can't stop it alone", async () => {
    const { app } = await spawned(false);
    await open(app);
    await screen.findByRole("note");
    expect(screen.queryByRole("button", { name: CHAT_COPY.stopSubagent("Subagent") })).toBeNull();
  });
});

describe("AC3: approvals and questions say which subagent asked", () => {
  it("labels a tool approval and a question the subagent asked in the session", async () => {
    const { app, session } = await spawned();
    app.chats.emit(
      session,
      {
        type: "approval",
        id: "t1",
        name: "Bash",
        input: { command: "ls" },
        forChat: false,
        subagent: "Review the diff",
      },
      {
        type: "question",
        id: "q1",
        name: "AskUserQuestion",
        questions: [
          { question: "Which?", header: "Pick", options: [{ label: "A", description: "a" }], multiSelect: false },
        ],
        subagent: "Review the diff",
      },
    );
    const asked = await screen.findAllByText(CHAT_COPY.askedBySubagent("Review the diff"));
    expect(asked).toHaveLength(2);
  });

  it("labels nothing for the session's own request", async () => {
    const { app, session } = await spawned();
    app.chats.emit(session, { type: "approval", id: "t1", name: "Bash", input: { command: "ls" }, forChat: false });
    await screen.findByRole("button", { name: CHAT_COPY.allow });
    expect(screen.queryByText(/Asked by the subagent/)).toBeNull();
  });
});

describe("an ended subagent stays nested until the user archives it", () => {
  const archiveName = { name: CHAT_COPY.archiveSubagent("Review the diff") };

  it("is marked ended, offers Archive only then, and Archive removes the row", async () => {
    const { app, sub } = await spawned();
    const list = await nest();
    expect(within(list).queryByRole("button", archiveName)).toBeNull();
    app.chats.endSubagent(sub);
    expect(await within(list).findByText(CHAT_COPY.ended)).toBeTruthy();
    await app.user.click(within(list).getByRole("button", archiveName));
    expect(app.calls).toContain(`chat.archive:${sub}`);
    await expect.poll(() => screen.queryByRole("list", { name: CHAT_COPY.subagentsOf("Developer") })).toBeNull();
  });
});

describe("a subagent chat has no session controls", () => {
  it("does not ask the host for the chat's controls", async () => {
    const { app, sub } = await spawned();
    await open(app);
    await screen.findByRole("note");
    expect(app.calls.filter((c) => c.startsWith("chat.controls:"))).not.toContain(`chat.controls:${sub}`);
  });
});
