import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { assetsDir, generate, sourceSvg } from "../icon/generate.ts";
import { parseSvg } from "../icon/render.ts";

const out = mkdtempSync(join(tmpdir(), "featra-icon-"));
afterAll(() => rmSync(out, { recursive: true, force: true }));

describe("The icon is generated from a committed source by a script", () => {
  it("regenerating from icon.svg reproduces the committed icon files byte for byte", () => {
    const files = generate(out);
    expect(files.map((f) => f.slice(out.length + 1))).toEqual(["icon.png", "icon.ico", "icon.icns"]);
    for (const file of files) {
      const name = file.slice(out.length + 1);
      expect(readFileSync(file).equals(readFileSync(join(assetsDir, name)))).toBe(true);
    }
  });

  it("the icon's colour is the client's accent token", () => {
    const tokens = readFileSync(join(import.meta.dirname, "../../packages/client/src/styles/tokens.css"), "utf8");
    const accent = /--accbg:\s*(#[0-9a-f]{6})/i.exec(tokens)?.[1];
    expect(accent).toBeDefined();
    const [background] = parseSvg(readFileSync(sourceSvg, "utf8")).rects;
    expect(background?.color).toEqual([1, 3, 5].map((i) => Number.parseInt(accent!.slice(i, i + 2), 16)));
  });
});
