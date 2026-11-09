/**
 * STORY-5: New chat, the role picker and the chat view, through the real App. The host's server is faked
 * (chat-server.ts): it records the chat's events, and the view folds them with work-format's real rules.
 */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BUILT_IN_ROLES } from "@featra/work-format/roles";
import { CHAT_COPY } from "../../src/chats.ts";
import { PROJECT, renderApp } from "../harness.tsx";

afterEach(cleanup);

const composer = () => screen.getByRole("textbox", { name: CHAT_COPY.composer });
const log = () => screen.getByRole("log", { name: CHAT_COPY.transcript });

/** Opens New chat, picks `role`, and waits for its chat. */
async function startChat(role = "Developer", opts: Parameters<typeof renderApp>[0] = {}) {
  const app = renderApp(opts);
  await app.user.click(screen.getByRole("button", { name: CHAT_COPY.newChat }));
  const dialog = await screen.findByRole("dialog", { name: CHAT_COPY.newChat });
  await app.user.click(await within(dialog).findByRole("button", { name: new RegExp(`^${role}`) }));
  await screen.findByRole("region", { name: role });
  return app;
}

describe("AC5: New chat picks one of the five roles, each in Ask", () => {
  it("lists the built-in roles with their model, effort and Ask", async () => {
    const { user } = renderApp();
    await user.click(screen.getByRole("button", { name: CHAT_COPY.newChat }));
    const list = await screen.findByRole("list", { name: CHAT_COPY.roles });
    await expect.poll(() => within(list).queryAllByRole("button").length).toBe(5);
    expect(
      within(list)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(BUILT_IN_ROLES.map((r) => `${r.name}${r.model} · ${r.effort} · Ask`));
  });

  it("starts the chat in the project and shows it under the role's name, in Ask", async () => {
    const { calls } = await startChat("Dev Lead");
    expect(calls).toContain(`chat.start:${PROJECT.dir}:dev-lead`);
    const chat = screen.getByRole("region", { name: "Dev Lead" });
    expect(within(chat).getByText(CHAT_COPY.ask)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Dev Lead");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is off without a project", () => {
    renderApp({ project: null });
    expect(screen.getByRole("button", { name: CHAT_COPY.newChat }).hasAttribute("disabled")).toBe(true);
  });

  it("shows why a chat couldn't start, and stays open", async () => {
    const { user } = renderApp({ startError: "This role's agent isn't available." });
    await user.click(screen.getByRole("button", { name: CHAT_COPY.newChat }));
    await user.click(await screen.findByRole("button", { name: /^QA/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("This role's agent isn't available.");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("leaves the chat for the view the user opens", async () => {
    const { user } = await startChat();
    await user.click(screen.getByRole("button", { name: "Work" }));
    expect(screen.queryByRole("region", { name: "Developer" })).toBeNull();
  });
});

describe("AC2: the composer, the streamed reply and Stop", () => {
  it("sends on Enter, adds a line on Shift+Enter, and clears once sent", async () => {
    const { user, calls } = await startChat();
    await user.type(composer(), "first line{Shift>}{Enter}{/Shift}second line");
    expect((composer() as HTMLTextAreaElement).value).toBe("first line\nsecond line");
    expect(calls.filter((c) => c.startsWith("chat.send"))).toEqual([]);
    await user.keyboard("{Enter}");
    expect(calls).toContain("chat.send:chat-1:first line\nsecond line");
    expect((composer() as HTMLTextAreaElement).value).toBe("");
    expect(within(log()).getByText(/first line/).textContent).toBe("first line\nsecond line");
  });

  it("doesn't send a blank message", async () => {
    const { user, calls } = await startChat();
    await user.type(composer(), "   {Enter}");
    expect(calls.filter((c) => c.startsWith("chat.send"))).toEqual([]);
    expect(screen.getByRole("button", { name: CHAT_COPY.send }).hasAttribute("disabled")).toBe(true);
  });

  it("shows the reply as it streams, and offers Stop until the turn ends", async () => {
    const { user, chats } = await startChat();
    await user.type(composer(), "hi{Enter}");
    chats.emit("chat-1", { type: "text", block: "m1:0", delta: "Hel" });
    expect(within(log()).getByText("Hel")).toBeTruthy();
    chats.emit("chat-1", { type: "text", block: "m1:0", delta: "lo there" });
    expect(within(log()).getByText("Hello there")).toBeTruthy();
    expect(screen.getByRole("button", { name: CHAT_COPY.stop })).toBeTruthy();
    chats.emit("chat-1", { type: "turn-end", outcome: "done" });
    expect(screen.queryByRole("button", { name: CHAT_COPY.stop })).toBeNull();
    expect(screen.getByRole("button", { name: CHAT_COPY.send })).toBeTruthy();
  });

  it("stops the running turn, and says so when it ends", async () => {
    const { user, chats, calls } = await startChat();
    await user.type(composer(), "slow{Enter}");
    await user.type(composer(), "next{Enter}");
    expect(calls.filter((c) => c.startsWith("chat.send"))).toEqual(["chat.send:chat-1:slow"]);
    await user.click(screen.getByRole("button", { name: CHAT_COPY.stop }));
    expect(calls).toContain("chat.stop:chat-1");
    chats.emit("chat-1", { type: "turn-end", outcome: "stopped" });
    expect(within(log()).getByRole("status").textContent).toBe(CHAT_COPY.stopped);
  });

  it("shows why Stop failed", async () => {
    const { user } = await startChat("Developer", { stopError: "The server isn't running." });
    await user.type(composer(), "slow{Enter}");
    await user.click(screen.getByRole("button", { name: CHAT_COPY.stop }));
    expect((await screen.findByRole("alert")).textContent).toBe("The server isn't running.");
  });

  it("keeps a message the server refused, with why", async () => {
    const { user } = await startChat("Developer", { sendError: "Wait for the reply, or stop it." });
    await user.type(composer(), "hello{Enter}");
    expect((await screen.findByRole("alert")).textContent).toBe("Wait for the reply, or stop it.");
    expect((composer() as HTMLTextAreaElement).value).toBe("hello");
  });
});

describe("AC3: a tool call is one collapsed row that opens to its input and result", () => {
  it("shows the tool and a summary, then the input and result when opened", async () => {
    const { user, chats } = await startChat();
    await user.type(composer(), "read it{Enter}");
    chats.emit(
      "chat-1",
      { type: "tool", id: "t1", name: "Read", input: { file_path: "src/app.ts" } },
      { type: "tool-result", id: "t1", output: "export {}", isError: false },
    );
    const row = within(log()).getByRole("button", { name: /Read/ });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(row.textContent).toBe("Readsrc/app.ts");
    expect(within(log()).queryByText("export {}")).toBeNull();
    await user.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(within(log()).getByText(/"file_path": "src\/app.ts"/)).toBeTruthy();
    expect(within(log()).getByText("export {}")).toBeTruthy();
    await user.click(row);
    expect(within(log()).queryByText("export {}")).toBeNull();
  });

  it("marks a denied call on its row (AC5)", async () => {
    const { user, chats } = await startChat();
    await user.type(composer(), "test it{Enter}");
    chats.emit(
      "chat-1",
      { type: "tool", id: "t1", name: "Bash", input: { command: "npm test" } },
      { type: "tool-denied", id: "t1", name: "Bash", input: { command: "npm test" } },
    );
    const row = within(log()).getByRole("button", { name: /Bash/ });
    expect(row.textContent).toBe(`Bashnpm test${CHAT_COPY.denied}`);
  });
});

describe("AC2, AC3: a call the user stopped", () => {
  it("is marked stopped on its row, not denied", async () => {
    const { user, chats } = await startChat();
    await user.type(composer(), "test it{Enter}");
    chats.emit(
      "chat-1",
      { type: "tool", id: "t1", name: "Bash", input: { command: "npm test" } },
      { type: "turn-end", outcome: "stopped" },
    );
    const row = within(log()).getByRole("button", { name: /Bash/ });
    expect(row.textContent).toBe(`Bashnpm test${CHAT_COPY.toolStopped}`);
  });
});

describe("AC4: a missing or logged-out claude shows one line, and no login", () => {
  it.each([
    [{ type: "not-installed" } as const, CHAT_COPY.notInstalled],
    [{ type: "logged-out" } as const, CHAT_COPY.loggedOut],
    [{ type: "failed", message: "claude exited with code 1" } as const, "claude exited with code 1"],
  ])("shows %o as one line", async (problem, line) => {
    const { user, chats } = await startChat();
    await user.type(composer(), "hello{Enter}");
    chats.emit("chat-1", { type: "problem", problem });
    expect(within(log()).getByRole("status").textContent).toBe(line);
    expect(screen.queryByRole("button", { name: /log ?in|sign ?in/i })).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
