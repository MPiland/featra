import type { Page } from "@playwright/test";

/** WCAG 2.x contrast maths. A test helper: the product has no contrast logic of its own. */
export type Rgba = [number, number, number, number];

export function parseCssColor(css: string): Rgba {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m?.[1]) throw new Error(`Unparsed colour: ${css}`);
  const [r = 0, g = 0, b = 0, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return [r, g, b, a];
}

/** Paints `top` (possibly translucent) over an opaque `bottom`. */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i]! * a + bottom[i]! * (1 - a)).concat(1) as Rgba;
}

export function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export interface Sample {
  what: string;
  fg: string;
  /** Background layers from the element outwards, ending at the first opaque one. */
  bgs: string[];
  /** Product of the element's and its ancestors' opacity. */
  opacity: number;
  large: boolean;
}

/** Effective foreground and background of a sample, with translucency resolved. */
export function resolve(s: Sample): { fg: Rgba; bg: Rgba } {
  const layers = s.bgs.map(parseCssColor);
  let bg = layers.at(-1) ?? ([255, 255, 255, 1] as Rgba);
  if (bg[3] < 1) bg = over(bg, [255, 255, 255, 1]);
  for (const layer of layers.slice(0, -1).reverse()) bg = over(layer, bg);
  const raw = parseCssColor(s.fg);
  const fg = over([raw[0], raw[1], raw[2], raw[3] * s.opacity], bg);
  return { fg, bg };
}

/**
 * Collects every visible, enabled element that directly holds text, plus every enabled icon-only button
 * (`kind: "icon"`, a non-text UI component that needs 3:1).
 */
export function sampleRenderedText(page: Page): Promise<(Sample & { kind: "text" | "icon" })[]> {
  return page.evaluate(() => {
    const bgChain = (el: Element | null): string[] => {
      const out: string[] = [];
      for (; el; el = el.parentElement) {
        const c = getComputedStyle(el).backgroundColor;
        if (c === "rgba(0, 0, 0, 0)" || c === "transparent") continue;
        out.push(c);
        if (!/rgba\([^)]*,\s*0?\.\d+\)/.test(c)) break;
      }
      return out;
    };
    const opacity = (el: Element | null) => {
      let o = 1;
      for (; el; el = el.parentElement) o *= Number(getComputedStyle(el).opacity);
      return o;
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !el.closest("[inert]");
    };
    // WCAG 1.4.3 exempts inactive controls: native disabled and aria-disabled menu items alike.
    const disabled = (el: Element) => !!el.closest(":disabled, [aria-disabled=true]");
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.split(" ").join(".")}` : ""} "${(el.textContent ?? el.getAttribute("aria-label") ?? "").trim().slice(0, 40)}"`;

    const samples: { kind: "text" | "icon"; what: string; fg: string; bgs: string[]; opacity: number; large: boolean }[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      if (!visible(el) || disabled(el)) continue;
      const cs = getComputedStyle(el);
      const ownText = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      if (ownText) samples.push({ kind: "text", what: describe(el), fg: cs.color, bgs: bgChain(el), opacity: opacity(el), large });
      else if (el.tagName === "BUTTON" && el.querySelector("svg")) {
        samples.push({ kind: "icon", what: describe(el), fg: cs.color, bgs: bgChain(el), opacity: opacity(el), large });
      }
    }
    return samples;
  });
}

/** Computed values of colour tokens, read through a probe element so the browser normalises them to rgb(). */
export function tokenColours(page: Page, names: string[]): Promise<Record<string, string>> {
  return page.evaluate((tokens) => {
    const probe = document.createElement("span");
    document.body.append(probe);
    const out: Record<string, string> = {};
    for (const t of tokens) {
      probe.style.color = `var(${t})`;
      out[t] = getComputedStyle(probe).color;
    }
    probe.remove();
    return out;
  }, names);
}
