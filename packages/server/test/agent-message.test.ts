/**
 * STORY-54 AC3: `session.message` through the real agent bridge and the real message module. The MCP's off switch
 * applies; the knowledge setting does not (a message writes no card or knowledge file, and a read-only project withholds
 * the whole MCP before any call); a story session may not message; a server without the module says so.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { MESSAGE_MESSAGES, type KnowledgePermission } from "@featra/work-format";
import { AGENT_MESSAGES, createAgentBridge } from "../src/agent-bridge.ts";
import { createLogWriter } from "../src/log-writer.ts";
import { createStoryMessage } from "../src/story-message.ts";

const settings: { enabled: boolean; knowledge: KnowledgePermission } = { enabled: true, knowledge: "propose" };
const writer = createLogWriter({ fs: { read: async () => null, write: async () => {} }, now: () => new Date() });
const params = { story: "STORY-5", text: "Go on." };

/** A bridge whose chat-1 is a Dev Lead's and chat-2 a story session's, over a project with no cards. */
function bridge(withMessages: boolean) {
  return createAgentBridge({
    entry: null,
    enabled: async () => settings.enabled,
    knowledge: async () => settings.knowledge,
    chats: {
      info: (id) =>
        id === "chat-1"
          ? { dir: "/p", session: "Dev Lead" }
          : id === "chat-2"
            ? { dir: "/p", session: "Story", story: true }
            : null,
      report: () => {},
      retitle: () => {},
    },
    writer,
    ...(withMessages
      ? {
          messages: createStoryMessage({
            scan: async () => null,
            chats: { storySession: () => null, list: () => [], open: async () => {}, send: () => {} },
          }),
        }
      : {}),
  });
}

beforeEach(() => {
  settings.enabled = true;
  settings.knowledge = "propose";
});

describe("session.message on the bridge", () => {
  it("is refused when the project's MCP is off", async () => {
    settings.enabled = false;
    await expect(bridge(true).call("chat-1", "session.message", params)).rejects.toThrow(AGENT_MESSAGES.mcpOff);
  });

  it("is not refused for a read-only knowledge setting: it writes none", async () => {
    settings.knowledge = "read-only";
    await expect(bridge(true).call("chat-1", "session.message", params)).rejects.toThrow(MESSAGE_MESSAGES.gone);
  });

  it("is refused to a story session, whatever it names", async () => {
    await expect(bridge(true).call("chat-2", "session.message", params)).rejects.toThrow(AGENT_MESSAGES.sessionMessage);
  });

  it("says messaging isn't available when the server has no message module", async () => {
    await expect(bridge(false).call("chat-1", "session.message", params)).rejects.toThrow(AGENT_MESSAGES.noMessage);
  });

  it("refuses a malformed message with why", async () => {
    await expect(bridge(true).call("chat-1", "session.message", { story: "FEAT-2", text: "Hi." })).rejects.toThrow(
      MESSAGE_MESSAGES.badStory,
    );
  });
});
