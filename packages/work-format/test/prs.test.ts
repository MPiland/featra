/**
 * STORY-11: the rules of story PRs. What `gh` says about a PR becomes its state and one checks verdict; the verdict is
 * CI evidence; GitHub usable or not, with the line that says what is missing; the PR settings in the config and on the
 * socket; the `pr` history event; and the chip's label. The rules run for real; only data is built here.
 */
import { describe, expect, it } from "vitest";
import {
  checksSetParams,
  checksVerdict,
  ciOutcome,
  ConfigError,
  DEFAULT_CONFIG,
  GITHUB_COPY,
  githubPrUrl,
  githubUse,
  normalizeCardPr,
  normalizeChecksView,
  normalizeWorkList,
  parseCard,
  parseConfig,
  prContent,
  prIsOpen,
  prLabel,
  prNumber,
  readPr,
  safeBranch,
  serializeCard,
  setConfigValue,
  setPr,
} from "../src/index.ts";
import { at, story } from "./fixtures.ts";

const run = (status: string, conclusion = "") => ({ __typename: "CheckRun", status, conclusion });
const context = (state: string) => ({ __typename: "StatusContext", state });

describe("the checks verdict", () => {
  it("is none without checks, passing when every check passed or was skipped", () => {
    expect(checksVerdict([])).toBe("none");
    expect(checksVerdict(undefined)).toBe("none");
    expect(checksVerdict([run("COMPLETED", "SUCCESS"), run("COMPLETED", "SKIPPED"), context("SUCCESS")])).toBe(
      "passing",
    );
    expect(checksVerdict([run("COMPLETED", "NEUTRAL")])).toBe("passing");
  });

  it("is pending while any check runs, and failing when any failed, even with others running", () => {
    expect(checksVerdict([run("COMPLETED", "SUCCESS"), run("IN_PROGRESS")])).toBe("pending");
    expect(checksVerdict([run("QUEUED"), context("PENDING")])).toBe("pending");
    for (const bad of ["FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"]) {
      expect(checksVerdict([run("IN_PROGRESS"), run("COMPLETED", bad)])).toBe("failing");
    }
    expect(checksVerdict([context("ERROR")])).toBe("failing");
    expect(checksVerdict([context("FAILURE"), run("COMPLETED", "SUCCESS")])).toBe("failing");
  });

  it("is CI evidence only once checks finish: passing verifies, failing unverifies, else nothing", () => {
    expect(ciOutcome("passing")).toEqual({ passed: true, acs: [] });
    expect(ciOutcome("failing")).toEqual({ passed: false, acs: [] });
    expect(ciOutcome("pending")).toEqual({ passed: null, acs: [] });
    expect(ciOutcome("none")).toEqual({ passed: null, acs: [] });
  });
});

describe("a PR as gh answers it", () => {
  const url = "https://github.com/acme/app/pull/14";

  it("reads gh pr view's state, draft and checks", () => {
    expect(readPr({ number: 14, url, state: "OPEN", isDraft: false, statusCheckRollup: [] })).toEqual({
      number: 14,
      url,
      status: { state: "open", checks: "none" },
    });
    expect(readPr({ number: 14, url, state: "OPEN", isDraft: true })?.status.state).toBe("draft");
    expect(readPr({ number: 14, url, state: "MERGED" })?.status.state).toBe("merged");
    expect(readPr({ number: 14, url, state: "CLOSED" })?.status.state).toBe("closed");
  });

  it("reads the REST answer of a new PR", () => {
    expect(readPr({ number: 3, html_url: url, state: "open", draft: false, merged_at: null })).toEqual({
      number: 3,
      url,
      status: { state: "open", checks: "none" },
    });
    expect(readPr({ number: 3, html_url: url, state: "closed", merged_at: "2026-11-12T00:00:00Z" })?.status.state).toBe(
      "merged",
    );
  });

  it("is null for anything else", () => {
    expect(readPr(null)).toBeNull();
    expect(readPr({ number: 1, url: "http://github.com/a/b/pull/1", state: "OPEN" })).toBeNull();
    expect(readPr({ number: "1", url, state: "OPEN" })).toBeNull();
    expect(readPr({ number: 1, url, state: "WEIRD" })).toBeNull();
  });

  it("is open until merged or closed", () => {
    expect(prIsOpen({ state: "open", checks: "none" })).toBe(true);
    expect(prIsOpen({ state: "draft", checks: "none" })).toBe(true);
    expect(prIsOpen({ state: "merged", checks: "none" })).toBe(false);
    expect(prIsOpen({ state: "closed", checks: "none" })).toBe(false);
  });
});

describe("the PR chip's label", () => {
  it("is the PR number, never the URL", () => {
    expect(prNumber("https://github.com/acme/app/pull/14")).toBe(14);
    expect(prLabel("https://github.com/acme/app/pull/14")).toBe("#14");
    expect(prLabel("https://github.com/acme/app/pull/14/files")).toBe("#14");
    expect(prLabel("https://gitlab.example/acme/app/-/merge_requests/3")).toBe("PR");
  });
});

describe("GitHub usable (AC1)", () => {
  it("needs a GitHub remote, gh, and gh signed in, and says the first that is missing", () => {
    expect(githubUse({ remote: true, gh: true, signedIn: true })).toEqual({ usable: true, missing: null });
    expect(githubUse({ remote: false, gh: false, signedIn: false })).toEqual({
      usable: false,
      missing: GITHUB_COPY.noRemote,
    });
    expect(githubUse({ remote: true, gh: false, signedIn: false }).missing).toBe(GITHUB_COPY.noGh);
    expect(githubUse({ remote: true, gh: true, signedIn: false }).missing).toBe(GITHUB_COPY.signedOut);
  });

  it("is one short line each", () => {
    for (const line of Object.values(GITHUB_COPY)) {
      expect(line).not.toContain("\n");
      expect(line.length).toBeLessThan(90);
    }
  });
});

describe("what is safe to hand to gh and git", () => {
  it("takes only a plain GitHub PR URL", () => {
    expect(githubPrUrl("https://github.com/acme/app/pull/14")).toBe("https://github.com/acme/app/pull/14");
    expect(githubPrUrl("https://github.com/acme/app/pull/14 --web")).toBeNull();
    expect(githubPrUrl("https://evil.example/acme/app/pull/14")).toBeNull();
    expect(githubPrUrl('https://github.com/acme/app/pull/1"&calc')).toBeNull();
    expect(githubPrUrl(null)).toBeNull();
  });

  it("takes only a plain branch name", () => {
    expect(safeBranch("featra/story-11-pr-chip")).toBe(true);
    expect(safeBranch("feature/6-prs")).toBe(true);
    expect(safeBranch("-x")).toBe(false);
    expect(safeBranch("a..b")).toBe(false);
    expect(safeBranch("a b")).toBe(false);
    expect(safeBranch("a&b")).toBe(false);
    expect(safeBranch(null)).toBe(false);
  });
});

describe("the PR's content", () => {
  it("is the story's id and title, its user story and its criteria", () => {
    const card = {
      ...story("STORY-11", "FEAT-6"),
      title: "Story PR",
      description: "As a user, I want a PR.",
      acs: [
        { text: "One", done: true, test: null },
        { text: "Two", done: false, test: null },
      ],
    };
    const { title, body } = prContent(card);
    expect(title).toBe("STORY-11: Story PR");
    expect(body).toBe(
      "As a user, I want a PR.\n\n## Acceptance criteria\n\n- [x] One\n- [ ] Two\n\nOpened by Featra for STORY-11.",
    );
  });
});

describe("the PR settings (AC2, AC4)", () => {
  it("default to opening story PRs and reading them every 2 minutes", () => {
    expect(DEFAULT_CONFIG.openStoryPrs).toBe(true);
    expect(DEFAULT_CONFIG.prRefreshMinutes).toBe(2);
    expect(parseConfig("version: 1\nopenStoryPrs: false\nprRefreshMinutes: 15\n")).toMatchObject({
      openStoryPrs: false,
      prRefreshMinutes: 15,
    });
  });

  it("refuse an interval that isn't whole minutes from 1 to 60", () => {
    for (const bad of ["0", "61", "1.5", "two"]) {
      expect(() => parseConfig(`version: 1\nprRefreshMinutes: ${bad}\n`)).toThrow(ConfigError);
    }
    expect(() => parseConfig("version: 1\nopenStoryPrs: sometimes\n")).toThrow(ConfigError);
    expect(setConfigValue("version: 1\n", "prRefreshMinutes", 5)).toContain("prRefreshMinutes: 5");
  });

  it("cross the socket checked", () => {
    expect(checksSetParams({ dir: "/p", patch: { openStoryPrs: false, prRefreshMinutes: 60 } })).toEqual({
      dir: "/p",
      patch: { openStoryPrs: false, prRefreshMinutes: 60 },
    });
    expect(checksSetParams({ dir: "/p", patch: { prRefreshMinutes: 0 } })).toBeNull();
    expect(checksSetParams({ dir: "/p", patch: { openStoryPrs: "no" } })).toBeNull();
    const view = normalizeChecksView({ github: { usable: false, missing: GITHUB_COPY.noGh } });
    expect(view).toMatchObject({
      github: { usable: false, missing: GITHUB_COPY.noGh },
      openStoryPrs: true,
      prRefreshMinutes: 2,
    });
  });
});

describe("the PR on the card", () => {
  it("is recorded once, with a pr history event by the one who set it", () => {
    const url = "https://github.com/acme/app/pull/14";
    const card = setPr(story("STORY-1", "FEAT-1"), url, "system", at(5));
    expect(card.pr).toBe(url);
    expect(card.history.at(-1)).toEqual({ at: at(5), field: "pr", from: null, to: url, by: "system" });
    expect(setPr(card, url, "system", at(6))).toBe(card);
    expect(parseCard(serializeCard(card), "STORY-1.md").history.at(-1)).toMatchObject({ field: "pr", to: url });
  });

  it("crosses the socket checked, on the card view and the Work rows", () => {
    expect(normalizeCardPr({ status: { state: "open", checks: "passing" }, create: false, opening: false })).toEqual({
      status: { state: "open", checks: "passing" },
      create: false,
      opening: false,
      note: null,
    });
    expect(normalizeCardPr({ status: { state: "weird", checks: "passing" }, create: true })?.status).toBeNull();
    const list = normalizeWorkList({
      epics: [{ features: [{ stories: [{ id: "STORY-1", pr: "u", prStatus: { state: "merged", checks: "none" } }] }] }],
    });
    expect(list.epics[0]?.features[0]?.stories[0]?.prStatus).toEqual({ state: "merged", checks: "none" });
  });
});
