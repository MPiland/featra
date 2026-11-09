import {
  assertNever,
  cardParams,
  cardUpdateParams,
  CHAT_MESSAGES,
  chatParams,
  chatSendParams,
  chatStartParams,
  copyParams,
  dirParams,
  setupParams,
  unwatchParams,
  type PushEvent,
  type ServerMethod,
  type ServerMethods,
  type ServerPushes,
} from "@featra/work-format";
import type { AllowedProjects } from "./allowed-projects.ts";
import { cardViewIn, type CardActions } from "./card-actions.ts";
import { ChatError, type ChatManager } from "./chat-manager.ts";
import type { CopyActions } from "./copy-actions.ts";
import type { Git } from "./git.ts";
import type { RoleRegistry } from "./role-registry.ts";
import { initFeatra, initGit, setupStatus } from "./project-setup.ts";
import { setUpProject, setupPlan } from "./project-setup-plan.ts";
import type { WorkWatches } from "./work-watch.ts";

/** A request the server refuses: its message goes back to the client as the response's `error`. */
export class ApiError extends Error {}

export interface ApiDeps {
  git: Git;
  allowed: AllowedProjects;
  watches: WorkWatches;
  copies: CopyActions;
  cards: CardActions;
  chats: ChatManager;
  roles: RoleRegistry;
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

export function createApi({ git, allowed, watches, copies, cards, chats, roles }: ApiDeps): Api {
  const allow = (dir: string) => {
    if (!allowed.has(dir)) throw new ApiError("Not an open project.");
    return dir;
  };
  const project = (params: unknown): string => {
    const p = dirParams(params);
    if (!p) throw new ApiError("Expected { dir }.");
    return allow(p.dir);
  };
  const copy = (params: unknown) => {
    const p = copyParams(params);
    if (!p) throw new ApiError("Expected { dir, key }.");
    allow(p.dir);
    return p;
  };
  /** A chat in an open project, by the `{ id }` its method was sent. */
  const chat = (params: unknown): string => {
    const p = chatParams(params);
    if (!p) throw new ApiError("Expected { id }.");
    const dir = chats.dirOf(p.id);
    if (dir === null) throw new ApiError(CHAT_MESSAGES.noChat);
    allow(dir);
    return p.id;
  };

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
        const { list, stop } = await watches.watch(dir, (next) => {
          // A project closed since: say nothing more about it.
          if (allowed.has(dir)) connection.push("work.list", id, next);
        });
        connection.keep(id, stop);
        return list;
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
          (scan) => cardViewIn(scan, p.id),
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
      case "chat.roles":
        return roles.list(project(params));
      case "chat.start": {
        const p = chatStartParams(params);
        if (!p) throw new ApiError("Expected { dir, role }.");
        return { id: await chats.start(allow(p.dir), p.role) };
      }
      case "chat.watch": {
        const chatId = chat(params);
        await chats.open(chatId);
        const dir = chats.dirOf(chatId) ?? "";
        const { events, stop } = chats.watch(chatId, (event) => {
          // A project closed since: say nothing more about it (its chats end with it, in services).
          if (allowed.has(dir)) connection.push("chat.event", id, event);
        });
        connection.keep(id, stop);
        return { events };
      }
      case "chat.send": {
        const p = chatSendParams(params);
        if (!p) throw new ApiError("Expected { id, text }.");
        const chatId = chat(params);
        await chats.open(chatId);
        chats.send(chatId, p.text);
        return null;
      }
      case "chat.stop":
        await chats.stop(chat(params));
        return null;
      case "chat.list": {
        const dir = project(params);
        const providers = await chats.providers();
        // Each push looks for the providers again, so one installed or removed while the app runs shows. Only the
        // newest push is sent: a slower lookup for an older one must not overwrite it.
        let latest = 0;
        const { chats: now, stop } = chats.watchList(dir, (next) => {
          const mine = ++latest;
          void chats.providers().then((found) => {
            if (mine === latest && allowed.has(dir))
              connection.push("chat.list", id, { providers: found, chats: next });
          });
        });
        connection.keep(id, () => {
          latest = -1; // a lookup still running when the watch ends sends nothing
          stop();
        });
        return { providers, chats: now };
      }
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
