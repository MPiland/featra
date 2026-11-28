/**
 * What an annotation records of an element (STORY-75, ADR 0048): a CSS selector that finds it again, its markup
 * trimmed, and its key computed styles. It runs in the Browser pane's page, in Featra's isolated world, so it is
 * written self-contained: the overlay script includes its source, and nothing outside the function is in scope there.
 */
export interface Described {
  selector: string;
  tag: string;
  snippet: string;
  styles: Record<string, string>;
}

/* oxlint-disable unicorn/consistent-function-scoping -- The function runs in the page, so its helpers must be inside it rather than at module scope. */
export function describeElement(el: Element): Described {
  const STYLES = [
    "display",
    "position",
    "width",
    "height",
    "margin",
    "padding",
    "color",
    "background-color",
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "border",
    "border-radius",
    "box-shadow",
    "opacity",
    "gap",
    "flex-direction",
    "justify-content",
    "align-items",
    "z-index",
    "overflow",
  ];
  const doc = el.ownerDocument;
  const esc = (s: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/[^\w-]/g, "\\$&"));
  const unique = (sel: string) => {
    try {
      return doc.querySelectorAll(sel).length === 1;
    } catch {
      return false;
    }
  };
  // A readable id: not one a framework generated (":r1:", long hashes).
  const goodId = (id: string) => /^[A-Za-z][\w-]{0,60}$/.test(id) && !/\d{4,}/.test(id);
  const step = (node: Element) => {
    const tag = node.tagName.toLowerCase();
    const testId = node.getAttribute("data-testid");
    if (testId && testId.length <= 80) return `${tag}[data-testid="${testId.replace(/["\\]/g, "\\$&")}"]`;
    const parent = node.parentElement;
    if (!parent) return tag;
    const same = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
    return same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag;
  };
  const selectorOf = (node: Element) => {
    if (node.id && goodId(node.id) && unique(`#${esc(node.id)}`)) return `#${esc(node.id)}`;
    const parts: string[] = [];
    for (let at: Element | null = node; at && at !== doc.documentElement && parts.length < 12; at = at.parentElement) {
      if (at !== node && at.id && goodId(at.id) && unique(`#${esc(at.id)}`)) {
        parts.unshift(`#${esc(at.id)}`);
        break;
      }
      parts.unshift(step(at));
      if (unique(parts.join(" > "))) break;
    }
    return parts.join(" > ");
  };
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const snippetOf = (node: Element) => {
    const tag = node.tagName.toLowerCase();
    const attrs = Array.from(node.attributes)
      .slice(0, 12)
      .map((a) => (a.value ? ` ${a.name}="${clip(a.value, 80)}"` : ` ${a.name}`))
      .join("");
    const inner = clip((node.textContent ?? "").replace(/\s+/g, " ").trim(), 160);
    const children = node.children.length;
    const body = inner || (children ? "…" : "");
    const open = `<${tag}${attrs}>`;
    return clip(`${open}${body}</${tag}>`, 600);
  };
  const stylesOf = (node: Element) => {
    const view = doc.defaultView;
    const css = view ? view.getComputedStyle(node) : null;
    const out: Record<string, string> = {};
    if (!css) return out;
    for (const p of STYLES) {
      const v = css.getPropertyValue(p);
      if (v) out[p] = clip(v, 200);
    }
    return out;
  };
  return {
    selector: selectorOf(el),
    tag: el.tagName.toLowerCase(),
    snippet: snippetOf(el),
    styles: stylesOf(el),
  };
}
