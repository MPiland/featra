import {
  askedParams,
  assertNever,
  CHAT_MESSAGES,
  chatAnswerParams,
  chatApproveParams,
  chatConfigureParams,
  chatParams,
  chatSendParams,
  chatSnapshot,
  chatStartParams,
  chatUndoParams,
  inboxParams,
  type Inbox,
  type ServerMethod,
  type ServerMethods,
} from "@featra/work-format";
import type { AllowedProjects } from "./allowed-projects.ts";
import type { AgentBridge } from "./agent-bridge.ts";
import { ApiError } from "./api-error.ts";
import type { ChatManager } from "./chat-manager.ts";
import type { RoleRegistry } from "./role-registry.ts";
import type { Connection } from "./api.ts";

/** The methods about chats and the Inbox: a session's own requests, answered apart from the project and card ones. */
export type ChatApiMethod = Extract<ServerMethod, `chat.${string}` | `inbox.${string}`>;

export interface ChatApiDeps {
  chats: ChatManager;
  roles: RoleRegistry;
  allowed: AllowedProjects;
  /** Takes back what an agent logged; without it there is nothing to take back. */
  agents?: Pick<AgentBridge, "undo">;
  /** Throws unless `dir` is an open project. */
  allow: (dir: string) => string;
  /** The open project a request's `{ dir }` names. */
  project: (params: unknown) => string;
}

export function createChatApi({ chats, roles, allowed, agents, allow, project }: ChatApiDeps) {
  /** A chat in an open project, by the `{ id }` its method was sent. */
  const chat = (params: unknown): string => {
    const p = chatParams(params);
    if (!p) throw new ApiError("Expected { id }.");
    const dir = chats.dirOf(p.id);
    if (dir === null) throw new ApiError(CHAT_MESSAGES.noChat);
    allow(dir);
    return p.id;
  };

  return async (
    method: ChatApiMethod,
    params: unknown,
    id: number,
    connection: Connection,
  ): Promise<ServerMethods[ChatApiMethod]["result"]> => {
    switch (method) {
      case "chat.roles":
        return roles.list(project(params));
      case "chat.start": {
        const p = chatStartParams(params);
        if (!p) throw new ApiError("Expected { dir, role, card? }.");
        return { id: await chats.start(allow(p.dir), p.role, p.card) };
      }
      case "chat.watch": {
        const chatId = chat(params);
        await chats.open(chatId);
        const dir = chats.dirOf(chatId) ?? "";
        const { events, mode, note, stop } = chats.watch(chatId, (event) => {
          // A project closed since: say nothing more about it (its chats end with it, in services).
          if (allowed.has(dir)) connection.push("chat.event", id, event);
        });
        connection.keep(id, stop);
        return chatSnapshot(events, mode, note);
      }
      case "chat.controls":
        return chats.controls(chat(params));
      case "chat.configure": {
        const p = chatConfigureParams(params);
        if (!p) throw new ApiError("Expected { id, change }.");
        return chats.configure(chat(params), p.change);
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
      case "chat.approve": {
        const p = chatApproveParams(params);
        if (!p) throw new ApiError("Expected { id, tool, choice, reason? }.");
        chats.approve(chat(params), p.tool, p.answer);
        return null;
      }
      case "chat.answer": {
        const p = chatAnswerParams(params);
        if (!p) throw new ApiError("Expected { id, tool, answers }.");
        chats.answer(chat(params), p.tool, p.answers);
        return null;
      }
      case "chat.undoLog": {
        const p = chatUndoParams(params);
        if (!p) throw new ApiError("Expected { id, entry }.");
        if (!agents) throw new ApiError(CHAT_MESSAGES.noEntry);
        await agents.undo(chat(params), p.entry);
        return null;
      }
      case "chat.list": {
        const dir = project(params);
        await chats.ready();
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
      case "inbox.watch": {
        const p = inboxParams(params);
        if (!p) throw new ApiError("Expected { dir, waitMs }.");
        const dir = p.dir === undefined ? null : allow(p.dir);
        await chats.ready();
        // Chats of a project that is no longer open are closed with it, so one Inbox over every project never shows them.
        const open = (inbox: Inbox): Inbox =>
          dir === null ? { items: inbox.items.filter((i) => allowed.has(i.project ?? "")) } : inbox;
        const { inbox, stop } = chats.watchInbox(dir, p.waitMs, (next) => {
          if (dir === null || allowed.has(dir)) connection.push("inbox.list", id, open(next));
        });
        connection.keep(id, stop);
        return open(inbox);
      }
      case "inbox.asked": {
        const p = askedParams(params);
        if (!p) throw new ApiError("Expected { dir } or nothing.");
        const dir = p.dir === undefined ? null : allow(p.dir);
        connection.keep(
          id,
          chats.watchAsked(dir, (item) => {
            if (allowed.has(dir ?? item.project ?? "")) connection.push("inbox.asked", id, item);
          }),
        );
        return null;
      }
      default:
        return assertNever(method);
    }
  };
}
