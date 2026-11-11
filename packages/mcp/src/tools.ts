/**
 * The Featra MCP's tools (STORY-47). Each is a name, a description and a JSON schema (what an agent reads), and a
 * `run` that checks the agent's input and acts through the host. The descriptions are product copy: they are what
 * teaches an agent when to log, since Featra injects no system prompt (ADR 0006). `draft_cards` (STORY-8) is the third:
 * its description teaches the card format, so Featra still injects nothing. A new tool is one more entry in `TOOLS` and,
 * if it needs the server, one more method on `FeatraHost`.
 */
import {
  DEFAULT_CONFIG,
  DRAFT_LIMITS,
  LOG_FILES,
  REPORT_LIMITS,
  stageCeiling,
  parseDecision,
  parseDraft,
  parseQuestion,
  parseReportInput,
  parseSpawnInput,
  parseStartInput,
  type DraftInput,
  type DraftResult,
  type LoggedEntry,
  type LogInput,
  type Parsed,
  type ReportInput,
  type SpawnInput,
} from "@featra/work-format";

/** What the tools reach the server through. */
export interface FeatraHost {
  /** Adds an entry to the chat's `decisions.md` or `open-questions.md`. */
  log: (input: LogInput) => Promise<LoggedEntry>;
  /** Drafts a feature and its stories, or revises the chat's open draft in place (STORY-8). */
  draft: (input: DraftInput) => Promise<DraftResult>;
  /** Starts an approved feature: its branch, with the feature active on it (STORY-52). */
  start: (feature: string) => Promise<{ branch: string }>;
  /** Starts a story's agent in its own worktree, nested under this chat; queued when the project is at its limit (STORY-9). */
  spawn: (input: SpawnInput) => Promise<{ chat: string; queued: boolean }>;
  /** Reports progress on a card: the stage, ticks, tasks, a note and evidence links, all Reported (STORY-10). */
  update: (input: ReportInput) => Promise<{ card: string; changes: string[] }>;
}

export interface Tool {
  name: string;
  description: string;
  /** JSON Schema of the input, as an agent sees it. */
  inputSchema: { type: "object"; properties: Record<string, unknown>; required: string[] };
  /** Runs the call; throws a `ToolRefusal` for input to fix. Resolves with the line the agent is told. */
  run: (input: unknown, host: FeatraHost) => Promise<string>;
  /** What a failure that isn't a refusal (the server said no, or is gone) starts with. Default: "Not logged." */
  failed?: string;
}

/** A call that can't be done as given: the message tells the agent what to fix. */
export class ToolRefusal extends Error {}

const card = {
  type: "string",
  description: "The card this work is for, such as STORY-47. Leave it out when there isn't one.",
};

async function log<T extends LogInput>(parsed: Parsed<T>, host: FeatraHost): Promise<string> {
  if (!parsed.ok) throw new ToolRefusal(`Not logged. ${parsed.error}`);
  const { file } = await host.log(parsed.value);
  return `Logged to ${file}.`;
}

const LOG_DECISION: Tool = {
  name: "log_decision",
  description: [
    `Record a decision and why you made it in ${LOG_FILES.decision}, so the next agent or the user can see the reasoning.`,
    "Log it when you chose something that changes behavior or scope, a public contract (API, file format, protocol),",
    "stored data or security, or when you picked between real trade-offs.",
    "Do not log trivia: names, formatting, steps the user told you to take, or anything obvious from the code.",
    "Call it as you decide, in the same turn, without asking. The user sees it in the chat and can undo it.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      decision: { type: "string", description: "What was decided, in one sentence." },
      why: { type: "string", description: "The reasons: constraints, evidence and the trade-off you accepted." },
      rejected: {
        type: "array",
        items: { type: "string" },
        description: "Real alternatives you turned down, each with the reason. Leave it out if there were none.",
      },
      card,
    },
    required: ["decision", "why"],
  },
  run: (input, host) => log(parseDecision(input), host),
};

const DEFER_QUESTION: Tool = {
  name: "defer_question",
  description: [
    `Park a question only the user can answer in ${LOG_FILES.question}, and keep working on an assumption.`,
    "Use it for a product or scope choice that is not yours to make and does not block the rest of your task:",
    "say what you assumed in the context.",
    "If you cannot go on without the answer, ask the user directly instead.",
    "Do not log a question you can answer by reading the code or the docs.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      question: { type: "string", description: "The question, in one sentence." },
      context: {
        type: "string",
        description: "What you assumed meanwhile, the options you see, and the one you recommend.",
      },
      card,
    },
    required: ["question", "context"],
  },
  run: (input, host) => log(parseQuestion(input), host),
};

/** What the agent is told a draft did: the IDs, so a later call can name the stories it keeps. */
function drafted(result: DraftResult): string {
  const { feature, stories, created, cancelled } = result;
  const head = created ? `Drafted ${feature}` : `Updated ${feature} in place`;
  const left = cancelled.length ? ` Left out and cancelled: ${cancelled.join(", ")}.` : "";
  return `${head} with ${stories.join(", ")}.${left} Not committed: the user reviews the draft in Work.`;
}

const DRAFT_CARDS: Tool = {
  name: "draft_cards",
  failed: "Not drafted.",
  description: [
    "Draft a feature and its stories as cards the user reviews in Featra's Work view, once you have talked the feature through with them.",
    "Nothing is committed: the cards are a Draft the user reads, and Featra allocates every ID.",
    "A feature is one user-facing capability (title, and a description of what it gives the user and why).",
    "A story is a vertical slice: one behavior the user can see, working end to end, never a layer such as 'backend first'.",
    "Each story has a title; a user story in the form 'As a <who>, I <do what> so that <why>'; acceptance criteria,",
    "each one observable and testable, written as a plain statement of what the user sees or what happens; and tasks,",
    "the steps to build it. Keep the stories few and small enough to build one at a time.",
    "Call it again from this chat to revise the draft: it updates the same feature and the same cards in place, and records the change in each card's history.",
    "Send the whole draft each time. Give a story's id (from the answer) to keep it; a story without an id is new,",
    "and a story you leave out is cancelled. The input is checked, and a draft that is refused writes nothing: read the error and call again.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      feature: {
        type: "object",
        description: "The feature.",
        properties: {
          title: { type: "string", description: `A short name, at most ${DRAFT_LIMITS.title} characters.` },
          description: {
            type: "string",
            description: "What it gives the user and why, in plain text without headings.",
          },
        },
        required: ["title", "description"],
      },
      stories: {
        type: "array",
        description: `The feature's stories, in build order (at most ${DRAFT_LIMITS.stories}).`,
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description:
                "The story's card id, such as STORY-12, to keep and revise it. Leave it out for a new story.",
            },
            title: { type: "string", description: "A short name." },
            story: { type: "string", description: "The user story: 'As a builder, I ... so that ...'." },
            criteria: {
              type: "array",
              items: { type: "string" },
              description: "Acceptance criteria: what must be true, one testable statement each. At least one.",
            },
            tasks: {
              type: "array",
              items: { type: "string" },
              description: "The steps to build the story, one line each.",
            },
          },
          required: ["title", "story", "criteria"],
        },
      },
    },
    required: ["feature", "stories"],
  },
  async run(input, host) {
    const parsed = parseDraft(input);
    if (!parsed.ok) throw new ToolRefusal(parsed.error);
    return drafted(await host.draft(parsed.value));
  },
};

const START_FEATURE: Tool = {
  name: "start_feature",
  failed: "Not started.",
  description: [
    "Start a feature the user has approved: Featra creates its branch (feature/<number>-<title>) from the base branch,",
    "marks the feature active there, and from then on the feature and its stories live on that branch.",
    "Call it only once the user has approved the feature and asked you to start it.",
    "It never changes the user's checkout and never pushes. It is refused when the feature isn't approved,",
    "already has a branch, or the base branch can't be found; the error says which.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: { feature: { type: "string", description: "The feature's card id, such as FEAT-5." } },
    required: ["feature"],
  },
  async run(input, host) {
    const parsed = parseStartInput(input);
    if (!parsed.ok) throw new ToolRefusal(parsed.error);
    const { branch } = await host.start(parsed.id);
    return `Started ${parsed.id} on ${branch}. Not pushed.`;
  },
};

const SPAWN_SESSION: Tool = {
  name: "spawn_session",
  failed: "Not started.",
  description: [
    "Start an agent on one story of a started feature: Featra makes the story's worktree off the feature's branch,",
    "moves the story to In Progress there, and starts a session in it whose first message is the role's instructions,",
    "the story's card and your brief. The session runs with your permissions, and what it still needs to ask shows in",
    "this chat. It is queued when the project's limit of story agents at once is reached, and starts when one ends.",
    "Call it once the feature is started and the user wants the story worked on.",
    "It is refused when the story isn't New or Ready, its feature isn't started, or the role's agent can't run stories.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      story: { type: "string", description: "The story's card id, such as STORY-9." },
      role: { type: "string", description: "The role the agent runs as. Default: developer." },
      model: { type: "string", description: "The model, in the agent's own names. Default: the role's." },
      effort: { type: "string", description: "The effort, in the agent's own names. Default: the role's." },
      brief: {
        type: "string",
        description: "What to tell the agent beyond the card: what to focus on, what to avoid.",
      },
    },
    required: ["story"],
  },
  async run(input, host) {
    const parsed = parseSpawnInput(input);
    if (!parsed.ok) throw new ToolRefusal(parsed.error);
    const { queued } = await host.spawn(parsed.value);
    return queued
      ? `Queued ${parsed.value.story}. It starts when a story agent ends.`
      : `Started ${parsed.value.story}.`;
  },
};

const list = (description: string) => ({ type: "array", items: { type: "string" }, description });

const UPDATE_CARD: Tool = {
  name: "update_card",
  failed: "Not updated.",
  description: [
    "Report progress on a story's card in Featra, as you work: the user sees it live in Work, marked Reported.",
    "Everything you write here is your claim, never proof: Featra marks it Reported, and only CI, the linked tests and the user make a story Verified, Proven or Accepted.",
    "A card has a stage (New, Ready, In Progress, In Review, Acceptance, Done), acceptance criteria (what must be true),",
    "tasks (the steps) and notes. In a story session you update your own card only (`card` is optional);",
    "a Dev Lead can name any card of its feature as `card`. Any other chat is refused.",
    `You may move the stage forward, up to ${stageCeiling(DEFAULT_CONFIG)} (the project's last stage before Done): never to Done, Cancelled or backwards, which are the user's.`,
    "Tick tasks and criteria by their exact text as the card has it (`tasks`, `criteria`), add tasks you discover (`addTasks`),",
    "and append one short line to the notes (`note`): not a log, only what the next reader needs.",
    "Nothing else on the card can be changed.",
    "Evidence is a file that shows a criterion works, such as a screenshot. Write it in your worktree under",
    ".featra/evidence/<FEAT-N>/<STORY-M>/ (your feature's and your story's ids), then link it in `criteria` as `evidence`;",
    "a link anywhere else is refused. Keep evidence as small as the story allows: one screenshot per criterion at most,",
    `each under ${REPORT_LIMITS.evidenceBytes / 1_000_000} MB, and none when a test already proves it.`,
    "This does not commit: commit the card and its evidence with your work. The input is checked, and a call that is refused changes nothing.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      card: { type: "string", description: "The card's id, such as STORY-10. A story session leaves it out." },
      stage: {
        type: "string",
        description: "The stage to move forward to, such as In Review or Acceptance. Never Done.",
      },
      tasks: list("Tasks to tick, each as the card words it."),
      addTasks: list(`New tasks to add, one line each (at most ${REPORT_LIMITS.added}).`),
      criteria: {
        type: "array",
        description: "Acceptance criteria to tick.",
        items: {
          type: "object",
          properties: {
            criterion: { type: "string", description: "The criterion, as the card words it." },
            evidence: {
              type: "string",
              description: "A file you wrote under .featra/evidence/<FEAT-N>/<STORY-M>/ that shows it works.",
            },
          },
          required: ["criterion"],
        },
      },
      note: {
        type: "string",
        description: `One short line for the card's notes (at most ${REPORT_LIMITS.note} characters).`,
      },
    },
    required: [],
  },
  async run(input, host) {
    const parsed = parseReportInput(input);
    if (!parsed.ok) throw new ToolRefusal(parsed.error);
    const { card: id, changes } = await host.update(parsed.value);
    return changes.length
      ? `Updated ${id}: ${changes.join(", ")}. Reported, not committed: commit the card and its evidence with your work.`
      : `Nothing to change on ${id}.`;
  },
};

/** Every tool the server offers, in the order an agent lists them. */
export const TOOLS: readonly Tool[] = [
  LOG_DECISION,
  DEFER_QUESTION,
  DRAFT_CARDS,
  START_FEATURE,
  SPAWN_SESSION,
  UPDATE_CARD,
];
