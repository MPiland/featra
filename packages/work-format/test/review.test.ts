/**
 * The review screen's pure parts (STORY-69): the Files changed links, git's diff counts, finding a story's merge in
 * the feature branch's log, and the check the client reads the review through.
 */
import { describe, expect, it } from "vitest";
import {
  compareUrl,
  MERGE_LOG_FORMAT,
  mergeCommitMessage,
  normalizeFeatureReview,
  parseNumstat,
  prFilesUrl,
  REVIEW_COPY,
  runLabel,
  storyMergesIn,
} from "../src/index.ts";

const SEP = "\u001f";

describe("Files changed links (STORY-69 AC5)", () => {
  it("are a GitHub PR's files tab, or nothing for anything else", () => {
    expect(prFilesUrl("https://github.com/acme/app/pull/12")).toBe("https://github.com/acme/app/pull/12/files");
    expect(prFilesUrl(null)).toBeNull();
    expect(prFilesUrl("https://gitlab.com/acme/app/-/merge_requests/1")).toBeNull();
  });

  it("compare a branch with its base before it has a PR, and refuse what isn't safe", () => {
    expect(compareUrl("acme/app", "main", "feature/9-review")).toBe(
      "https://github.com/acme/app/compare/main...feature/9-review",
    );
    expect(compareUrl(null, "main", "feature/9-review")).toBeNull();
    expect(compareUrl("acme/app", "main", null)).toBeNull();
    expect(compareUrl("acme/app/x", "main", "feature/9")).toBeNull();
    expect(compareUrl("acme/app", "main", "-x")).toBeNull();
  });
});

describe("git's diff counts (STORY-69 AC2)", () => {
  it("sum files and lines; a binary file counts as a file with no lines", () => {
    expect(parseNumstat("3\t1\tsrc/a.ts\n-\t-\timg.png\n10\t0\tdocs/b.md\n")).toEqual({
      files: 3,
      added: 13,
      removed: 1,
    });
    expect(parseNumstat("")).toEqual({ files: 0, added: 0, removed: 0 });
  });

  it("count a file changed in more than one round once, and every round's lines", () => {
    expect(parseNumstat("1\t0\tsrc/a.ts\n4\t2\tsrc/b.ts\n2\t1\tsrc/a.ts\n")).toEqual({
      files: 2,
      added: 7,
      removed: 3,
    });
  });
});

const line = (parents: string, subject: string) => `${parents}${SEP}${subject}`;

describe("a story's merge into its feature (STORY-69 AC2)", () => {
  const story = { id: "STORY-9", pr: "https://github.com/acme/app/pull/12", branch: "featra/story-9" };

  it("is read with each commit's parents and subject", () => {
    expect(MERGE_LOG_FORMAT).toBe("%P%x1f%s");
  });

  it("is Featra's merge, its PR's merge on GitHub, or git's, the newest first", () => {
    const log = [
      line("a1 b1", "Merge STORY-8: Other"),
      line("a2 b2", "Merge pull request #12 from acme/featra/story-9"),
      line("a3 b3", "Merge STORY-9: Older"),
    ].join("\n");
    expect(storyMergesIn(log, story)[0]).toEqual(["a2", "b2"]);
    expect(storyMergesIn(line("c d", "Merge STORY-9: Title"), { ...story, pr: null })).toEqual([["c", "d"]]);
    expect(storyMergesIn(line("e f", "Merge branch 'featra/story-9' into x"), { ...story, pr: null })).toEqual([
      ["e", "f"],
    ]);
  });

  it("is every round of a story merged, sent back and merged again, the newest first", () => {
    const log = [
      line("a3 b3", mergeCommitMessage({ id: "STORY-9", title: "Renamed since" })),
      line("a2 b2", "Merge STORY-8: Other"),
      line("a1 b1", "Merge pull request #12 from acme/featra/story-9"),
    ].join("\n");
    expect(storyMergesIn(log, story)).toEqual([
      ["a3", "b3"],
      ["a1", "b1"],
    ]);
  });

  it("is none for another story, a PR with a longer number, or a commit with one parent", () => {
    expect(storyMergesIn(line("a b", "Merge STORY-90: Other"), story)).toEqual([]);
    expect(storyMergesIn(line("a b", "Merge pull request #123 from x"), story)).toEqual([]);
    expect(storyMergesIn(line("a", "Merge STORY-9: One parent"), story)).toEqual([]);
    expect(storyMergesIn("", story)).toEqual([]);
  });
});

const view = (id: string, type: string) => ({
  id,
  type,
  title: id,
  status: "Done",
  statusOptions: [],
  parent: null,
  parentOptions: [],
  description: "",
  evidence: { reported: false, verified: false, proven: false, accepted: false },
  acs: [],
  tasks: [],
  notes: "",
  pr: null,
  stories: [],
  owner: "main",
  readOnly: null,
});

describe("the review as the client reads it (STORY-69)", () => {
  it("keeps what's sound and drops what isn't", () => {
    const r = normalizeFeatureReview({
      feature: view("FEAT-1", "feature"),
      progress: { done: 1, total: 2, label: "1/2" },
      breakdown: "1 done · 1 in progress",
      scope: { added: 1, addedBreakdown: "+1 added: 1 bug", openBugs: -2 },
      stories: [
        { view: view("STORY-1", "story"), tone: "done", added: false, diff: { files: 2, added: 5, removed: 1 } },
        7,
      ],
      bugs: [{ view: view("BUG-1", "bug"), tone: "nope", added: true, diff: null, files: "javascript:alert(1)" }],
      summary: { text: "  ", at: null },
      diff: null,
      files: "https://github.com/acme/app/compare/main...feature/1-x",
    });
    expect(r?.stories).toHaveLength(1);
    expect(r?.stories[0]).toMatchObject({ tone: "done", diff: { files: 2, added: 5, removed: 1 }, files: null });
    expect(r?.bugs[0]).toMatchObject({ tone: "idle", added: true, files: null });
    expect(r?.scope.openBugs).toBe(0);
    expect(r?.summary).toBeNull();
    expect(r?.files).toBe("https://github.com/acme/app/compare/main...feature/1-x");
    expect(normalizeFeatureReview({ feature: null })).toBeNull();
  });

  it("names a run on this computer and links a CI run", () => {
    expect(runLabel("local")).toBe(REVIEW_COPY.localRun);
    expect(runLabel("https://github.com/acme/app/actions/runs/9")).toBe(REVIEW_COPY.ciRun);
    expect(REVIEW_COPY.diff({ files: 1, added: 3, removed: 0 })).toBe("1 file · +3 −0");
  });
});
