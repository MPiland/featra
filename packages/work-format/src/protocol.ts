/**
 * The local server's WebSocket API (ADR 0015): the shapes both ends check. One JSON text frame per message. The
 * client sends `{ id, method, params }`; the server answers each with `{ id, ok: true, result }` or
 * `{ id, ok: false, error }`. Pure, so the server, the client and the tests share one copy.
 */
import type { CardEdit, CardUpdateResult, CardView } from "./card-view-types.ts";
import type { ApprovalChoice } from "./approvals.ts";
import type { Answers } from "./questions.ts";
import type { ChecksPatch, ChecksView } from "./checks-types.ts";
import type { ChatControlState, SettingsChange } from "./chat-controls.ts";
import type { ChatEvent, ChatSnapshot } from "./chat-events.ts";
import type { ChatList } from "./chat-list.ts";
import type { Inbox, InboxItem } from "./inbox.ts";
import type { Role } from "./roles.ts";
import type { RoleEdit, RoleEditResult, RoleList } from "./role-edit.ts";
import type { SetupItemId, SetupPlan } from "./setup-plan.ts";
import { isOneOf, isRecord } from "./utils/guards.ts";
import { isId } from "./protocol-frames.ts";
import type { WorkList } from "./work-list-types.ts";

/** Only loopback, always: the server must not be reachable from another machine (docs/architecture.md). */
export const SERVER_HOST = "127.0.0.1";

/** The URL path the server answers on: the protocol version. A breaking change gets a new path. */
export const SERVER_PATH = "/v1";

/** Where a project stands: not a git repository, a repository without `.featra/`, or set up. */
export type ProjectSetup =
  | { state: "no-git" }
  | { state: "no-featra" }
  | { state: "ready" }
  | { state: "error"; error: string };

/** What Featra init did: the paths it created and the ones it found and kept, relative to the project. */
export type InitResult = { ok: true; created: string[]; kept: string[] } | { ok: false; error: string };

/** What applying or discarding a stale copy did. */
export type CopyActionResult = { ok: true } | { ok: false; error: string };

/** Every method, its params and its result. A new method is added here first. */
export interface ServerMethods {
  /** Whether the project folder is a git repository and holds `.featra/`. */
  "project.setupStatus": { params: { dir: string }; result: ProjectSetup };
  /** Runs `git init` in a folder that is not yet in a repository; answers with the new status. */
  "project.gitInit": { params: { dir: string }; result: ProjectSetup };
  /** Scaffolds `.featra/` and the knowledge files that are missing, in a git repository. */
  "project.init": { params: { dir: string }; result: InitResult };
  /** Before one-screen setup (STORY-42): whether the folder is a repository and which setup items it already has. */
  "project.setupPlan": { params: { dir: string }; result: SetupPlan };
  /** One-screen setup: `git init` if needed, then the chosen items (required ones always), creating only what is missing. */
  "project.setup": { params: { dir: string; items: SetupItemId[] }; result: InitResult };
  /**
   * The project's Work list now; then, until `work.unwatch`, a `work.list` push on this socket each time it changes.
   * The request's id names the watch.
   */
  "work.watch": { params: { dir: string }; result: WorkList };
  /** Stops the watch the `work.watch` request with id `watch` started. */
  "work.unwatch": { params: { watch: number }; result: null };
  /** Applies a stale copy's edit to the owner's file, then restores the copy from git (ADR 0016). */
  "work.applyCopy": { params: { dir: string; key: string }; result: CopyActionResult };
  /** Throws a stale copy's edit away: restores the copy from git. */
  "work.discardCopy": { params: { dir: string; key: string }; result: CopyActionResult };
  /** One card from its owner (null if none), then a `card.view` push on each change until `work.unwatch` (ADR 0017). */
  "card.watch": { params: { dir: string; id: string }; result: CardView | null };
  /** Applies one edit to the card's owner copy, on disk; answers with the card as it is after (ADR 0017). */
  "card.update": { params: { dir: string; id: string; edit: CardEdit }; result: CardUpdateResult };
  /**
   * Sends a draft feature back to the chat that drafted it with the user's reason, then records it in the feature's
   * history (STORY-50). Refused without a reason, for a feature that isn't a draft, or when its chat is gone.
   */
  "draft.sendBack": { params: { dir: string; id: string; reason: string }; result: { recorded: boolean } };
  /**
   * Approves a draft feature (STORY-51, ADR 0023): marks it approved, sets its scope baseline and commits its cards to
   * main's checkout, never pushing. All or nothing; refused when the feature isn't a draft any more.
   */
  "draft.approve": { params: { dir: string; id: string }; result: { commit: string } };
  /**
   * Starts an approved feature (STORY-52, ADR 0024): creates `feature/N-slug` from the base branch without touching
   * main's checkout, the feature active on it. All or nothing; refused when it isn't approved or its branch exists.
   */
  "feature.start": { params: { dir: string; id: string }; result: { branch: string } };
  /**
   * Starts a story's agent (STORY-9, ADR 0025): a worktree off the feature's branch, the story In Progress there, and a
   * session in it, nested under the feature's chat. Answers `queued` when the project's limit is reached: the session
   * starts when one ends. Refused when the story can't be started or its provider has no runner.
   */
  "story.start": { params: { dir: string; id: string }; result: { chat: string; queued: boolean } };
  /**
   * Stops a story's running turn (STORY-53, ADR 0026): marked Stopped, stage and worktree kept. A story queued and never
   * started leaves the queue instead, unmarked. Refused when it has no turn or is already stopped.
   */
  "story.stop": { params: { dir: string; id: string }; result: null };
  /**
   * Resumes a Stopped story, or an In Progress one whose idle session ended without finishing: the same provider
   * session goes on and Stopped is cleared. Refused when its provider can't resume.
   */
  "story.resume": { params: { dir: string; id: string }; result: null };
  /**
   * Accepts a story waiting in Acceptance (STORY-23): records Accepted in its history, by the user, and moves it to Done
   * when its evidence allows. Refused when the story isn't waiting in Acceptance or is already accepted.
   */
  "story.accept": { params: { dir: string; id: string }; result: null };
  /**
   * Merges a Verified story into its feature branch with a merge commit (STORY-12): through its PR when the project uses
   * GitHub, else in git. Afterwards its session stops, and its worktree and branches go. Refused with why when it can't
   * merge; a conflict merges nothing, returns the story to In Progress and is refused with the files. `remains` says
   * what was left behind (a worktree or branch that couldn't be removed); empty when it all went.
   */
  "story.merge": { params: { dir: string; id: string }; result: { remains: string[] } };
  /**
   * Runs a story's checks on this computer again now (STORY-56): the check command and the linked tests. Refused when
   * checks run in CI for the project or the story isn't in review. The result reaches the card through `card.view`.
   */
  "story.rerunChecks": { params: { dir: string; id: string }; result: null };
  /**
   * Pushes a story's branch and opens its PR against the feature branch through the user's `gh` (STORY-11), or adopts
   * the open PR from that branch. Refused in local mode, outside review, or when the story has a PR; a push or `gh`
   * failure is refused with its reason, which the card also shows.
   */
  "story.createPr": { params: { dir: string; id: string }; result: null };
  /** The window regained focus: every open project reads its open PRs again soon (STORY-11). */
  "prs.refresh": { params: Record<string, never>; result: null };
  /** Project settings' Checks section: where checks run, the commands, and the proposals waiting for the user (STORY-56). */
  "checks.load": { params: { dir: string }; result: ChecksView };
  /** Changes the Checks settings in the project's config (`null` clears one); answers with the section as it is after. */
  "checks.set": { params: { dir: string; patch: ChecksPatch }; result: ChecksView };
  /**
   * Sends a story in Acceptance back to its session with the user's reason, as the user's message (STORY-23): logged in
   * history, the story In Progress again, and with `addCriterion` the reason a new acceptance criterion. Refused
   * without a reason, when the story isn't waiting in Acceptance, or when its session is gone.
   */
  "story.sendBack": {
    params: { dir: string; id: string; reason: string; addCriterion: boolean };
    result: { recorded: boolean };
  };
  /** Rejects a draft feature: deletes its card files. Refused when git tracks any of them. */
  "draft.reject": { params: { dir: string; id: string }; result: { removed: number } };
  /** The roles a chat in this project can start from (ADR 0018). */
  "chat.roles": { params: { dir: string }; result: Role[] };
  /**
   * The project's roles with the files that couldn't be read (STORY-6); then, until `work.unwatch`, a `roles.list`
   * push each time a role file or a provider's agent file or settings change. The request's id names the watch.
   */
  "roles.watch": { params: { dir: string }; result: RoleList };
  /** Applies one edit to the project's roles, writing only `.featra/roles/`; answers with the role it made or why not. */
  "roles.edit": { params: { dir: string; edit: RoleEdit }; result: RoleEditResult };
  /** Starts a chat from a role in the project folder; answers with its id. Its agent starts with the first message. */
  "chat.start": { params: { dir: string; role: string; card?: string }; result: { id: string } };
  /**
   * The chat's event log so far; then, until `work.unwatch`, a `chat.event` push for each new event. The request's id
   * names the watch.
   */
  "chat.watch": { params: { id: string }; result: ChatSnapshot };
  /** The chat's composer controls under its provider's own names, and the settings it runs with (STORY-22). */
  "chat.controls": { params: { id: string }; result: ChatControlState };
  /** Changes the chat's role, model, effort or permission mode from its next turn; answers with the new state. */
  "chat.configure": { params: { id: string; change: SettingsChange }; result: ChatControlState };
  /** Sends the user's message: starts a turn. */
  "chat.send": { params: { id: string; text: string }; result: null };
  /** Interrupts the running turn. */
  "chat.stop": { params: { id: string }; result: null };
  /** Removes an ended subagent from its session's nest (STORY-55); refused for any other chat, or one still running. */
  "chat.archive": { params: { id: string }; result: null };
  /**
   * Answers the tool request the chat waits on (STORY-45): Allow, Allow for this chat, or Deny with an optional
   * reason the agent is sent. Refused when the request isn't waiting.
   */
  "chat.approve": {
    params: { id: string; tool: string; choice: ApprovalChoice; reason?: string };
    result: null;
  };
  /**
   * Answers the question the chat waits on (STORY-46): for each question's text, what the user chose. Refused when the
   * question isn't waiting, or the answers don't answer each question as it asks.
   */
  "chat.answer": { params: { id: string; tool: string; answers: Answers }; result: null };
  /**
   * Takes an entry an agent logged (STORY-47) back out of its file: only that entry, whatever was logged since. Refused
   * when the entry is already removed or the user has edited it.
   */
  "chat.undoLog": { params: { id: string; entry: string }; result: null };
  /**
   * The project's chats and the providers they group under (STORY-21); then, until `work.unwatch`, a `chat.list` push
   * each time a row changes. The request's id names the watch.
   */
  "chat.list": { params: { dir: string }; result: ChatList };
  /**
   * The approvals and questions (of one project, or of every open one without `dir`) that have waited on the user at least `waitMs` on the server's clock, oldest
   * first (STORY-7); then, until `work.unwatch`, an `inbox.list` push each time that set changes. The request's id names
   * the watch.
   */
  "inbox.watch": { params: { dir?: string; waitMs: number }; result: Inbox };
  /**
   * Nothing, then until `work.unwatch` an `inbox.asked` push as soon as a chat of the project asks for an approval or an
   * answer, whatever the wait (STORY-7): what a desktop notification is made from. The request's id names the watch.
   */
  "inbox.asked": { params: { dir?: string }; result: null };
}

/** Frames the server sends unasked, and the data each carries. */
export interface ServerPushes {
  /** The Work list changed: the whole new list, for the watch the frame names. */
  "work.list": WorkList;
  /** The watched card changed: the whole new view, or null when the card is gone. */
  "card.view": CardView | null;
  /** A watched chat has a new event. */
  "chat.event": ChatEvent;
  /** A role file or a provider's agent file or settings changed: the whole new list. */
  "roles.list": RoleList;
  /** A row of the watched chat list changed, or a chat came or went: the whole new list. */
  "chat.list": ChatList;
  /** The Inbox changed: the whole new Inbox, for the watch the frame names. */
  "inbox.list": Inbox;
  /** A chat asked for an approval or an answer just now. */
  "inbox.asked": InboxItem;
}

/** The `{ dir }` params every project method takes, or null. */
export function dirParams(params: unknown): { dir: string } | null {
  return isRecord(params) && typeof params.dir === "string" && params.dir ? { dir: params.dir } : null;
}

const SETUP_STATES = ["no-git", "no-featra", "ready"] as const;

export function normalizeProjectSetup(raw: unknown): ProjectSetup {
  const r = isRecord(raw) ? raw : {};
  if (isOneOf(SETUP_STATES, r.state)) return { state: r.state };
  return { state: "error", error: typeof r.error === "string" && r.error ? r.error : "Something went wrong." };
}

const strings = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string") : [];

export function normalizeInitResult(raw: unknown): InitResult {
  const r = isRecord(raw) ? raw : {};
  if (r.ok === true) return { ok: true, created: strings(r.created), kept: strings(r.kept) };
  return { ok: false, error: typeof r.error === "string" && r.error ? r.error : "Something went wrong." };
}

/** The `{ watch }` params of `work.unwatch`, or null. */
export function unwatchParams(params: unknown): { watch: number } | null {
  return isRecord(params) && isId(params.watch) ? { watch: params.watch } : null;
}

// The framing lives in protocol-frames.ts; it is part of this module's surface.
export {
  parsePush,
  parseRequest,
  parseResponse,
  SERVER_METHODS,
  type PushEvent,
  type ServerMethod,
  type ServerPush,
  type ServerRequest,
  type ServerResponse,
} from "./protocol-frames.ts";
