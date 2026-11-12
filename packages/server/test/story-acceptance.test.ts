/**
 * STORY-23: Accept and Send back on a story in Acceptance. Real repository, scanner, card lane and work-format rules;
 * only the chat manager (a platform) and the clock are fakes, and the fake keeps the real manager's refusals.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCEPT_MESSAGES,
  CHAT_MESSAGES,
  parseCard,
  recordEvidence,
  SEND_BACK_MAX,
  type Card,
} from "@featra/work-format";
import { writeAtomic } from "../src/card-actions.ts";
import { ChatError } from "../src/chat-manager.ts";
import { createStoryAcceptance, type StoryAcceptance } from "../src/story-acceptance.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";

let scanner: ReturnType<typeof createScanner>;
let acceptance: StoryAcceptance;
let repo: CardRepo;
let diskWrite: (file: string, text: string) => Promise<void>;
let sent: { chat: string; text: string }[];
let opened: string[];
let session: string | null;
let refuse: Error | null;
/** What opening the session waits for; resolved unless a test holds it. */
let opening: Promise<void>;
const clock = new Date("2026-11-12T09:30:00Z");

const read = async (id = "STORY-1"): Promise<Card> => parseCard(await repo.read(repo.main, id));
/** The story's file as it is now. */
const onDisk = () => repo.read(repo.main, "STORY-1");

beforeEach(async () => {
  sent = [];
  opened = [];
  session = "chat-1";
  refuse = null;
  opening = Promise.resolve();
  diskWrite = writeAtomic;
  scanner = createScanner(createRepoGit());
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "active"));
  await repo.write(repo.main, card("STORY-1", "story", "FEAT-1", "Acceptance"));
  repo.commit(repo.main, "plan");
  acceptance = createStoryAcceptance({
    scan: scanner.scan,
    now: () => clock,
    write: (file, text) => diskWrite(file, text),
    chats: {
      storySession: () => session,
      open: async (id) => {
        opened.push(id);
        await opening;
      },
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

/** Each story row's `awaiting`, from a fresh scan. */
const awaiting = async () =>
  (await scanner.scan(repo.main))?.list.epics
    .flatMap((e) => e.features.flatMap((f) => f.stories))
    .map((s) => s.awaiting);

const verify = async () =>
  repo.write(repo.main, recordEvidence(await read(), "verified", "system", "2026-11-12T08:00:00Z"));

describe("AC2: Accept", () => {
  it("records Accepted in the card's history, by the user, and leaves an unverified story in Acceptance", async () => {
    await acceptance.accept(repo.main, "STORY-1");
    const saved = await read();
    expect(saved.history.at(-1)).toEqual({
      at: "2026-11-12T09:30:00Z",
      field: "accepted",
      from: null,
      to: "accepted",
      by: "user",
    });
    expect(saved.status).toBe("Acceptance");
  });

  it("moves a verified story to Done, by the user", async () => {
    await verify();
    await acceptance.accept(repo.main, "STORY-1");
    const saved = await read();
    expect(saved.status).toBe("Done");
    expect(saved.history.slice(-2).map((e) => [e.field, e.to, e.by])).toEqual([
      ["accepted", "accepted", "user"],
      ["status", "Done", "user"],
    ]);
  });

  it("moves a Researcher story to Done on Accept alone", async () => {
    await repo.write(repo.main, { ...(await read()), role: "researcher" });
    await acceptance.accept(repo.main, "STORY-1");
    expect((await read()).status).toBe("Done");
  });

  it("refuses a story that is not in Acceptance, or is gone, writing nothing", async () => {
    await repo.write(repo.main, card("STORY-2", "story", "FEAT-1", "In Progress"));
    const before = await repo.read(repo.main, "STORY-2");
    await expect(acceptance.accept(repo.main, "STORY-2")).rejects.toThrow(
      ACCEPT_MESSAGES.notWaiting("STORY-2", "In Progress"),
    );
    await expect(acceptance.accept(repo.main, "STORY-9")).rejects.toThrow(ACCEPT_MESSAGES.gone);
    await expect(acceptance.accept(repo.main, "FEAT-1")).rejects.toThrow(ACCEPT_MESSAGES.notStory("FEAT-1"));
    expect(await repo.read(repo.main, "STORY-2")).toBe(before);
  });

  it("refuses a second Accept", async () => {
    await acceptance.accept(repo.main, "STORY-1");
    await expect(acceptance.accept(repo.main, "STORY-1")).rejects.toThrow(ACCEPT_MESSAGES.accepted("STORY-1"));
    expect((await read()).history.filter((e) => e.field === "accepted")).toHaveLength(1);
  });
});

describe("AC3: Send back", () => {
  it("opens the session, sends the reason as the user's message, then returns the story to In Progress with it logged", async () => {
    await expect(acceptance.sendBack(repo.main, "STORY-1", "  It loses the draft.  ", false)).resolves.toEqual({
      recorded: true,
    });
    expect(opened).toEqual(["chat-1"]);
    expect(sent.map(({ chat, text }) => ({ chat, text }))).toEqual([
      { chat: "chat-1", text: "Sent back STORY-1: It loses the draft." },
    ]);
    const saved = await read();
    expect(saved.status).toBe("In Progress");
    expect(saved.history.slice(-2)).toEqual([
      { at: "2026-11-12T09:30:00Z", field: "sent-back", from: null, to: "It loses the draft.", by: "user" },
      { at: "2026-11-12T09:30:00Z", field: "status", from: "Acceptance", to: "In Progress", by: "user" },
    ]);
    expect(saved.acs).toEqual([]);
  });

  it("adds the reason as a new acceptance criterion only when asked", async () => {
    await acceptance.sendBack(repo.main, "STORY-1", "It loses\nthe draft.", true);
    const saved = await read();
    expect(saved.acs).toEqual([{ text: "It loses the draft.", done: false, test: null }]);
    expect(saved.history.at(-1)).toMatchObject({ field: "content", to: "criteria", by: "user" });
  });

  it("refuses an empty or whitespace-only reason, and one over the limit: nothing sent, nothing recorded", async () => {
    const before = await onDisk();
    for (const reason of ["", "   ", "\n\t "])
      await expect(acceptance.sendBack(repo.main, "STORY-1", reason, false)).rejects.toThrow(ACCEPT_MESSAGES.noReason);
    await expect(acceptance.sendBack(repo.main, "STORY-1", "x".repeat(SEND_BACK_MAX + 1), false)).rejects.toThrow(
      ACCEPT_MESSAGES.tooLong,
    );
    expect(sent).toEqual([]);
    expect(await onDisk()).toBe(before);
  });

  it("takes a reason of exactly the limit", async () => {
    await expect(acceptance.sendBack(repo.main, "STORY-1", "x".repeat(SEND_BACK_MAX), false)).resolves.toEqual({
      recorded: true,
    });
  });

  it("is refused, with nothing sent or recorded, when the story's session is gone", async () => {
    session = null;
    const before = await onDisk();
    await expect(acceptance.sendBack(repo.main, "STORY-1", "Fix it.", false)).rejects.toThrow(
      ACCEPT_MESSAGES.noSession("STORY-1"),
    );
    expect(sent).toEqual([]);
    expect(await onDisk()).toBe(before);
  });

  it("writes no history and reports the error when the session refuses the message (a busy session)", async () => {
    const before = await onDisk();
    refuse = new ChatError(CHAT_MESSAGES.busy);
    await expect(acceptance.sendBack(repo.main, "STORY-1", "Fix it.", true)).rejects.toThrow(CHAT_MESSAGES.busy);
    expect(await onDisk()).toBe(before);
  });

  it("is refused for a story that is not in Acceptance: nothing sent", async () => {
    await repo.write(repo.main, card("STORY-2", "story", "FEAT-1", "In Review"));
    await expect(acceptance.sendBack(repo.main, "STORY-2", "Fix it.", false)).rejects.toThrow(
      ACCEPT_MESSAGES.notWaiting("STORY-2", "In Review"),
    );
    expect(sent).toEqual([]);
  });

  it("retries a failed write once, so the message goes once and the send-back is recorded", async () => {
    let attempts = 0;
    diskWrite = async (file, text) => {
      attempts++;
      if (attempts === 1) throw new Error("disk full");
      await writeAtomic(file, text);
    };
    await expect(acceptance.sendBack(repo.main, "STORY-1", "Fix it.", false)).resolves.toEqual({ recorded: true });
    expect(attempts).toBe(2);
    expect(sent).toHaveLength(1);
    expect((await read()).status).toBe("In Progress");
  });

  it("succeeds with recorded:false, not an error, when the retry fails too; the message went once", async () => {
    const before = await onDisk();
    diskWrite = async () => {
      throw new Error("disk full");
    };
    await expect(acceptance.sendBack(repo.main, "STORY-1", "Fix it.", false)).resolves.toEqual({ recorded: false });
    expect(sent).toHaveLength(1);
    expect(await onDisk()).toBe(before);
  });
});

describe("AC4: after Accept", () => {
  it("refuses Send back, sending nothing, and the story is no longer awaiting", async () => {
    await acceptance.accept(repo.main, "STORY-1");
    const accepted = await onDisk();
    await expect(acceptance.sendBack(repo.main, "STORY-1", "Too late.", true)).rejects.toThrow(
      ACCEPT_MESSAGES.accepted("STORY-1"),
    );
    expect(sent).toEqual([]);
    expect(await onDisk()).toBe(accepted);
    const list = (await scanner.scan(repo.main))?.list;
    expect(list?.epics.flatMap((e) => e.features.flatMap((f) => f.stories)).map((s) => s.awaiting)).toEqual([false]);
  });
});

describe("a story owned by a worktree", () => {
  let tree: string;
  beforeEach(() => {
    repo.git(repo.main, "branch", "feature/1");
    tree = repo.worktree("story-1", "story-1", "feature/1");
  });

  it("writes Accept to the worktree's copy and leaves main's alone", async () => {
    const main = await onDisk();
    await acceptance.accept(repo.main, "STORY-1");
    expect(parseCard(await repo.read(tree, "STORY-1")).history.at(-1)).toMatchObject({ field: "accepted", by: "user" });
    expect(await onDisk()).toBe(main);
  });

  it("writes Send back to the worktree's copy and leaves main's alone", async () => {
    const main = await onDisk();
    await acceptance.sendBack(repo.main, "STORY-1", "Fix it.", true);
    const saved = parseCard(await repo.read(tree, "STORY-1"));
    expect(saved.status).toBe("In Progress");
    expect(saved.acs.at(-1)).toMatchObject({ text: "Fix it.", done: false });
    expect(await onDisk()).toBe(main);
  });
});

describe("two actions at once on one story", () => {
  it("refuses a Send back whose session was still opening when Accept landed: nothing sent", async () => {
    let release: (() => void) | undefined;
    opening = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sending = acceptance.sendBack(repo.main, "STORY-1", "Fix it.", false);
    await vi.waitFor(() => expect(opened).toEqual(["chat-1"]));
    await acceptance.accept(repo.main, "STORY-1");
    release?.();
    await expect(sending).rejects.toThrow(ACCEPT_MESSAGES.accepted("STORY-1"));
    expect(sent).toEqual([]);
    expect((await read()).status).toBe("Acceptance");
  });

  it("lets one of two Accepts succeed and refuses the other, with one Accepted event", async () => {
    const results = await Promise.allSettled([
      acceptance.accept(repo.main, "STORY-1"),
      acceptance.accept(repo.main, "STORY-1"),
    ]);
    expect(results.map((r) => r.status).toSorted()).toEqual(["fulfilled", "rejected"]);
    const refusal = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(refusal.reason)).toContain(ACCEPT_MESSAGES.accepted("STORY-1"));
    expect((await read()).history.filter((e) => e.field === "accepted")).toHaveLength(1);
  });
});

describe("the Work row follows the card pane on a copy that can't be edited (AC1)", () => {
  it("offers Accept and Send back when the owner's copy is checked out", async () => {
    expect(await awaiting()).toEqual([true]);
  });

  it("offers neither when the story's owner is a feature branch with no working tree", async () => {
    // A feature branch with work of its own is started, not merged.
    repo.git(repo.main, "branch", "feature/1");
    await repo.commitOn(
      "feature/1",
      (t) => repo.write(t, card("FEAT-1", "feature", null, "active", { notes: "started" })),
      "start",
    );
    expect(await awaiting()).toEqual([false]);
  });
});
