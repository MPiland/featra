import {
  assertNever,
  cardParams,
  cardUpdateParams,
  dirParams,
  sendBackParams,
  storySendBackParams,
  checksSetParams,
  starter,
  type PushEvent,
  type ServerMethod,
  type ServerMethods,
  type ServerPushes,
} from "@featra/work-format";
import type { AllowedProjects } from "./allowed-projects.ts";
import type { AgentBridge } from "./agent-bridge.ts";
import { ApiError } from "./api-error.ts";
import { createChatApi, type ChatApiDeps } from "./api-chat.ts";
import { createBugApi } from "./api-bugs.ts";
import { createEvidenceApi, type EvidenceApiDeps } from "./api-evidence.ts";
import { createProofApi, type ProofApiDeps } from "./api-proof.ts";
import { createStoryEndApi } from "./api-story-end.ts";
import { createFeatureApi, type FeatureApiDeps } from "./api-feature.ts";
import { createProjectApi } from "./api-project.ts";
import { createRoleApi } from "./api-roles.ts";
import { createWatchApi, type WatchApiDeps } from "./api-watch.ts";
import { createWorkApi } from "./api-work.ts";
import type { BugFiling } from "./bug-filing.ts";
import type { CardActions } from "./card-actions.ts";
import { ChatError, type ChatManager } from "./chat-manager.ts";
import type { CopyActions } from "./copy-actions.ts";
import type { DraftActions } from "./draft-actions.ts";
import type { DraftReview } from "./draft-review.ts";
import type { FeatureStart } from "./feature-start.ts";
import type { StorySpawn } from "./story-spawn.ts";
import type { StoryAcceptance } from "./story-acceptance.ts";
import type { StoryMerge } from "./story-merge.ts";
import type { StoryAbandon } from "./story-abandon.ts";
import type { StoryHold } from "./story-hold.ts";
import type { CheckSettings } from "./check-settings.ts";
import type { StoryChecks } from "./story-checks.ts";
import type { StoryPrs } from "./story-prs.ts";
import type { StoryStop } from "./story-stop.ts";
import type { Git } from "./git.ts";
import type { RoleRegistry } from "./role-registry.ts";
import type { RoleWatches } from "./role-watch.ts";
import type { WorkWatches } from "./work-watch.ts";

export { ApiError };

export interface ApiDeps {
  git: Git;
  allowed: AllowedProjects;
  watches: WorkWatches;
  copies: CopyActions;
  cards: CardActions;
  drafts: DraftActions;
  review: DraftReview;
  starts: FeatureStart;
  spawns: StorySpawn;
  stops: StoryStop;
  acceptance: StoryAcceptance;
  /** Merges stories into their features (STORY-12). Without it `story.merge` is refused. */
  merges?: Pick<StoryMerge, "merge">;
  /** Abandons stories (STORY-58). Without it `story.abandonCheck` and `story.abandon` are refused. */
  abandons?: Pick<StoryAbandon, "check" | "abandon">;
  /** Holds stories back from auto-merge (STORY-61). Without it `story.hold` is refused. */
  holds?: Pick<StoryHold, "hold">;
  /** Accepts and merges features (STORY-14). Without it the `feature.*` ending methods are refused. */
  features?: FeatureApiDeps["features"];
  /** Asks for changes on features before Approve (STORY-71). Without it `feature.askChanges` is refused. */
  changes?: FeatureApiDeps["changes"];
  /** Files bugs from Work's New bug (STORY-13). Without it `bug.propose` and `bug.file` are refused. */
  bugs?: Pick<BugFiling, "propose" | "file">;
  /** Why a story's session takes no message from the user now: it is merging or being abandoned. */
  busy?: (dir: string, id: string) => string | null;
  checks: StoryChecks;
  checkSettings: CheckSettings;
  prs: Pick<StoryPrs, "prState" | "decorate" | "createPr" | "focus">;
  chats: ChatManager;
  roles: RoleRegistry;
  roleWatches: RoleWatches;
  /** Takes back what an agent logged; without it there is nothing to take back. */
  agents?: Pick<AgentBridge, "undo">;
  needs?: ChatApiDeps["needs"];
  /** What each story of a feature changed, for its review screen (STORY-69). */
  diffs?: WatchApiDeps["diffs"];
  /** Evidence files read back to show next to their criteria (STORY-72). */
  evidence?: EvidenceApiDeps["evidence"];
  /** The project's proof (STORY-25): its settings, Preview, and the notes and Preview a card shows. */
  proof?: ProofApiDeps["proof"] & { capture: WatchApiDeps["proof"]; design?: WatchApiDeps["design"] };
}

/** The socket a request came in on: how a watch pushes to it and ends with it. */
export interface Connection {
  push: <E extends PushEvent>(event: E, watch: number, data: ServerPushes[E]) => void;
  /** Keeps `stop` until `unwatch(id)` or the socket closes, which calls it. */
  keep: (id: number, stop: () => void) => void;
  /** Stops and forgets the watch `id`; false when there is none. */
  unwatch: (id: number) => boolean;
}

/**
 * Answers one request with that method's result (see `ServerMethods`). Params come from the socket and are checked
 * here; a refused request throws an ApiError. `id` is the request's id, which names a watch.
 */
export type Api = (
  method: ServerMethod,
  params: unknown,
  id: number,
  connection: Connection,
) => Promise<ServerMethods[ServerMethod]["result"]>;

export function createApi({
  git,
  allowed,
  watches,
  copies,
  cards,
  drafts,
  review,
  starts,
  spawns,
  stops,
  acceptance,
  merges,
  abandons,
  holds,
  features,
  changes,
  bugs,
  busy,
  checks,
  checkSettings,
  prs,
  chats,
  roles,
  roleWatches,
  agents,
  needs,
  diffs,
  evidence,
  proof,
}: ApiDeps): Api {
  const allow = (dir: string) => {
    if (!allowed.has(dir)) throw new ApiError("Not an open project.");
    return dir;
  };
  const project = (params: unknown): string => {
    const p = dirParams(params);
    if (!p) throw new ApiError("Expected { dir }.");
    return allow(p.dir);
  };
  /** A card's folder, an open project, and its id. */
  const card = (params: unknown): [dir: string, id: string] => {
    const p = cardParams(params);
    if (!p) throw new ApiError("Expected { dir, id }.");
    return [allow(p.dir), p.id];
  };
  const workApi = createWorkApi({ watches, allowed, copies, prs, allow, project });
  const projectApi = createProjectApi({ git, allow, project });
  const roleApi = createRoleApi({ roles, roleWatches, allowed, allow, project });
  const storyEnd = createStoryEndApi({ merges, abandons, holds, allow });
  const bugApi = createBugApi({ bugs, allow });
  const featureApi = createFeatureApi({ features, changes, card });
  const evidenceApi = createEvidenceApi({ evidence, allow });
  const proofApi = createProofApi({ proof, allow });
  const watchApi = createWatchApi({
    watches,
    allowed,
    checks,
    prs,
    features,
    diffs,
    card,
    proof: proof?.capture,
    design: proof?.design,
  });
  const chatApi = createChatApi({ chats, roles, allowed, agents, allow, project, needs, ...(busy ? { busy } : {}) });

  const answer: Api = async (method, params, id, connection) => {
    switch (method) {
      case "project.setupStatus":
      case "project.gitInit":
      case "project.init":
      case "project.setupPlan":
      case "project.setup":
        return projectApi(method, params);
      case "work.watch":
      case "work.unwatch":
      case "work.applyCopy":
      case "work.discardCopy":
        return workApi(method, params, id, connection);
      case "card.watch":
      case "review.watch":
        return watchApi(method, params, id, connection);

      case "card.update": {
        const p = cardUpdateParams(params);
        if (!p) throw new ApiError("Expected { dir, id, edit }.");
        return cards.update(allow(p.dir), p.id, p.edit);
      }
      case "evidence.read":
      case "evidence.open":
        return evidenceApi(method, params);
      case "draft.sendBack": {
        const p = sendBackParams(params);
        if (!p) throw new ApiError("Expected { dir, id, reason }.");
        return drafts.sendBack(allow(p.dir), p.id, p.reason);
      }
      case "draft.approve":
      case "draft.reject":
        return method === "draft.approve" ? review.approve(...card(params)) : review.reject(...card(params));
      case "feature.start":
        return starts.start(...card(params), starter(null));
      case "story.start":
        return spawns.start(...card(params));
      case "story.stop":
      case "story.resume":
        return method === "story.stop" ? stops.stop(...card(params)) : stops.resume(...card(params));
      case "story.accept":
        return acceptance.accept(...card(params));
      case "story.merge":
      case "story.hold":
      case "story.abandonCheck":
      case "story.abandon":
        return storyEnd(method, params);
      case "bug.propose":
      case "bug.file":
        return bugApi(method, params);
      case "feature.approve":
      case "feature.createPr":
      case "feature.rerunChecks":
      case "feature.merge":
      case "feature.askChanges":
      case "feature.dismissChanges":
        return featureApi(method, params);
      case "story.rerunChecks":
        return checks.rerun(...card(params));
      case "story.createPr":
        return prs.createPr(...card(params));
      case "prs.refresh":
        prs.focus();
        features?.focus();
        return null;
      case "proof.load":
      case "proof.set":
      case "preview.start":
      case "story.clearDesignReview":
        return proofApi(method, params);
      case "checks.load":
        return checkSettings.load(project(params));
      case "checks.set": {
        const p = checksSetParams(params);
        if (!p) throw new ApiError("Expected { dir, patch }.");
        return checkSettings.set(allow(p.dir), p.patch);
      }
      case "story.sendBack": {
        const p = storySendBackParams(params);
        if (!p) throw new ApiError("Expected { dir, id, reason }.");
        return acceptance.sendBack(allow(p.dir), p.id, p.reason, p.addCriterion);
      }
      case "roles.watch":
      case "roles.edit":
        return roleApi(method, params, id, connection);
      case "chat.roles":
      case "chat.start":
      case "chat.watch":
      case "chat.controls":
      case "chat.configure":
      case "chat.send":
      case "chat.stop":
      case "chat.archive":
      case "chat.approve":
      case "chat.answer":
      case "chat.undoLog":
      case "chat.list":
      case "inbox.watch":
      case "inbox.asked":
      case "needs.watch":
        return chatApi(method, params, id, connection);
      default:
        return assertNever(method);
    }
  };
  // The session manager's refusals are the user's to read, like the API's own.
  return (method, params, id, connection) =>
    answer(method, params, id, connection).catch((err: unknown) => {
      throw err instanceof ChatError ? new ApiError(err.message) : err;
    });
}
