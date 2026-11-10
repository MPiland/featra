/**
 * STORY-50: Send back. One server method sends the reason to the drafting chat, then records it in the feature's
 * history. Real repository, scanner, card actions and draft writer; only the chat manager (a platform) and the clock
 * are fakes, and the fake keeps the real manager's refusals.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CHAT_MESSAGES, parseCard, type Card, type DraftInput } from "@featra/work-format";
import { ChatError } from "../src/chat-manager.ts";
import { createCardActions } from "../src/card-actions.ts";
import { createCardLane } from "../src/card-lane.ts";
import { createDraftActions, SEND_BACK_MESSAGES, type DraftActions } from "../src/draft-actions.ts";
import { createDraftWriter, type DraftWriter } from "../src/draft-writer.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";

let scanner: ReturnType<typeof createScanner>;
let writer: DraftWriter;
let actions: ReturnType<typeof createCardActions>;
let sendBack: DraftActions;
let repo: CardRepo;
let sent: { chat: string; text: string }[];
let known: Set<string>;
let refuse: Error | null;
let opened: string[];
const clock = new Date("2026-11-10T09:30:00Z");

beforeEach(async () => {
  sent = [];
  opened = [];
  refuse = null;
  known = new Set(["chat-1"]);
  scanner = createScanner(createRepoGit());
  const lane = createCardLane();
  writer = createDraftWriter({ scan: scanner.scan, now: () => clock, lane });
  actions = createCardActions({ scan: scanner.scan, now: () => clock, lane });
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "done"));
  repo.commit(repo.main, "plan");
  sendBack = createDraftActions({
    scan: scanner.scan,
    now: () => clock,
    lane,
    chats: {
      dirOf: (id) => (known.has(id) ? repo.main : null),
      open: async (id) => void opened.push(id),
      send: (chat, text) => {
        if (refuse) throw refuse;
        sent.push({ chat, text });
      },
    },
  });
});
afterEach(async () => {
  await scanner.close();
  await repo.dispose();
});

const input: DraftInput = {
  feature: { title: "Shaping", description: "Talk a feature through." },
  stories: [{ id: null, title: "One", story: "As a builder, I draft.", criteria: ["It drafts"], tasks: ["Build"] }],
};
const dir = () => join(repo.main, ".featra", "cards");
const read = async (id: string): Promise<Card> => {
  const name = (await readdir(dir())).find((f) => f.startsWith(`${id}-`)) ?? "";
  return parseCard(await readFile(join(dir(), name), "utf8"));
};
const draftFeature = async () => (await writer.draft(repo.main, "chat-1", input)).feature;
const kinds = async (id: string) => (await read(id)).history.map((e) => e.field);

describe("sending a draft back", () => {
  it("sends the prefixed reason to the drafting chat, then records a by:user sent-back entry with the reason", async () => {
    const feature = await draftFeature();
    await sendBack.sendBack(repo.main, feature, "  Split the second story.  ");
    expect(opened).toEqual(["chat-1"]);
    expect(sent).toEqual([{ chat: "chat-1", text: `Sent back ${feature}: Split the second story.` }]);
    expect((await read(feature)).history.at(-1)).toEqual({
      at: "2026-11-10T09:30:00Z",
      field: "sent-back",
      from: null,
      to: "Split the second story.",
      by: "user",
    });
  });

  it("refuses an empty or whitespace-only reason: nothing sent, nothing recorded", async () => {
    const feature = await draftFeature();
    const before = await kinds(feature);
    for (const reason of ["", "   ", "\n\t "])
      await expect(sendBack.sendBack(repo.main, feature, reason)).rejects.toThrow(SEND_BACK_MESSAGES.noReason);
    expect(sent).toEqual([]);
    expect(await kinds(feature)).toEqual(before);
  });

  it("writes no history and reports the error when the chat refuses the message (a busy chat, as a normal send)", async () => {
    const feature = await draftFeature();
    const before = await kinds(feature);
    refuse = new ChatError(CHAT_MESSAGES.busy);
    await expect(sendBack.sendBack(repo.main, feature, "Too big.")).rejects.toThrow(CHAT_MESSAGES.busy);
    expect(await kinds(feature)).toEqual(before);
  });

  it("is refused, with nothing recorded, when the drafting chat is gone", async () => {
    const feature = await draftFeature();
    known.clear();
    const before = await kinds(feature);
    await expect(sendBack.sendBack(repo.main, feature, "Too big.")).rejects.toThrow(SEND_BACK_MESSAGES.noChat);
    expect(sent).toEqual([]);
    expect(await kinds(feature)).toEqual(before);
  });

  it("is refused for a feature that is no longer a draft, and for a card that isn't a draft feature", async () => {
    const made = await writer.draft(repo.main, "chat-1", input);
    const feature = made.feature;
    const story = made.stories[0] as string;
    await expect(sendBack.sendBack(repo.main, story, "x")).rejects.toThrow(SEND_BACK_MESSAGES.notDraft(story));
    await repo.write(repo.main, { ...(await read(feature)), status: "approved" });
    await expect(sendBack.sendBack(repo.main, feature, "x")).rejects.toThrow(SEND_BACK_MESSAGES.notDraft(feature));
    await expect(sendBack.sendBack(repo.main, "FEAT-99", "x")).rejects.toThrow(SEND_BACK_MESSAGES.gone);
    expect(sent).toEqual([]);
  });

  it("does not block the agent's next revision (the user-edit guard ignores a send-back)", async () => {
    const feature = await draftFeature();
    await sendBack.sendBack(repo.main, feature, "Rename it.");
    const revised = await writer.draft(repo.main, "chat-1", {
      ...input,
      feature: { ...input.feature, title: "Shaping, revised" },
      stories: input.stories.map((s) => ({ ...s, id: "STORY-1" })),
    });
    expect(revised).toMatchObject({ created: false, feature });
    expect((await read(feature)).title).toBe("Shaping, revised");
  });

  it("still lets a real pane edit block the agent after a send-back (the guard is intact)", async () => {
    const feature = await draftFeature();
    await sendBack.sendBack(repo.main, feature, "Rename it.");
    await actions.update(repo.main, feature, { field: "title", from: "Shaping", to: "My title" });
    await expect(
      writer.draft(repo.main, "chat-1", {
        ...input,
        stories: input.stories.map((s) => Object.assign({}, s, { id: "STORY-1" })),
      }),
    ).rejects.toThrow(/edited/);
  });
});
