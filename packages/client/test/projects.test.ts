import { describe, expect, it } from "vitest";
import { normalizeProjects, normalizeProjectsResult, projectInitial, projectNameError } from "../src/projects.ts";

describe("STORY-19 AC2: a new project's folder name", () => {
  it("accepts ordinary names, with spaces, dots and Unicode inside", () => {
    for (const name of ["manager", "my app", "v1.2", "café", "  padded  ", "a".repeat(255)]) {
      expect(projectNameError(name), name).toBeNull();
    }
  });

  it("asks for a name when there is none", () => {
    expect(projectNameError("")).toBe("Enter a name.");
    expect(projectNameError("   ")).toBe("Enter a name.");
  });

  it("refuses . and ..", () => {
    expect(projectNameError(".")).toBe("Choose another name.");
    expect(projectNameError("..")).toBe("Choose another name.");
  });

  it("refuses characters a folder name can't hold on Windows, and path separators everywhere", () => {
    for (const c of ["\\", "/", ":", "*", "?", '"', "<", ">", "|", "\u0001", "\t"]) {
      expect(projectNameError(`a${c}b`), JSON.stringify(c)).toBe("A name can't contain \\ / : * ? \" < > |");
    }
  });

  it("refuses Windows device names, with or without an extension, in any case", () => {
    for (const name of ["CON", "prn", "Aux", "nul.txt", "COM1", "lpt9.md"]) {
      expect(projectNameError(name), name).toBe("That name is reserved on Windows.");
    }
    expect(projectNameError("console")).toBeNull();
    expect(projectNameError("COM0")).toBeNull();
  });

  it("refuses a trailing dot, and a name over 255 characters", () => {
    expect(projectNameError("app.")).toBe("A name can't end with a dot or a space.");
    expect(projectNameError("a".repeat(256))).toBe("That name is too long.");
  });
});

describe("STORY-19: the project list across the bridge", () => {
  it("keeps well-formed entries and lists the current project even if the host left it out", () => {
    const current = { dir: "/p/b", name: "b" };
    expect(
      normalizeProjects({ current, projects: [{ dir: "/p/a", name: "a" }, { dir: "" }, 3], location: "/p" }),
    ).toEqual({ current, projects: [current, { dir: "/p/a", name: "a" }], location: "/p" });
    expect(normalizeProjects(null)).toEqual({ current: null, projects: [], location: "" });
  });

  it("reads a result as the new list or as the host's reason", () => {
    expect(normalizeProjectsResult({ ok: false, error: "Folder not found: /x" })).toEqual({
      ok: false,
      error: "Folder not found: /x",
    });
    expect(normalizeProjectsResult(undefined)).toEqual({ ok: false, error: "Something went wrong." });
    expect(normalizeProjectsResult({ ok: true, projects: {} })).toEqual({
      ok: true,
      projects: { current: null, projects: [], location: "" },
    });
  });

  it("puts the name's first letter on the avatar", () => {
    expect(projectInitial("manager")).toBe("M");
    expect(projectInitial(" émile")).toBe("É");
    expect(projectInitial("")).toBe("?");
  });
});
