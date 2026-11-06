import { isKnownStatus } from "./config.ts";
import { ID_PREFIX, parseId } from "./ids.ts";
import { CONTAINER_STATUSES, type Card, type CardType, type ProjectConfig } from "./types.ts";
import { isOneOf } from "./utils/guards.ts";

export interface CardIssue {
  id: string;
  message: string;
}

const ALLOWED_PARENT: Record<CardType, { types: CardType[]; required: boolean }> = {
  epic: { types: [], required: false },
  feature: { types: ["epic"], required: false },
  story: { types: ["feature"], required: true },
  bug: { types: ["feature"], required: false },
};

/** Structural checks across a set of cards. Returns every problem found; empty means valid. */
export function validateCards(cards: readonly Card[], config: ProjectConfig): CardIssue[] {
  const issues: CardIssue[] = [];
  const byId = new Map<string, Card>();
  for (const c of cards) {
    if (byId.has(c.id)) issues.push({ id: c.id, message: "duplicate id" });
    byId.set(c.id, c);
  }
  for (const c of cards) {
    const p = parseId(c.id);
    if (!p || p.prefix !== ID_PREFIX[c.type])
      issues.push({ id: c.id, message: `id should look like ${ID_PREFIX[c.type]}-<n>` });

    if (c.type === "story" || c.type === "bug") {
      if (!isKnownStatus(c.status, config)) issues.push({ id: c.id, message: `unknown stage "${c.status}"` });
    } else if (!isOneOf(CONTAINER_STATUSES, c.status)) {
      issues.push({ id: c.id, message: `status must be one of ${CONTAINER_STATUSES.join(", ")}` });
    }

    const rule = ALLOWED_PARENT[c.type];
    if (c.parent === null) {
      if (rule.required) issues.push({ id: c.id, message: `${c.type} needs a parent` });
    } else {
      const parent = byId.get(c.parent);
      if (!parent) issues.push({ id: c.id, message: `parent ${c.parent} not found` });
      else if (!rule.types.includes(parent.type))
        issues.push({ id: c.id, message: `a ${c.type} cannot sit under a ${parent.type}` });
    }
  }
  return issues;
}
