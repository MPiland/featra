import {
  assertNever,
  cardParams,
  cardUpdateParams,
  copyParams,
  dirParams,
  roleEditParams,
  sendBackParams,
  storySendBackParams,
  checksSetParams,
  setupParams,
  starter,
  unwatchParams,
  type PushEvent,
  type ServerMethod,
  type ServerMethods,
  type ServerPushes,
} from "@featra/work-format";
import type { AllowedProjects } from "./allowed-projects.ts";
import type { AgentBridge } from "./agent-bridge.ts";
import { ApiError } from "./api-error.ts";
import { createChatApi } from "./api-chat.ts";
import { createBugApi } from "./api-bugs.ts";
import { createStoryEndApi } from "./api-story-end.ts";
import type { BugFiling } from "./bug-filing.ts";
import { cardViewIn, type CardActions } from "./card-actions.ts";
import { ChatError, type ChatManager } from "./chat-manager.ts";
import type { CopyActions } from "./copy-actions.ts";
import type { DraftActions } from "./draft-actions.ts";
import type { DraftReview } from "./draft-review.ts";
import type { FeatureStart } from "./feature-start.ts";
import type { StorySpawn } from "./story-spawn.ts";
import type { StoryAcceptance } from "./story-acceptance.ts";
import type { StoryMerge } from "./story-merge.ts";
import type { StoryAbandon } from "./story-abandon.ts";
import type { CheckSettings } from "./check-settings.ts";
import type { StoryChecks } from "./story-checks.ts";
import type { StoryPrs } from "./story-prs.ts";
import type { StoryStop } from "./story-stop.ts";
import type { Git } from "./git.ts";
import type { RoleRegistry } from "./role-registry.ts";
import type { RoleWatches } from "./role-watch.ts";
import { initFeatra, initGit, setupStatus } from "./project-setup.ts";
import { setUpProject, setupPlan } from "./project-setup-plan.ts";
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
  bugs,
  busy,
  checks,
  checkSettings,
  prs,
  chats,
  roles,
  roleWatches,
  agents,
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
  const copy = (params: unknown) => {
    const p = copyParams(params);
    if (!p) throw new ApiError("Expected { dir, key }.");
    allow(p.dir);
    return p;
  };
  const storyEnd = createStoryEndApi({ merges, abandons, allow });
  const bugApi = createBugApi({ bugs, allow });
  const chatApi = createChatApi({ chats, roles, allowed, agents, allow, project, ...(busy ? { busy } : {}) });

  const answer: Api = async (method, params, id, connection) => {
    switch (method) {
      case "project.setupStatus":
        return setupStatus(project(params), git);
      case "project.gitInit":
        return initGit(project(params), git);
      case "project.init":
        return initFeatra(project(params), git);
      case "project.setupPlan":
        return setupPlan(project(params), git);
      case "project.setup": {
        const p = setupParams(params);
        if (!p) throw new ApiError("Expected { dir, items }.");
        return setUpProject(allow(p.dir), p.items, git);
      }
      case "work.watch": {
        const dir = project(params);
        // The rows carry each story's PR state as last read (STORY-11), which a new read changes without a file event.
        const { value, stop } = await watches.observe(
          dir,
          (_scan, list) => prs.decorate(dir, list),
          (next) => {
            // A project closed since: say nothing more about it.
            if (allowed.has(dir)) connection.push("work.list", id, next);
          },
        );
        connection.keep(id, stop);
        return value;
      }
      case "work.unwatch": {
        const p = unwatchParams(params);
        if (!p) throw new ApiError("Expected { watch }.");
        connection.unwatch(p.watch);
        return null;
      }
      case "work.applyCopy": {
        const p = copy(params);
        return copies.apply(p.dir, p.key);
      }
      case "work.discardCopy": {
        const p = copy(params);
        return copies.discard(p.dir, p.key);
      }
      case "card.watch": {
        const p = cardParams(params);
        if (!p) throw new ApiError("Expected { dir, id }.");
        const dir = allow(p.dir);
        const { value, stop } = await watches.observe(
          dir,
          (scan) => cardViewIn(scan, p.id, checks.checksFor(dir, p.id), prs.prState(dir, p.id)),
          (next) => {
            if (allowed.has(dir)) connection.push("card.view", id, next);
          },
        );
        connection.keep(id, stop);
        return value;
      }
      case "card.update": {
        const p = cardUpdateParams(params);
        if (!p) throw new ApiError("Expected { dir, id, edit }.");
        return cards.update(allow(p.dir), p.id, p.edit);
      }
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
      case "story.abandonCheck":
      case "story.abandon":
        return storyEnd(method, params);
      case "bug.propose":
      case "bug.file":
        return bugApi(method, params);
      case "story.rerunChecks":
        return checks.rerun(...card(params));
      case "story.createPr":
        return prs.createPr(...card(params));
      case "prs.refresh":
        prs.focus();
        return null;
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
      case "roles.watch": {
        const dir = project(params);
        const { list, stop } = await roleWatches.watch(dir, (next) => {
          if (allowed.has(dir)) connection.push("roles.list", id, next);
        });
        connection.keep(id, stop);
        return list;
      }
      case "roles.edit": {
        const p = roleEditParams(params);
        if (!p) throw new ApiError("Expected { dir, edit }.");
        return roles.edit(allow(p.dir), p.edit);
      }
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
