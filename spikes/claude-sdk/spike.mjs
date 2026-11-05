// F0 spike (PBI-1): can Featra drive the user's logged-in `claude` through the Agent SDK the way M1 needs?
// Run: pnpm --filter @featra/spike-claude-sdk spike   → writes results.json next to this file.
// Featra code here never reads any credential file; auth is whatever the user's `claude` login already is.
import { query } from "@anthropic-ai/claude-agent-sdk";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const results = { startedAt: new Date().toISOString(), checks: {} };
const record = (name, ok, detail) => {
  results.checks[name] = { ok, ...detail };
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`, JSON.stringify(detail));
};

// Strip API-key env vars so the only possible auth is the user's own CLI login.
const env = { ...process.env };
// Like T3 Code: run the user's installed `claude`, not the SDK's bundled binary.
const claudePath = execFileSync(process.platform === "win32" ? "where" : "which", ["claude"], { encoding: "utf8" }).trim().split(String.fromCharCode(10))[0].trim();
results.claudePath = claudePath;
delete env.ANTHROPIC_API_KEY;
delete env.ANTHROPIC_AUTH_TOKEN;

async function run(label, prompt, options) {
  const transcript = [];
  let init = null;
  let result = null;
  for await (const msg of query({ prompt, options: { env, pathToClaudeCodeExecutable: claudePath, ...options } })) {
    transcript.push(msg);
    if (msg.type === "system" && msg.subtype === "init") init = msg;
    if (msg.type === "result") result = msg;
  }
  writeFileSync(join(here, `transcript-${label}.json`), JSON.stringify(transcript, null, 2));
  return { init, result, transcript };
}

// --- Session A: AskUserQuestion interception, per-session model + effort (cheap model) ---
const asked = [];
const a = await run(
  "ask",
  "Use the AskUserQuestion tool to ask me one question: which colour I prefer, with exactly two options, Red and Blue. " +
    "After I answer, reply with only the colour I chose, in capitals.",
  {
    model: "haiku",
    effort: "low",
    settingSources: [],
    canUseTool: async (toolName, input) => {
      if (toolName === "AskUserQuestion") {
        asked.push(input);
        const answers = Object.fromEntries((input.questions ?? []).map((q) => [q.question, "Blue"]));
        return { behavior: "allow", updatedInput: { ...input, answers } };
      }
      return { behavior: "deny", message: "Not needed for this spike." };
    },
  },
);
record("login", !!a.init && a.result?.subtype === "success", {
  apiKeySource: a.init?.apiKeySource ?? null,
  note: "ANTHROPIC_API_KEY/AUTH_TOKEN removed from env; Featra read no credential files",
});
// The AC is that the user answer reaches the agent: check the tool result the agent received, not its wording.
const askResults = a.transcript.flatMap((m) => (m.type === "user" ? (m.message?.content ?? []) : [])).filter((c) => c.type === "tool_result");
const delivered = askResults.some((c) => JSON.stringify(c.content).includes("=\\\"Blue\\\""));
record("ask", asked.length > 0 && delivered && /blue/i.test(a.result?.result ?? ""), { questions: asked.map((i) => i.questions?.map((q) => q.question)), toolResult: askResults.map((c) => c.content), reply: a.result?.result ?? null });

// --- Session B: different model, stdio MCP attached, worktree as cwd ---
const repo = mkdtempSync(join(tmpdir(), "featra-spike-"));
const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
git("init", "-b", "main");
writeFileSync(join(repo, "README.md"), "spike\n");
git("add", ".");
git("-c", "user.name=spike", "-c", "user.email=spike@localhost", "commit", "-m", "init");
const worktree = join(repo, "..", `${repo.split(/[\\/]/).pop()}-wt`);
git("worktree", "add", "-b", "feat/1-pbi-1", worktree);
const mcpLog = join(worktree, "..", `${repo.split(/[\\/]/).pop()}-mcp.log`);

const seenB = [];
const b = await run(
  "mcp-cwd",
  "1) Call the mcp__featra__ping tool with word 'hello' and remember its exact output. " +
    "2) Create a file named proof.txt in the current directory containing exactly that output. " +
    "3) Reply with only that output.",
  {
    model: "sonnet",
    effort: "high",
    cwd: worktree,
    settingSources: [],
    mcpServers: {
      featra: { type: "stdio", command: process.execPath, args: [join(here, "mcp-server.mjs")], env: { FEATRA_SPIKE_LOG: mcpLog } },
    },
    // No allowedTools: does canUseTool get asked for MCP tools too?
    canUseTool: async (toolName, input) => {
      seenB.push(toolName);
      return { behavior: "allow", updatedInput: input };
    },
  },
);
record("model", a.init?.model !== b.init?.model && /haiku/i.test(a.init?.model ?? "") && /sonnet/i.test(b.init?.model ?? ""), {
  sessionA: a.init?.model ?? null,
  sessionB: b.init?.model ?? null,
});
const mcpStatus = b.init?.mcp_servers ?? null;
const mcpCalled = existsSync(mcpLog) ? readFileSync(mcpLog, "utf8").trim() : null;
record("mcp", !!mcpCalled && /FEATRA-7731/.test(b.result?.result ?? ""), { status: mcpStatus, canUseToolSaw: seenB, serverLog: mcpCalled, reply: b.result?.result ?? null });
const proof = join(worktree, "proof.txt");
record("cwd", b.init?.cwd === worktree && existsSync(proof) && !existsSync(join(repo, "proof.txt")), {
  initCwd: b.init?.cwd ?? null,
  worktree,
  proofInWorktree: existsSync(proof) ? readFileSync(proof, "utf8").trim() : null,
});

results.cost = { a: a.result?.total_cost_usd ?? null, b: b.result?.total_cost_usd ?? null };
results.finishedAt = new Date().toISOString();
writeFileSync(join(here, "results.json"), JSON.stringify(results, null, 2));
process.exitCode = Object.values(results.checks).every((c) => c.ok) ? 0 : 1;
