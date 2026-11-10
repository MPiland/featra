import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrast, type Rgba } from "../e2e/contrast.ts";

/**
 * STORY-8 review ruling 9: the Review badge's text colour is a token that meets 4.5:1 (11px is small text) on every
 * surface a Work row can have, in both themes. Reads the shipped CSS, so a changed token or rule fails here.
 */
const styles = join(import.meta.dirname, "../../../packages/client/src/styles");
const tokens = readFileSync(join(styles, "tokens.css"), "utf8");
const work = readFileSync(join(styles, "work.css"), "utf8");

/** The tokens of the block that starts at `selector`. */
function block(selector: string): Record<string, Rgba> {
  const start = tokens.indexOf(`${selector} {`);
  const body = tokens.slice(start, tokens.indexOf("}", start));
  const found = [...body.matchAll(/--([a-z0-9]+):\s*#([0-9a-f]{6});/gi)];
  return Object.fromEntries(
    found.map(([, name = "", hex = ""]) => [
      name,
      [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).concat(1) as Rgba,
    ]),
  );
}

const themes = { light: block(":root"), dark: block(':root[data-theme="dark"]') };
const badge = /\.badge-review\s*\{[^}]*\}/.exec(work)?.[0] ?? "";

describe("the Review badge colour", () => {
  it("is the --warn token, for the text and its border", () => {
    expect(badge).toContain("color: var(--warn)");
    expect(badge).toContain("border: 1px solid var(--warn)");
  });

  it.each(Object.entries(themes))("meets 4.5:1 on every row surface in the %s theme", (_theme, t) => {
    const warn = t["warn"] as Rgba;
    for (const surface of ["bg", "side", "row"]) {
      expect(contrast(warn, t[surface] as Rgba), surface).toBeGreaterThanOrEqual(4.5);
    }
  });
});
