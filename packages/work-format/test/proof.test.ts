/**
 * STORY-25: the rules behind a project's proof, on real work-format code. A criterion's page on its card line, the
 * proof settings in the config, the page an agent lists, which test screenshots match which criterion, what Featra
 * attaches to each, and the proof question's answer. Pure: no files, no server.
 */
import { describe, expect, it } from "vitest";
import {
  applyReport,
  configOverrides,
  devServerPort,
  evidenceFolder,
  matchTestShots,
  normalizeProofPatch,
  normalizeProofView,
  pageError,
  pageUrl,
  parseCard,
  parseReportInput,
  PROOF_QUESTION,
  proofAnswer,
  proofShotPath,
  proofTargets,
  serializeCard,
  setConfigValue,
  withPort,
  type AcceptanceCriterion,
  type Card,
} from "../src/index.ts";
import { at, config, moves, story } from "./fixtures.ts";

const FOLDER = ".featra/evidence/FEAT-5/STORY-10/";

const work = (acs: AcceptanceCriterion[]): Card => ({
  ...moves(story("STORY-10", "FEAT-5"), [1, "In Progress"]),
  acs,
});
const ac = (text: string, extra: Partial<AcceptanceCriterion> = {}): AcceptanceCriterion => ({
  text,
  done: false,
  test: null,
  ...extra,
});

describe("a criterion's page on its card line", () => {
  it("is written after the test and before the evidence, and read back as it was", () => {
    const card = work([
      ac("Settings show it", {
        test: "a.test.ts::x > y (AC1)",
        page: "/settings?tab=proof",
        evidence: `${FOLDER}a.png`,
      }),
      ac("Home shows it", { page: "/" }),
      ac("Nothing listed"),
    ]);
    const text = serializeCard(card);
    expect(text).toContain(
      `- [ ] Settings show it (test: a.test.ts::x > y (AC1)) (page: /settings?tab=proof) (evidence: ${FOLDER}a.png)`,
    );
    expect(text).toContain("- [ ] Home shows it (page: /)");
    expect(parseCard(text).acs).toEqual(card.acs);
  });
});

describe("the proof settings in the project's config", () => {
  it("take a proof, a loopback dev-server URL with a port, a command and a folder inside the project", () => {
    expect(
      configOverrides(
        "proof: both\ndevServerCommand: pnpm dev --port {port}\ndevServerUrl: http://localhost:5173\ntestScreenshots: test-results/shots\n",
      ),
    ).toEqual({
      proof: "both",
      devServerCommand: "pnpm dev --port {port}",
      devServerUrl: "http://localhost:5173",
      testScreenshots: "test-results/shots",
    });
  });

  it.each([
    ["proof: always", /proof must be one of screenshots, preview, both, none/],
    ["devServerUrl: https://example.com:443", /devServerUrl must be http:\/\/localhost/],
    ["devServerUrl: http://localhost", /devServerUrl must be/],
    ["devServerUrl: http://localhost:70000", /devServerUrl must be/],
    ["testScreenshots: ../outside", /testScreenshots must be a folder inside the project/],
    ["testScreenshots: /abs/path", /testScreenshots must be a folder inside the project/],
  ])("refuse %s", (line, error) => {
    expect(() => configOverrides(`${line}\n`)).toThrow(error);
  });

  it("are cleared by setting them to nothing, so the project chooses again", () => {
    const text = setConfigValue("version: 1\nproof: preview\n", "proof", undefined);
    expect(configOverrides(text).proof).toBeUndefined();
  });
});

describe("the dev server's URL", () => {
  it("gives its port, and moves to another port when Featra picked one", () => {
    expect(devServerPort("http://127.0.0.1:3000/")).toBe(3000);
    expect(devServerPort("http://localhost:0")).toBeNull();
    expect(withPort("http://localhost:5173", 49152)).toBe("http://localhost:49152");
    expect(pageUrl("http://localhost:5173/", "/settings")).toBe("http://localhost:5173/settings");
  });
});

describe("a page an agent lists on a criterion", () => {
  it.each(["/", "/settings", "/a/b?x=1&y=2#top", "/path-with_dots.~"])("takes %s", (page) => {
    expect(pageError(page)).toBeNull();
  });

  it.each(["settings", "//evil.example", "/with space", "/(paren)", 42, `/${"a".repeat(200)}`])(
    "refuses %s",
    (page) => {
      expect(pageError(page)).toMatch(/route on the project's dev server/);
    },
  );

  it("is set on the criterion it ticks, and reported as a page to capture", () => {
    const input = parseReportInput({ criteria: [{ criterion: "Settings show it", page: "/settings" }] });
    if (!input.ok) throw new Error(input.error);
    const r = applyReport(work([ac("Settings show it")]), input.value, { config }, "session:c", at(5), "Dev");
    if (!r.ok) throw new Error(r.error);
    expect(r.card.acs[0]).toMatchObject({ done: true, page: "/settings" });
    expect(r.changes).toContain("listed 1 page to capture");
  });

  it("is refused when it isn't a route, and nothing changes", () => {
    const input = parseReportInput({ criteria: [{ criterion: "Settings show it", page: "https://example.com" }] });
    expect(input).toMatchObject({ ok: false, error: expect.stringMatching(/route on the project's dev server/) });
  });
});

describe("the test screenshots that match a criterion (the rule: <STORY-ID>-ac<n>[-anything].<image>)", () => {
  it("match by story and criterion number from 1, any case, the first by name winning", () => {
    const names = [
      "STORY-10-ac2-dark.png",
      "story-10-ac1.PNG",
      "STORY-10-ac2-light.png",
      "STORY-10-ac3.webp",
      "STORY-100-ac1.png",
      "STORY-10-ac4.txt",
      "STORY-10-ac0.png",
      "notes.md",
    ];
    expect(matchTestShots("STORY-10", names)).toEqual(
      new Map([
        [0, "story-10-ac1.PNG"],
        [1, "STORY-10-ac2-dark.png"],
        [2, "STORY-10-ac3.webp"],
      ]),
    );
  });
});

describe("what Featra attaches to each criterion", () => {
  const card = work([
    ac("Listed a page", { page: "/a" }),
    ac("Agent's own file", { page: "/b", evidence: `${FOLDER}mine.png` }),
    ac("A test wrote one"),
    ac("Featra's last capture", { page: "/d", evidence: proofShotPath(FOLDER, 3, "page", "png") }),
    ac("Nothing"),
  ]);
  const shots = new Map([
    [1, "STORY-10-ac2.png"],
    [2, "STORY-10-ac3.png"],
  ]);

  it("is the page it lists when screenshots are on, else a test's screenshot; an agent's own evidence stays", () => {
    expect(evidenceFolder(card)).toBe(FOLDER);
    expect(proofTargets(card.acs, FOLDER, shots, true)).toEqual([
      { ac: 0, page: "/a" },
      { ac: 2, testShot: "STORY-10-ac3.png" },
      { ac: 3, page: "/d" },
    ]);
  });

  it("is only the tests' screenshots when the project doesn't take screenshots", () => {
    expect(proofTargets(card.acs, FOLDER, shots, false)).toEqual([{ ac: 2, testShot: "STORY-10-ac3.png" }]);
  });

  it("lands in the story's evidence folder, named for the criterion and where it came from", () => {
    expect(proofShotPath(FOLDER, 0, "page", "png")).toBe(`${FOLDER}ac1-page.png`);
    expect(proofShotPath(FOLDER, 2, "test", "webp")).toBe(`${FOLDER}ac3-test.webp`);
  });
});

describe("the proof question", () => {
  it("offers screenshots, Preview, both or neither, and each answer is a proof", () => {
    expect(PROOF_QUESTION.options.map((o) => o.label)).toEqual(["Screenshots", "Preview", "Both", "Neither"]);
    expect(PROOF_QUESTION.options.map((o) => proofAnswer([o.label]))).toEqual([
      "screenshots",
      "preview",
      "both",
      "none",
    ]);
    expect(proofAnswer(["Something else"])).toBeNull();
    expect(proofAnswer(["Both", "Neither"])).toBeNull();
    expect(proofAnswer(undefined)).toBeNull();
  });
});

describe("the Proof section on the socket", () => {
  it("takes a patch of known values only", () => {
    expect(normalizeProofPatch({ proof: "preview", devServerUrl: null, confirm: true, other: 1 })).toEqual({
      proof: "preview",
      devServerUrl: null,
      confirm: true,
    });
    expect(normalizeProofPatch({ proof: "sometimes" })).toBeNull();
    expect(normalizeProofPatch({ devServerCommand: 3 })).toBeNull();
  });

  it("reads a view, and a malformed one as unreadable", () => {
    expect(normalizeProofView({ proof: "both", devServerCommand: "x", unconfirmed: true, error: null })).toEqual({
      proof: "both",
      devServerCommand: "x",
      devServerUrl: null,
      testScreenshots: null,
      unconfirmed: true,
      error: null,
    });
    expect(normalizeProofView(null).error).toBe("Couldn't read the project's proof settings.");
  });
});
