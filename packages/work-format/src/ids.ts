import type { Card, CardType } from "./types.ts";

export const ID_PREFIX: Record<CardType, string> = { epic: "EPIC", feature: "FEAT", pbi: "PBI", bug: "BUG" };

export function parseId(id: string): { prefix: string; n: number } | null {
  const m = /^([A-Z]+)-(\d+)$/.exec(id);
  return m ? { prefix: m[1]!, n: Number(m[2]) } : null;
}

/** Next free ID for a type, one past the highest existing number. Allocated by the server only (ADR 0002). */
export function nextId(type: CardType, existing: Iterable<string>): string {
  const prefix = ID_PREFIX[type];
  let max = 0;
  for (const id of existing) {
    const p = parseId(id);
    if (p && p.prefix === prefix && p.n > max) max = p.n;
  }
  return `${prefix}-${max + 1}`;
}

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48).replace(/-$/, "");
}

/** Card file name: `<ID>-<slug>.md`. */
export function cardFileName(card: Pick<Card, "id" | "title">): string {
  const slug = slugify(card.title);
  return slug ? `${card.id}-${slug}.md` : `${card.id}.md`;
}

/** The card ID from a file name, or null if it isn't a card file. */
export function idFromFileName(name: string): string | null {
  const m = /^([A-Z]+-\d+)(?:-[^/\\]*)?\.md$/.exec(name);
  return m ? m[1]! : null;
}
