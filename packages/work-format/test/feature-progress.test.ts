import { describe, expect, it } from "vitest";
import {
  DRAFTED_BY,
  MAIN,
  buildWorkList,
  featureBranch,
  featureRowOf,
  featuresLedBy,
  normalizeWorkList,
  storyChat,
  waitsOnUser,
  type Card,
  type ChatSummary,
  type OwnerLocation,
  type OwnedCard,
} from "../src/index.ts";
import { config, feature, story } from "./fixtures.ts";

const FEATURE_BRANCH: OwnerLocation = { kind: "feature", branch: "feature/1-progress" };
const owned = (card: Card, owner: OwnerLocation = MAIN): OwnedCard => ({
  card,
  owner,
  shownFrom: owner,
  path: `.featra/cards/${card.id}.md`,
});
const drafted = (card: Card, chat: string): Card => ({ ...card, extra: { ...card.extra, [DRAFTED_BY]: chat } });

/** A feature card the chat "lead" drafted. */
const led = (id: string, status: string) => owned(drafted(feature(id, status, null), "lead"));

const chat = (id: string, extra: Partial<ChatSummary> = {}): ChatSummary => ({
  id,
  provider: "claude",
  role: { id: "dev-lead", name: "Dev Lead", model: "m", effort: "medium" },
  title: id,
  startedAt: "2026-11-01T00:00:00Z",
  running: false,
  waiting: null,
  ...extra,
});
const session = (id: string, storyId: string, parent: string | null, feat: string, extra: Partial<ChatSummary> = {}) =>
  chat(id, { story: { id: storyId, parent, feature: feat, featureTitle: feat }, ...extra });

const list = buildWorkList(
  {
    cards: [
      owned(feature("FEAT-1", "active", null), FEATURE_BRANCH),
      owned(story("STORY-1", "FEAT-1"), FEATURE_BRANCH),
      owned(drafted(feature("FEAT-2", "approved", null), "lead")),
      owned(feature("FEAT-3", "active", null)),
      owned(drafted(feature("FEAT-12", "active", null), "lead")),
      owned(story("STORY-9", null)),
    ],
    stale: [],
    problems: [],
  },
  config,
);

describe("a feature row's branch", () => {
  it("is the feature's own branch while it owns the feature's card", () => {
    expect(featureRowOf(list, "FEAT-1")?.branch).toBe("feature/1-progress");
  });

  it("is absent while main owns the card, and on the row of stories without a feature", () => {
    expect(featureRowOf(list, "FEAT-3")?.branch).toBeUndefined();
    const none = list.epics.flatMap((e) => e.features).find((f) => f.id === null);
    expect(none?.branch).toBeUndefined();
  });

  it("survives the trip to the client, and a bad one is dropped", () => {
    const sent = normalizeWorkList(JSON.parse(JSON.stringify(list)));
    expect(featureRowOf(sent, "FEAT-1")?.branch).toBe("feature/1-progress");
    const raw = JSON.parse(JSON.stringify(list));
    raw.epics[0].features[0].branch = 7;
    expect(normalizeWorkList(raw).epics[0]?.features[0]?.branch).toBeUndefined();
  });
});

describe("featureBranch", () => {
  const states = buildWorkList(
    {
      cards: [
        owned(feature("FEAT-1", "active", null), FEATURE_BRANCH),
        owned(feature("FEAT-2", "approved", null)),
        owned(feature("FEAT-3", "draft", null)),
        owned(feature("FEAT-4", "done", null)),
      ],
      stale: [],
      problems: [],
    },
    config,
  );
  const of = (id: string) => {
    const row = featureRowOf(states, id);
    if (!row) throw new Error(`${id} is not in the list.`);
    return featureBranch(row);
  };

  it("is the branch's name while the feature branch owns the card", () => {
    expect(of("FEAT-1")).toEqual({ kind: "branch", name: "feature/1-progress" });
  });

  it("is not started before Start", () => {
    expect(of("FEAT-2")).toEqual({ kind: "not-started" });
    expect(of("FEAT-3")).toEqual({ kind: "not-started" });
  });

  it("is merged for a done feature", () => {
    expect(of("FEAT-4")).toEqual({ kind: "merged" });
  });
});

describe("featureRowOf", () => {
  it("finds a feature by id, and nothing for an unknown id or a story", () => {
    expect(featureRowOf(list, "FEAT-2")?.id).toBe("FEAT-2");
    expect(featureRowOf(list, "FEAT-99")).toBeNull();
    expect(featureRowOf(list, "STORY-1")).toBeNull();
  });
});

describe("featuresLedBy", () => {
  it("is the features the chat drafted, the active one first", () => {
    expect(featuresLedBy("lead", list, [chat("lead")]).map((f) => f.id)).toEqual(["FEAT-12", "FEAT-2"]);
  });

  it("puts an active feature before one the chat just drafted, then approved, draft and done, then newest", () => {
    const ranked = buildWorkList(
      {
        cards: [
          led("FEAT-1", "done"),
          led("FEAT-2", "active"),
          led("FEAT-3", "approved"),
          led("FEAT-12", "draft"),
          led("FEAT-13", "draft"),
          led("FEAT-14", "done"),
        ],
        stale: [],
        problems: [],
      },
      config,
    );
    expect(featuresLedBy("lead", ranked, [chat("lead")]).map((f) => f.id)).toEqual([
      "FEAT-2",
      "FEAT-3",
      "FEAT-13",
      "FEAT-12",
      "FEAT-14",
      "FEAT-1",
    ]);
  });

  it("includes a feature whose story session the chat spawned", () => {
    const chats = [chat("other"), session("s1", "STORY-1", "other", "FEAT-1")];
    expect(featuresLedBy("other", list, chats).map((f) => f.id)).toEqual(["FEAT-1"]);
  });

  it("is empty for a chat that leads nothing, and for a story session", () => {
    const chats = [chat("plain"), session("s1", "STORY-1", "lead", "FEAT-1")];
    expect(featuresLedBy("plain", list, chats)).toEqual([]);
    expect(featuresLedBy("s1", list, chats)).toEqual([]);
  });

  it("leaves out a feature the spawning chat no longer has in the list", () => {
    const chats = [session("s1", "STORY-1", "gone-feature", "FEAT-99")];
    expect(featuresLedBy("gone-feature", list, chats)).toEqual([]);
  });
});

describe("storyChat", () => {
  it("is the story's latest session while the project has that chat", () => {
    expect(storyChat({ session: "s1" }, [chat("s1")])).toBe("s1");
  });

  it("is null without a session, or when its chat is gone", () => {
    expect(storyChat({ session: null }, [chat("s1")])).toBeNull();
    expect(storyChat({ session: "s1" }, [chat("s2")])).toBeNull();
  });
});

describe("waitsOnUser", () => {
  const row = { id: "STORY-1", awaiting: false };

  it("is true for a story in Acceptance", () => {
    expect(waitsOnUser({ ...row, awaiting: true }, [])).toBe(true);
  });

  it.each(["approval", "question"] as const)("is true while its session waits on an %s", (waiting) => {
    expect(waitsOnUser(row, [session("s1", "STORY-1", "lead", "FEAT-1", { waiting })])).toBe(true);
  });

  it("is false while its session waits for a reply: that waits on its Dev Lead", () => {
    expect(waitsOnUser(row, [session("s1", "STORY-1", "lead", "FEAT-1", { waiting: "reply" })])).toBe(false);
  });

  it("is false for another story's waiting session, and for a story nobody waits on", () => {
    expect(waitsOnUser(row, [session("s2", "STORY-2", "lead", "FEAT-1", { waiting: "approval" })])).toBe(false);
    expect(waitsOnUser(row, [])).toBe(false);
  });
});
