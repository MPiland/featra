import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { samePath } from "../src/same-path.ts";

describe("samePath", () => {
  const dir = join(process.cwd(), "Tree");

  it("is the same path however it is written", () => {
    expect(samePath(dir, join(dir, "sub", ".."), "linux")).toBe(true);
    expect(samePath(dir, join(process.cwd(), "Other"), "linux")).toBe(false);
  });

  it("ignores case only on Windows, whose file system does", () => {
    expect(samePath(dir, dir.toUpperCase(), "win32")).toBe(true);
    expect(samePath(dir, join(process.cwd(), "tree"), "linux")).toBe(false);
  });
});
