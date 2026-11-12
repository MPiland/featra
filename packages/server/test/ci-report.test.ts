/**
 * STORY-57: fetching CI's test report for a commit through `gh`. Real `readCiReports`, temp folders and parser; GitHub
 * is the fake `gh`, never the real one nor its login.
 */
import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CI_PROOF_COPY } from "@featra/work-format";
import { readCiReports } from "../src/ci-report.ts";
import { fakeGh, junitXml, type FakeGh } from "./fake-gh.ts";

const HEAD = "a".repeat(40);
const OTHER = "b".repeat(40);
const A = "packages/app/test/a.test.ts";
let gh: FakeGh;
const read = (setting: { artifact: string; files?: string | null }, extra = {}) =>
  readCiReports(gh.bin, HEAD, { files: null, ...setting }, { ghCommand: gh.command, ...extra });
const downloads = async () =>
  (await gh.calls()).map((c) => c.args).filter((a) => a[0] === "run" && a[1] === "download");

beforeEach(async () => {
  gh = await fakeGh();
});
afterEach(() => gh.dispose());

describe("reading CI's test report for a commit", { timeout: 30_000 }, () => {
  it("lists the commit's runs, downloads the matching artifact of each with fixed arguments, and reads its XML", async () => {
    await gh.change((s) => {
      s.runs = [
        {
          id: 7,
          headSha: HEAD,
          artifacts: { "test-report-ubuntu": { "junit.xml": junitXml([[A, "works", "passed"]]) } },
        },
        {
          id: 8,
          headSha: HEAD,
          artifacts: { "test-report-windows": { "out/junit.xml": junitXml([[A, "works", "failed"]]) } },
        },
        {
          id: 9,
          headSha: OTHER,
          artifacts: { "test-report-ubuntu": { "junit.xml": junitXml([[A, "other", "passed"]]) } },
        },
      ];
    });
    const found = await read({ artifact: "test-report-*" });
    expect(found).toEqual({
      kind: "read",
      reports: [
        [{ classname: A, name: "works", status: "passed" }],
        [{ classname: A, name: "works", status: "failed" }],
      ],
      note: null,
    });
    const calls = (await gh.calls()).map((c) => c.args);
    expect(calls[0]).toEqual(["run", "list", "--commit", HEAD, "--json", "databaseId,status", "--limit", "20"]);
    const dl = await downloads();
    expect(dl.map((a) => a.slice(0, 5))).toEqual([
      ["run", "download", "7", "-p", "test-report-*"],
      ["run", "download", "8", "-p", "test-report-*"],
    ]);
  });

  it("removes the downloaded files once read", async () => {
    await gh.change((s) => {
      s.runs = [
        { id: 7, headSha: HEAD, artifacts: { "test-report": { "junit.xml": junitXml([[A, "works", "passed"]]) } } },
      ];
    });
    await read({ artifact: "test-report" });
    const into = (await downloads())[0]?.at(-1) ?? "";
    expect(into).toContain("featra-ci-report-");
    expect(existsSync(into)).toBe(false);
  });

  it("reads only the files the setting names inside the artifact", async () => {
    await gh.change((s) => {
      s.runs = [
        {
          id: 7,
          headSha: HEAD,
          artifacts: {
            "test-report": {
              "unit/junit.xml": junitXml([[A, "works", "passed"]]),
              "other/coverage.xml": "<coverage/>",
              "notes.txt": "not xml",
            },
          },
        },
      ];
    });
    const found = await read({ artifact: "test-report", files: "unit/*.xml" });
    expect(found).toEqual({ kind: "read", reports: [[{ classname: A, name: "works", status: "passed" }]], note: null });
  });

  it("waits while any run of the commit is still going, downloading nothing", async () => {
    await gh.change((s) => {
      s.runs = [
        { id: 7, headSha: HEAD, artifacts: { "test-report": { "junit.xml": junitXml([]) } } },
        { id: 8, headSha: HEAD, status: "in_progress" },
      ];
    });
    expect(await read({ artifact: "test-report" })).toEqual({ kind: "running" });
    expect(await downloads()).toEqual([]);
  });

  it("says when the commit has no runs, or none uploaded the report", async () => {
    expect(await read({ artifact: "test-report" })).toEqual({ kind: "read", reports: [], note: CI_PROOF_COPY.noRuns });
    await gh.change((s) => {
      s.runs = [{ id: 7, headSha: HEAD, artifacts: { "playwright-traces": { "trace.zip": "zip" } } }];
    });
    expect(await read({ artifact: "test-report" })).toEqual({
      kind: "read",
      reports: [],
      note: CI_PROOF_COPY.noReport,
    });
  });

  it("gives up for now when a download fails for another reason, so the next read tries again", async () => {
    await gh.change((s) => {
      s.runs = [{ id: 7, headSha: HEAD, artifacts: { "test-report": { "junit.xml": junitXml([]) } } }];
      s.downloadFails = "HTTP 502: Bad Gateway";
    });
    expect(await read({ artifact: "test-report" })).toBeNull();
  });

  it("reads no more than the size bound, and says part of the report was left out", async () => {
    const big = junitXml(Array.from({ length: 200 }, (_, i) => [A, `test ${i}`, "passed"] as const));
    const small = junitXml([[A, "works", "passed"]]);
    await gh.change((s) => {
      s.runs = [{ id: 7, headSha: HEAD, artifacts: { "test-report": { "a.xml": small, "b.xml": big } } }];
    });
    const found = await read({ artifact: "test-report" }, { maxReportBytes: small.length + 10 });
    expect(found).toEqual({
      kind: "read",
      reports: [[{ classname: A, name: "works", status: "passed" }]],
      note: CI_PROOF_COPY.tooLarge,
    });
  });

  it("refuses an unsafe artifact name or commit without calling gh", async () => {
    expect(await read({ artifact: "a b & echo hi" })).toBeNull();
    expect(
      await readCiReports(gh.bin, "HEAD; rm", { artifact: "x", files: null }, { ghCommand: gh.command }),
    ).toBeNull();
    expect(await gh.calls()).toEqual([]);
  });
});
