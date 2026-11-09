/**
 * Claude's suggested rule for Allow for this chat (STORY-45, ADR 0018). `canUseTool` gets `suggestions`: the
 * permission updates Claude would make so it doesn't ask again. Featra keeps only the allow rules among them and sends
 * them back unchanged as `updatedPermissions`, but always for this session (`destination: "session"`), never to the
 * user's settings files. Claude then matches later calls itself. Any other update (a mode change, added directories)
 * is dropped, since Allow for this chat never widens more than a rule.
 */
import type { PermissionUpdate } from "@anthropic-ai/claude-agent-sdk";
import { SHELL_TOOLS } from "@featra/work-format";
import type { SuggestedRule } from "./provider.ts";

export type AddRules = Extract<PermissionUpdate, { type: "addRules" }>;
type RuleValue = AddRules["rules"][number];

/** A rule's content as the button's description says it. */
export function ruleText({ toolName, ruleContent }: RuleValue): string {
  if (!ruleContent) return `Every ${toolName} call`;
  if (SHELL_TOOLS.includes(toolName)) {
    const prefix = /^(.*?)(?::\*| \*)$/.exec(ruleContent)?.[1];
    return prefix ? `${prefix} commands` : `This command: ${ruleContent}`;
  }
  if (toolName === "WebFetch" && ruleContent.startsWith("domain:")) {
    return `Fetches from ${ruleContent.slice("domain:".length)}`;
  }
  return `${toolName}: ${ruleContent}`;
}

/** Claude's suggested allow rules, each for this session only; none when it suggests no allow rule. */
export function sessionRules(suggestions: readonly PermissionUpdate[] | undefined): AddRules[] {
  return (suggestions ?? [])
    .filter((s): s is AddRules => s.type === "addRules" && s.behavior === "allow" && s.rules.length > 0)
    .map((s): AddRules => ({ type: s.type, rules: s.rules, behavior: s.behavior, destination: "session" }));
}

/** The rules as the provider's suggestion for Allow for this chat, or null when there are none. */
export function suggestedRule(rules: AddRules[]): SuggestedRule | null {
  if (rules.length === 0) return null;
  return { rule: rules, covers: rules.flatMap((r) => r.rules.map(ruleText)).join(", ") };
}
