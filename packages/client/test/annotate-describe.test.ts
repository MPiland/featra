/**
 * STORY-75 AC2: what an annotation records of an element (annotate/describe.ts): a selector that finds it again and only
 * it, its markup trimmed, and its key computed styles. Run on a real DOM (jsdom).
 */
import { afterEach, describe, expect, it } from "vitest";
import { describeElement } from "../src/annotate/describe.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

const html = (markup: string) => {
  document.body.innerHTML = markup;
};
const finds = (selector: string) => document.querySelectorAll(selector);

describe("an element's selector", () => {
  it("is its id when that is readable and unique", () => {
    html(`<main><button id="save">Save</button></main>`);
    expect(describeElement(document.getElementById("save")!).selector).toBe("#save");
  });

  it("ignores a generated id, and finds the element by its place", () => {
    html(`<main><p>a</p><p id=":r12345:">b</p></main>`);
    const el = document.querySelectorAll("p")[1]!;
    const { selector } = describeElement(el);
    expect(selector).not.toContain("r12345");
    expect([...finds(selector)]).toEqual([el]);
  });

  it("uses a test id, and stops at an ancestor with an id", () => {
    html(`<section id="plans"><ul><li><button data-testid="buy">Buy</button></li></ul></section>
      <section><ul><li><button data-testid="buy">Buy</button></li></ul></section>`);
    const el = document.querySelector("#plans button")!;
    const { selector } = describeElement(el);
    expect(selector).toBe('#plans > ul > li > button[data-testid="buy"]');
    expect([...finds(selector)]).toEqual([el]);
  });

  it("finds one of several alike by its place among them", () => {
    html(`<ul><li>a</li><li>b</li><li>c</li></ul>`);
    const el = document.querySelectorAll("li")[2]!;
    const { selector } = describeElement(el);
    expect(selector).toContain(":nth-of-type(3)");
    expect([...finds(selector)]).toEqual([el]);
  });
});

describe("an element's markup", () => {
  it("is its opening tag with its attributes, and its text, trimmed", () => {
    html(`<a href="/plans" class="link">  Pick a   plan  </a>`);
    expect(describeElement(document.querySelector("a")!)).toMatchObject({
      tag: "a",
      snippet: '<a href="/plans" class="link">Pick a plan</a>',
    });
  });

  it("is cut to size: long values, long text, and the whole", () => {
    html(`<p title="${"t".repeat(200)}">${"x".repeat(1000)}</p>`);
    const { snippet } = describeElement(document.querySelector("p")!);
    expect(snippet).toContain(`title="${"t".repeat(79)}…"`);
    expect(snippet).toContain(`${"x".repeat(159)}…`);
    expect(snippet.length).toBeLessThanOrEqual(600);
  });

  it("shows children it has no text for as an ellipsis", () => {
    html(`<div><span></span></div>`);
    expect(describeElement(document.querySelector("div")!).snippet).toBe("<div>…</div>");
  });
});

describe("an element's styles", () => {
  it("are its key computed styles", () => {
    html(`<button style="color: rgb(255, 0, 0); display: inline-block">Go</button>`);
    const { styles } = describeElement(document.querySelector("button")!);
    expect(styles.color).toBe("rgb(255, 0, 0)");
    expect(styles.display).toBe("inline-block");
  });
});
