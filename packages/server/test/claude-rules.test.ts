/** STORY-45: Claude's suggested rule for Allow for this chat, kept to allow rules and this session only. */
import { describe, expect, it } from "vitest";
import type { PermissionUpdate } from "@anthropic-ai/claude-agent-sdk";
import { ruleText, sessionRules, suggestedRule } from "../src/claude-rules.ts";

const sessionRule = (suggestions: PermissionUpdate[] | undefined) => suggestedRule(sessionRules(suggestions));

describe("sessionRule", () => {
  it("keeps the allow rules, each for this session, and nothing that changes the mode or folders", () => {
    const suggestions: PermissionUpdate[] = [
      {
        type: "addRules",
        rules: [{ toolName: "Bash", ruleContent: "npm test:*" }],
        behavior: "allow",
        destination: "userSettings",
      },
      {
        type: "addRules",
        rules: [{ toolName: "Bash", ruleContent: "rm:*" }],
        behavior: "deny",
        destination: "session",
      },
      { type: "addDirectories", directories: ["/"], destination: "session" },
      { type: "setMode", mode: "bypassPermissions", destination: "session" },
    ];
    expect(sessionRule(suggestions)).toEqual({
      rule: [
        {
          type: "addRules",
          rules: [{ toolName: "Bash", ruleContent: "npm test:*" }],
          behavior: "allow",
          destination: "session",
        },
      ],
      covers: "npm test commands",
    });
  });

  it("is null with no allow rule to keep", () => {
    expect(sessionRule(undefined)).toBeNull();
    expect(sessionRule([{ type: "setMode", mode: "acceptEdits", destination: "session" }])).toBeNull();
    expect(sessionRule([{ type: "addRules", rules: [], behavior: "allow", destination: "session" }])).toBeNull();
  });
});

describe("ruleText", () => {
  it("says a rule in a short line", () => {
    expect(ruleText({ toolName: "Bash", ruleContent: "npm test:*" })).toBe("npm test commands");
    expect(ruleText({ toolName: "Bash", ruleContent: "npm run build *" })).toBe("npm run build commands");
    expect(ruleText({ toolName: "Bash", ruleContent: "git status" })).toBe("This command: git status");
    expect(ruleText({ toolName: "WebFetch", ruleContent: "domain:example.com" })).toBe("Fetches from example.com");
    expect(ruleText({ toolName: "Edit", ruleContent: "src/**" })).toBe("Edit: src/**");
    expect(ruleText({ toolName: "mcp__gh__create_issue" })).toBe("Every mcp__gh__create_issue call");
  });
});
