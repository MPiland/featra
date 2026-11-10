/**
 * STORY-49: naming the chat after a draft is best effort. The cards are already written when the rename runs, so a
 * rename that fails is logged and the draft call still succeeds. Real bridge, draft writer and repository.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DraftInput } from "@featra/work-format";
import { createAgentBridge } from "../src/agent-bridge.ts";
import { createDraftWriter } from "../src/draft-writer.ts";
import { createLogWriter } from "../src/log-writer.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";

let scanner: ReturnType<typeof createScanner>;
let repo: CardRepo;
const logged: string[] = [];

beforeAll(async () => {
  scanner = createScanner(createRepoGit());
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "done"));
  repo.commit(repo.main, "plan");
});
afterAll(async () => {
  await scanner.close();
  await repo.dispose();
});

const input: DraftInput = {
  feature: { title: "Shaping", description: "Talk a feature through." },
  stories: [
    { id: null, title: "Draft it", story: "As a builder, I draft.", criteria: ["It drafts"], tasks: ["Build"] },
  ],
};

describe("a rename that fails after a draft", () => {
  it("is logged, and the draft call still answers with the cards it wrote", async () => {
    const bridge = createAgentBridge({
      entry: null,
      enabled: async () => true,
      log: (m) => void logged.push(m),
      chats: {
        info: () => ({ dir: repo.main, session: "chat" }),
        report: () => {},
        retitle: () => {
          throw new Error("disk full");
        },
      },
      writer: createLogWriter({ fs: { read: async () => null, write: async () => {} }, now: () => new Date() }),
      drafts: createDraftWriter({ scan: scanner.scan, now: () => new Date("2026-11-10T09:00:00Z") }),
    });
    const result = await bridge.call("chat-1", "cards.draft", input);
    expect(result).toMatchObject({ created: true, feature: "FEAT-2" });
    expect(logged.join("\n")).toMatch(/rename.*chat-1.*disk full/i);
    expect((await readdir(join(repo.main, ".featra", "cards"))).some((f) => f.startsWith("FEAT-2-"))).toBe(true);
  });
});
